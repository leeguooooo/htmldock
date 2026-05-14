import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import worker from "../src/worker";
import { sha256Hex } from "../src/lib";

class TestD1Statement implements D1PreparedStatement {
  private values: unknown[] = [];
  constructor(private readonly db: Database, private readonly query: string) {}
  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }
  async first<T = unknown>(column?: string): Promise<T | null> {
    const row = this.db.query(this.query).get(...this.values) as Record<string, unknown> | null;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }
  async all<T = unknown>(): Promise<D1Result<T>> {
    return { results: this.db.query(this.query).all(...this.values) as T[], success: true, meta: {} };
  }
  async run<T = unknown>(): Promise<D1Result<T>> {
    this.db.query(this.query).run(...this.values);
    return { success: true, meta: {} };
  }
}
class TestD1Database implements D1Database {
  constructor(readonly sqlite: Database) {}
  prepare(query: string): D1PreparedStatement {
    return new TestD1Statement(this.sqlite, query);
  }
  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const run = this.sqlite.transaction(() => Promise.all(statements.map((statement) => statement.run<T>())));
    return run();
  }
}
class TestR2Bucket implements R2Bucket {
  readonly objects = new Map<string, string>();
  async get(key: string): Promise<R2ObjectBody | null> {
    const value = this.objects.get(key);
    if (value === undefined) return null;
    return { body: new Response(value).body! };
  }
  async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream): Promise<unknown> {
    if (typeof value === "string") {
      this.objects.set(key, value);
      return {};
    }
    throw new Error("unsupported");
  }
  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
  async list(): Promise<{ objects: { key: string }[]; truncated: boolean }> {
    return { objects: [...this.objects.keys()].map((key) => ({ key })), truncated: false };
  }
}

interface Harness {
  db: TestD1Database;
  r2: TestR2Bucket;
  env: { DB: D1Database; DOCS: R2Bucket; HMAC_SECRET: string; APP_ORIGIN: string; CONTENT_ORIGIN: string; PERSONAL_MODE: string; PERSONAL_WRITE_SECRET: string };
}
let harness: Harness;

beforeEach(() => {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of ["migrations/0001_init.sql", "migrations/0002_sessions.sql", "migrations/0003_teams.sql"]) {
    sqlite.exec(readFileSync(migration, "utf8"));
  }
  const db = new TestD1Database(sqlite);
  const r2 = new TestR2Bucket();
  harness = {
    db,
    r2,
    env: {
      DB: db, DOCS: r2,
      HMAC_SECRET: "test-secret",
      APP_ORIGIN: "https://app.test",
      CONTENT_ORIGIN: "https://content.test",
      PERSONAL_MODE: "true",
      PERSONAL_WRITE_SECRET: "shhh-personal-key"
    }
  };
});

afterEach(() => {
  harness.db.sqlite.close();
});

describe("personal mode", () => {
  test("T39 /api/mode reports personal and requires_write_secret", async () => {
    const response = await worker.fetch(new Request("https://app.test/api/mode"), harness.env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "personal", requires_write_secret: true, personal_team_slug: "personal" });
  });

  test("T40 /api/docs read is anonymous in personal mode", async () => {
    // bootstrap personal seed by hitting /api/mode (route() calls ensurePersonalSeed)
    await worker.fetch(new Request("https://app.test/api/mode"), harness.env);
    const response = await worker.fetch(new Request("https://app.test/api/docs"), harness.env);
    expect(response.status).toBe(200);
    expect((await response.json()) as { docs: unknown[] }).toMatchObject({ docs: [] });
  });

  test("T41 POST /api/docs rejected without X-Personal-Secret", async () => {
    await worker.fetch(new Request("https://app.test/api/mode"), harness.env);
    const form = new FormData();
    form.set("file", new File(["<h1>x</h1>"], "x.html", { type: "text/html" }));
    form.set("metadata", JSON.stringify({
      team_slug: "personal", project_slug: "diary",
      source_path: "x.html", path: "x.html", title: "x",
      sha256: await sha256Hex("<h1>x</h1>"), visibility: "team",
      git: { host: "local", owner: "me", repo: "diary" }
    }));
    const response = await worker.fetch(
      new Request("https://app.test/api/docs", { method: "POST", body: form }),
      harness.env
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthorized" });
  });

  test("T42 POST /api/docs accepts valid X-Personal-Secret and binds to personal user", async () => {
    await worker.fetch(new Request("https://app.test/api/mode"), harness.env);
    const html = "<!doctype html><title>diary</title><p>hello</p>";
    const form = new FormData();
    form.set("file", new File([html], "today.html", { type: "text/html" }));
    form.set("metadata", JSON.stringify({
      team_slug: "personal", project_slug: "diary",
      source_path: "today.html", path: "today.html", title: "diary",
      sha256: await sha256Hex(html), visibility: "team",
      git: { host: "local", owner: "me", repo: "diary" }
    }));

    // ensure project first
    await worker.fetch(
      new Request("https://app.test/api/projects/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Personal-Secret": "shhh-personal-key" },
        body: JSON.stringify({ team_slug: "personal", project_slug: "diary", git: { host: "local", owner: "me", repo: "diary" } })
      }),
      harness.env
    );

    const response = await worker.fetch(
      new Request("https://app.test/api/docs", {
        method: "POST",
        headers: { "X-Personal-Secret": "shhh-personal-key" },
        body: form
      }),
      harness.env
    );
    expect(response.status).toBe(201);
    const doc = harness.db.sqlite.query("SELECT owner_user_id FROM docs").get() as { owner_user_id: number };
    expect(doc.owner_user_id).toBe(1);
  });

  test("T43 wrong X-Personal-Secret returns 401", async () => {
    await worker.fetch(new Request("https://app.test/api/mode"), harness.env);
    const response = await worker.fetch(
      new Request("https://app.test/api/projects/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Personal-Secret": "wrong" },
        body: JSON.stringify({ team_slug: "personal", project_slug: "diary", git: { host: "local", owner: "me", repo: "diary" } })
      }),
      harness.env
    );
    expect(response.status).toBe(401);
  });
});
