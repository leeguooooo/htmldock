import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import worker from "../src/worker";
import { hashToken, sha256Hex, unixNow } from "../src/lib";

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
  failDelete = false;

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
    throw new Error("unsupported_test_r2_value");
  }

  async delete(keys: string | string[]): Promise<void> {
    if (this.failDelete) throw new Error("r2_delete_failed");
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }> {
    const keys = [...this.objects.keys()].filter((key) => !options?.prefix || key.startsWith(options.prefix)).sort();
    const start = options?.cursor ? Number(options.cursor) : 0;
    const limit = options?.limit || 1000;
    const page = keys.slice(start, start + limit);
    const next = start + page.length;
    return {
      objects: page.map((key) => ({ key })),
      truncated: next < keys.length,
      cursor: next < keys.length ? String(next) : undefined
    };
  }
}

interface Harness {
  db: TestD1Database;
  r2: TestR2Bucket;
  env: { DB: D1Database; DOCS: R2Bucket; HMAC_SECRET: string; APP_ORIGIN: string; CONTENT_ORIGIN: string };
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
    env: { DB: db, DOCS: r2, HMAC_SECRET: "test-secret", APP_ORIGIN: "https://app.test", CONTENT_ORIGIN: "https://content.test" }
  };
});

afterEach(() => {
  harness.db.sqlite.close();
});

describe("v0.5 teams and hard delete API", () => {
  test("T27 team create makes creator an admin", async () => {
    await seedUser(1, "admin@example.com");
    const token = await seedPat(1, ["docs:read", "docs:write", "share:write"]);

    const response = await api("/api/teams", { method: "POST", token, json: { slug: "acme-infra", name: "Acme Infra" } });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ team: { slug: "acme-infra", name: "Acme Infra", role: "admin" } });
    const member = harness.db.sqlite.query("SELECT role FROM team_members WHERE user_id = 1").get() as { role: string };
    expect(member.role).toBe("admin");
  });

  test("T28 non team member push is rejected", async () => {
    await seedUser(1, "admin@example.com");
    await seedUser(2, "outsider@example.com");
    await seedTeam("acme-infra", 1);
    const token = await seedPat(2, ["docs:write"]);

    const response = await upload(token, {
      team_slug: "acme-infra",
      project_slug: "cherry",
      git: { host: "github.com", owner: "leeguoo", repo: "cherry" }
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "not_team_member" });
  });

  test("T29 same git repo cannot be pushed into a second team", async () => {
    await seedUser(1, "admin@example.com");
    await seedUser(2, "other@example.com");
    await seedTeam("acme-infra", 1);
    await seedTeam("other-team", 2);
    const first = await seedPat(1, ["docs:write"]);
    const second = await seedPat(2, ["docs:write"]);

    expect((await upload(first, { team_slug: "acme-infra", project_slug: "cherry", git: gitCherry() })).status).toBe(201);
    const response = await upload(second, { team_slug: "other-team", project_slug: "cherry", git: gitCherry() });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "project_conflict" });
  });

  test("T30 owner can hard delete a doc and outsider cannot", async () => {
    await seedUser(1, "admin@example.com");
    await seedUser(2, "owner@example.com");
    await seedUser(3, "outsider@example.com");
    const teamId = await seedTeam("acme-infra", 1);
    await seedMember(teamId, 2, "member");
    const ownerToken = await seedPat(2, ["docs:write", "docs:delete"]);
    const outsiderToken = await seedPat(3, ["docs:delete"]);
    const uploadResponse = await upload(ownerToken, { team_slug: "acme-infra", project_slug: "cherry", git: gitCherry() });
    const { doc_id: docId } = (await uploadResponse.json()) as { doc_id: number };
    await harness.db.prepare("INSERT INTO shares (token, doc_id, created_by, created_at) VALUES ('share-token', ?, 2, ?)").bind(docId, unixNow()).run();

    const forbidden = await api(`/api/docs/${docId}`, { method: "DELETE", token: outsiderToken });
    expect(forbidden.status).toBe(403);

    const deleted = await api(`/api/docs/${docId}`, { method: "DELETE", token: ownerToken });
    expect(deleted.status).toBe(204);
    expect(harness.r2.objects.size).toBe(0);
    expect(harness.db.sqlite.query("SELECT COUNT(*) AS count FROM docs WHERE id = ?").get(docId)).toEqual({ count: 0 });
    expect(harness.db.sqlite.query("SELECT COUNT(*) AS count FROM shares WHERE doc_id = ?").get(docId)).toEqual({ count: 0 });
    expect(harness.db.sqlite.query("SELECT COUNT(*) AS count FROM docs_fts WHERE rowid = ?").get(docId)).toEqual({ count: 0 });
  });

  test("T31 project admin can hard delete project and non admin cannot", async () => {
    await seedUser(1, "admin@example.com");
    await seedUser(2, "member@example.com");
    const teamId = await seedTeam("acme-infra", 1);
    await seedMember(teamId, 2, "member");
    const adminToken = await seedPat(1, ["docs:write", "projects:delete"]);
    const memberToken = await seedPat(2, ["projects:delete"]);
    await upload(adminToken, { team_slug: "acme-infra", project_slug: "cherry", path: "a.html", git: gitCherry() });
    await upload(adminToken, { team_slug: "acme-infra", project_slug: "cherry", path: "b.html", git: gitCherry() });
    const project = harness.db.sqlite.query("SELECT id FROM projects WHERE slug = 'cherry'").get() as { id: number };

    const forbidden = await api(`/api/projects/${project.id}`, { method: "DELETE", token: memberToken, headers: { "X-Confirm": "yes" } });
    expect(forbidden.status).toBe(403);

    const deleted = await api(`/api/projects/${project.id}`, { method: "DELETE", token: adminToken, headers: { "X-Confirm": "yes" } });
    expect(deleted.status).toBe(204);
    expect(harness.r2.objects.size).toBe(0);
    expect(harness.db.sqlite.query("SELECT COUNT(*) AS count FROM docs WHERE project_id = ?").get(project.id)).toEqual({ count: 0 });
    expect(harness.db.sqlite.query("SELECT COUNT(*) AS count FROM projects WHERE id = ?").get(project.id)).toEqual({ count: 0 });
  });

  test("T32 D1 is not deleted when R2 delete fails", async () => {
    await seedUser(1, "admin@example.com");
    await seedTeam("acme-infra", 1);
    const token = await seedPat(1, ["docs:write", "docs:delete"]);
    const uploadResponse = await upload(token, { team_slug: "acme-infra", project_slug: "cherry", git: gitCherry() });
    const { doc_id: docId } = (await uploadResponse.json()) as { doc_id: number };
    harness.r2.failDelete = true;

    const response = await api(`/api/docs/${docId}`, { method: "DELETE", token });

    expect(response.status).toBe(502);
    expect(harness.db.sqlite.query("SELECT COUNT(*) AS count FROM docs WHERE id = ?").get(docId)).toEqual({ count: 1 });
  });

  test("T33 removing the last admin is rejected", async () => {
    await seedUser(1, "admin@example.com");
    await seedTeam("acme-infra", 1);
    const token = await seedPat(1, ["docs:read"]);

    const response = await api("/api/teams/acme-infra/members/1", { method: "DELETE", token });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "last_admin" });
  });

  test("T34 R2 key and doc URL do not expose git owner", async () => {
    await seedUser(1, "admin@example.com");
    await seedTeam("acme-infra", 1);
    const token = await seedPat(1, ["docs:write"]);

    const response = await upload(token, { team_slug: "acme-infra", project_slug: "cherry", git: gitCherry() });
    const payload = (await response.json()) as { url: string };
    const keys = [...harness.r2.objects.keys()];

    expect(response.status).toBe(201);
    expect(payload.url).toMatch(/\/d\/\d+$/);
    expect(keys).toEqual(["t/acme-infra/cherry/auth/login.html"]);
    expect(keys[0]).not.toContain("leeguoo");
  });
});

