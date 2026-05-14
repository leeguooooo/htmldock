import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const cliPath = resolve(import.meta.dir, "../src/cli.ts");
const preloadPath = resolve(import.meta.dir, "./mock-fetch.ts");

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  requests: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
  }>;
}

describe("cli v0.5 commands", () => {
  test("team create posts slug and name", async () => {
    const home = tempDir();
    writeConfig(home);

    const result = await runCli(["team", "create", "acme-infra", "Acme Infra"], {
      home,
      queue: [{ body: { team: { slug: "acme-infra", name: "Acme Infra" } } }]
    });

    expect(result.exitCode).toBe(0);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].url).toBe("https://example.test/api/teams");
    expect(result.requests[0].method).toBe("POST");
    expect(JSON.parse(result.requests[0].body as string)).toEqual({ slug: "acme-infra", name: "Acme Infra" });
  });

  test("push rejects project config without required team", async () => {
    const home = tempDir();
    writeConfig(home);
    const repo = tempDir();
    git(repo, "init");
    writeFileSync(join(repo, ".htmldock.toml"), 'sync = true\nvisibility = "team"\n');
    writeFileSync(join(repo, "doc.html"), "<html><title>Doc</title><body>Hi</body></html>");

    const result = await runCli(["push", "doc.html"], { cwd: repo, home });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("team is required in .htmldock.toml");
    expect(result.requests).toHaveLength(0);
  });

  test("delete doc without --yes refuses in non-tty", async () => {
    const home = tempDir();
    writeConfig(home);

    const result = await runCli(["delete", "42"], { home });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Pass --yes to skip confirmation");
    expect(result.requests).toHaveLength(0);
  });

  test("delete doc with --yes sends confirm header", async () => {
    const home = tempDir();
    writeConfig(home);

    const result = await runCli(["delete", "42", "--yes"], {
      home,
      queue: [{ status: 204 }]
    });

    expect(result.exitCode).toBe(0);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].url).toBe("https://example.test/api/docs/42");
    expect(result.requests[0].method).toBe("DELETE");
    expect(result.requests[0].headers["x-confirm"]).toBe("yes");
  });

  test("project delete looks up project id before deleting", async () => {
    const home = tempDir();
    writeConfig(home);

    const result = await runCli(["project", "delete", "acme-infra/cherry", "--yes"], {
      home,
      queue: [{ body: { projects: [{ id: 123, slug: "cherry" }] } }, { status: 204 }]
    });

    expect(result.exitCode).toBe(0);
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0].url).toBe("https://example.test/api/projects?team_slug=acme-infra&project_slug=cherry");
    expect(result.requests[0].method).toBe("GET");
    expect(result.requests[1].url).toBe("https://example.test/api/projects/123");
    expect(result.requests[1].method).toBe("DELETE");
    expect(result.requests[1].headers["x-confirm"]).toBe("yes");
  });
});

async function runCli(
  args: string[],
  options: { cwd?: string; home: string; queue?: unknown[] }
): Promise<CliResult> {
  const logPath = join(tempDir(), "fetch-log.jsonl");
  const proc = Bun.spawn([process.execPath, "--preload", preloadPath, cliPath, ...args], {
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      HOME: options.home,
      MOCK_FETCH_LOG: logPath,
      MOCK_FETCH_QUEUE: JSON.stringify(options.queue || [])
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });
  proc.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  return {
    exitCode,
    stdout,
    stderr,
    requests: existsSync(logPath)
      ? readFileSync(logPath, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : []
  };
}

function writeConfig(home: string): void {
  const path = join(home, ".config/htmldock/config.toml");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'server_url = "https://example.test"\npat = "test_pat"\n');
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "htmldock-cli-"));
}

function git(cwd: string, command: string): void {
  const proc = Bun.spawnSync(["git", ...command.split(" ")], { cwd, stdout: "pipe", stderr: "pipe" });
  if (!proc.success) throw new Error(new TextDecoder().decode(proc.stderr));
}
