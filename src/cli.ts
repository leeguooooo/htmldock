#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import {
  assertDisplayPath,
  deriveDisplayPath,
  extractTitle,
  parseRemoteUrl,
  sha256Hex,
  type Visibility
} from "./lib";

interface Config {
  server_url?: string;
  pat?: string;
  default_project_sync?: "off" | "on" | "ask";
}

interface ProjectConfig {
  sync?: boolean;
  visibility?: Visibility;
  module_root?: string;
}

const DEFAULT_SERVER = "https://htmldock.pwtk-dev.work";
const CONFIG_PATH = `${homedir()}/.config/htmldock/config.toml`;
const [command, ...args] = Bun.argv.slice(2);

try {
  if (command === "init") {
    init(args.includes("--yes"));
  } else if (command === "login") {
    await login(args);
  } else if (command === "config") {
    configCommand(args);
  } else if (command === "logout") {
    logout();
  } else if (command === "push") {
    await push(args);
  } else if (command === "list") {
    await list(args);
  } else if (command === "share") {
    await share(args);
  } else if (command === "open") {
    await openDoc(args);
  } else if (command === "whoami") {
    whoami();
  } else if (command === "--version" || command === "-v" || command === "version") {
    console.log("htmldock 0.1.0");
  } else {
    usage();
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function init(yes: boolean): void {
  const root = git("rev-parse --show-toplevel", process.cwd());
  const path = `${root}/.htmldock.toml`;
  if (existsSync(path) && !yes) {
    throw new Error(".htmldock.toml already exists");
  }
  writeFileSync(
    path,
    `sync = true\nvisibility = "team"\ndefault_owner = ""\nmodule_root = ""\nignore = ["draft/**", "scratch/*.html"]\nauto_module = true\n`
  );
  console.log(`Wrote ${path}`);
}

async function login(args: string[]): Promise<void> {
  const existing = readGlobalConfig();
  const server = normalizeServer(argsValue(args, "--server") || existing.server_url || DEFAULT_SERVER);
  const completed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      localServer.stop(true);
      reject(new Error("Login timed out"));
    }, 5 * 60 * 1000);

    const localServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
        if (request.method !== "POST" || url.pathname !== "/save") return cors(new Response("Not found", { status: 404 }));

        const payload = (await request.json().catch(() => null)) as null | Config;
        if (!payload?.server_url || !payload.pat) return cors(new Response("Invalid payload", { status: 400 }));
        writeGlobalConfig({ ...existing, server_url: payload.server_url, pat: payload.pat });
        clearTimeout(timeout);
        localServer.stop(true);
        resolve();
        return cors(new Response("htmldock CLI login complete. You can close this tab."));
      }
    });

    const callback = `http://127.0.0.1:${localServer.port}/save`;
    const loginUrl = `${server}/cli/login?cb=${encodeURIComponent(callback)}`;
    openUrl(loginUrl);
    console.log(`Opening ${loginUrl}`);
  });

  await completed;
  console.log(`Logged in to ${server}`);
}

function configCommand(args: string[]): void {
  const subcommand = args[0];
  if (subcommand !== "set-token") {
    throw new Error("Usage: htmldock config set-token <token> --server https://your-htmldock.example.com");
  }
  const token = args.find((arg, index) => index > 0 && !arg.startsWith("-"));
  if (!token) throw new Error("Missing token");
  const existing = readGlobalConfig();
  const server = normalizeServer(argsValue(args, "--server") || existing.server_url || DEFAULT_SERVER);
  writeGlobalConfig({ ...existing, server_url: server, pat: token });
  console.log(`Configured htmldock for ${server}`);
}

function logout(): void {
  const config = readGlobalConfig();
  writeGlobalConfig({ ...config, pat: undefined });
  console.log("Logged out");
}