async function seedUser(id: number, email: string): Promise<void> {
  await harness.db.prepare("INSERT INTO users (id, lark_open_id, email, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, `open-${id}`, email, email.split("@")[0], unixNow())
    .run();
}

async function seedTeam(slug: string, adminUserId: number): Promise<number> {
  await harness.db.prepare("INSERT INTO teams (slug, name, created_by, created_at) VALUES (?, ?, ?, ?)")
    .bind(slug, slug, adminUserId, unixNow())
    .run();
  const team = harness.db.sqlite.query("SELECT id FROM teams WHERE slug = ?").get(slug) as { id: number };
  await seedMember(team.id, adminUserId, "admin");
  return team.id;
}

async function seedMember(teamId: number, userId: number, role: "admin" | "member"): Promise<void> {
  await harness.db.prepare("INSERT INTO team_members (team_id, user_id, role, added_at) VALUES (?, ?, ?, ?)")
    .bind(teamId, userId, role, unixNow())
    .run();
}

async function seedPat(userId: number, scopes: string[]): Promise<string> {
  const token = `test-token-${userId}-${scopes.join("-")}-${Math.random()}`;
  await harness.db
    .prepare(
      `INSERT INTO personal_access_tokens (user_id, token_prefix, token_hash, name, scopes, expires_at, created_at)
       VALUES (?, ?, ?, 'test', ?, ?, ?)`
    )
    .bind(userId, token.slice(0, 18), await hashToken(token), JSON.stringify(scopes), unixNow() + 86400, unixNow())
    .run();
  return token;
}

function gitCherry(): { host: string; owner: string; repo: string } {
  return { host: "github.com", owner: "leeguoo", repo: "cherry" };
}

async function upload(
  token: string,
  metadata: {
    team_slug: string;
    project_slug: string;
    path?: string;
    git: { host: string; owner: string; repo: string };
  }
): Promise<Response> {
  const html = "<!doctype html><title>Login</title><h1>Hello</h1>";
  const filePath = metadata.path || "auth/login.html";
  const form = new FormData();
  form.set("file", new File([html], filePath.split("/").at(-1) || "doc.html", { type: "text/html" }));
  form.set(
    "metadata",
    JSON.stringify({
      team_slug: metadata.team_slug,
      project_slug: metadata.project_slug,
      source_path: `docs/${filePath}`,
      path: filePath,
      title: "Login",
      sha256: await sha256Hex(html),
      visibility: "team",
      git: metadata.git
    })
  );
  return worker.fetch(
    new Request("https://app.test/api/docs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    }),
    harness.env
  );
}

async function api(
  path: string,
  options: { method: string; token: string; json?: unknown; headers?: Record<string, string> }
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${options.token}`);
  if (options.json !== undefined) headers.set("Content-Type", "application/json");
  return worker.fetch(
    new Request(`https://app.test${path}`, {
      method: options.method,
      headers,
      body: options.json === undefined ? undefined : JSON.stringify(options.json)
    }),
    harness.env
  );
}