async function push(args: string[]): Promise<void> {
  const fileArg = args.find((arg) => !arg.startsWith("-"));
  if (!fileArg) throw new Error("Missing file");
  const filePath = resolve(fileArg);
  if (!filePath.endsWith(".html") || !existsSync(filePath)) throw new Error("File must exist and end with .html");

  const globalConfig = readGlobalConfig();
  const root = git("rev-parse --show-toplevel", dirname(filePath));
  const projectConfigPath = `${root}/.htmldock.toml`;
  const projectConfig = existsSync(projectConfigPath) ? readProjectConfig(projectConfigPath) : null;
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");

  if (!force) {
    if (!projectConfig) {
      const fallback = globalConfig.default_project_sync || "off";
      if (fallback !== "on") {
        console.log('Sync disabled. Run "htmldock init" to enable sync.');
        return;
      }
    } else if (!projectConfig.sync) {
      console.log("Sync disabled by .htmldock.toml");
      return;
    }
  }

  const remotes = git("remote -v", root);
  const origin = remotes
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find(([name, , kind]) => name === "origin" && kind === "(fetch)");
  if (!origin?.[1]) throw new Error("No git origin remote found");
  const project = parseRemoteUrl(origin[1]);

  const sourcePath = relative(root, filePath).replace(/\\/g, "/");
  const displayPath = deriveDisplayPath(sourcePath, projectConfig?.module_root || "");
  assertDisplayPath(displayPath);

  const html = readFileSync(filePath, "utf8");
  const sha256 = await sha256Hex(html);
  const title = extractTitle(html, basename(filePath));
  const visibility = args.includes("--public") ? "public-allowed" : projectConfig?.visibility || "team";
  const server = configuredServer(args);

  const metadata = {
    project,
    source_path: sourcePath,
    path: displayPath,
    title,
    sha256,
    visibility,
    remote: { name: "origin", url: origin[1] }
  };

  if (dryRun) {
    console.log(JSON.stringify({ server, metadata }, null, 2));
    return;
  }

  const payload = await apiFetch(server, "/api/docs", {
    method: "POST",
    body: (() => {
      const body = new FormData();
      body.set("metadata", JSON.stringify(metadata));
      body.set("file", new Blob([html], { type: "text/html" }), basename(filePath));
      return body;
    })()
  });
  console.log(`Published: ${payload.url}`);
}

async function list(args: string[]): Promise<void> {
  const server = configuredServer(args);
  const limit = argsValue(args, "--limit") || "20";
  const payload = await apiFetch(server, `/api/docs?limit=${encodeURIComponent(limit)}`, { method: "GET" });
  if (args.includes("--json")) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  for (const doc of payload.docs || []) {
    console.log(`${doc.id}\t${doc.visibility}\t${doc.path}\t${doc.title || ""}`);
  }
}

async function share(args: string[]): Promise<void> {
  const docId = Number(args.find((arg) => !arg.startsWith("-")));
  if (!Number.isInteger(docId) || docId <= 0) throw new Error("Usage: htmldock share <doc-id> [--ttl-days 30]");
  const server = configuredServer(args);
  const ttl = argsValue(args, "--ttl-days");
  const payload = await apiFetch(server, "/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc_id: docId, ttl_days: ttl ? Number(ttl) : undefined })
  });
  console.log(payload.public_url);
}

async function openDoc(args: string[]): Promise<void> {
  const docId = Number(args.find((arg) => !arg.startsWith("-")));
  if (!Number.isInteger(docId) || docId <= 0) throw new Error("Usage: htmldock open <doc-id>");
  const server = configuredServer(args);
  const url = `${server}/d/${docId}`;
  openUrl(url);
  console.log(url);
}

function whoami(): void {
  const config = readGlobalConfig();
  console.log(JSON.stringify({ server_url: config.server_url, has_pat: Boolean(config.pat) }, null, 2));
}

async function apiFetch(server: string, path: string, init: RequestInit): Promise<any> {
  const config = readGlobalConfig();
  if (!config.pat) throw new Error(`Missing pat in ${CONFIG_PATH}. Run "htmldock login".`);
  const response = await fetch(`${server}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${config.pat}`
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload;
}

function configuredServer(args: string[]): string {
  const config = readGlobalConfig();
  const server = argsValue(args, "--server") || config.server_url || DEFAULT_SERVER;
  return normalizeServer(server);
}

function readGlobalConfig(): Config {
  return existsSync(CONFIG_PATH) ? parseSimpleToml(readFileSync(CONFIG_PATH, "utf8")) : {};
}

function writeGlobalConfig(config: Config): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  const lines = [
    `server_url = "${config.server_url || DEFAULT_SERVER}"`,
    config.pat ? `pat = "${config.pat}"` : "",
    config.default_project_sync ? `default_project_sync = "${config.default_project_sync}"` : ""
  ].filter(Boolean);
  writeFileSync(CONFIG_PATH, `${lines.join("\n")}\n`);
}

function readProjectConfig(path: string): ProjectConfig {
  return parseSimpleToml(readFileSync(path, "utf8"));
}

function parseSimpleToml<T extends Record<string, unknown>>(text: string): T {
  const result: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*(?:#.*)?$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (raw === "true" || raw === "false") result[key] = raw === "true";
    else result[key] = raw.replace(/^"|"$/g, "");
  }
  return result as T;
}

function argsValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function normalizeServer(server: string): string {
  return server.replace(/\/+$/, "");
}

function openUrl(url: string): void {
  if (process.platform === "darwin") {
    Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
  }
}

function cors(response: Response): Response {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return response;
}

function git(command: string, cwd: string): string {
  const proc = Bun.spawnSync(["git", ...command.split(" ")], { cwd, stdout: "pipe", stderr: "pipe" });
  if (!proc.success) throw new Error(new TextDecoder().decode(proc.stderr).trim());
  return new TextDecoder().decode(proc.stdout).trim();
}

function usage(): void {
  console.error("Usage: htmldock <init|login|config|logout|push|list|share|open|whoami>");
}
