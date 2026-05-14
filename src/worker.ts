import {
  assertDisplayPath,
  escapeHtml,
  extractBodyText,
  extractTitle,
  hashToken,
  isAllowedLocalCallback,
  r2Key,
  randomToken,
  sha256Hex,
  signViewToken,
  unixNow,
  verifyViewToken,
  type ProjectCoordinate,
  type Visibility
} from "./lib";

interface Env {
  DB: D1Database;
  DOCS: R2Bucket;
  APP_ORIGIN?: string;
  CONTENT_ORIGIN?: string;
  HMAC_SECRET?: string;
  LARK_CLIENT_ID?: string;
  LARK_CLIENT_SECRET?: string;
  LARK_REDIRECT_ALLOWLIST?: string;
}

interface TokenUser {
  user_id: number;
  scopes: string[];
}

interface LarkAccessTokenResponse {
  code: number;
  msg?: string;
  data?: {
    access_token?: string;
    user_id?: string;
    open_id?: string;
    name?: string;
    en_name?: string;
    avatar_url?: string;
    email?: string;
  };
}

interface LarkUserInfoResponse {
  code: number;
  msg?: string;
  data?: {
    open_id?: string;
    user_id?: string;
    name?: string;
    en_name?: string;
    avatar_url?: string;
    email?: string;
  };
}

interface DocRow {
  id: number;
  project_id: number;
  source_path: string;
  path: string;
  title: string | null;
  visibility: Visibility;
  r2_key: string;
  owner_user_id: number | null;
  size_bytes: number;
  sha256: string;
  created_at: number;
  updated_at: number;
  host?: string;
  owner?: string;
  repo?: string;
}

const MAX_HTML_BYTES = 2 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(error);
      return json({ error: "internal_error" }, 500);
    }
  }
};

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/health") {
    return json({ ok: true, service: "htmldock" });
  }

  if (request.method === "GET" && (path === "/" || path === "/dashboard")) {
    return dashboard(request, env);
  }

  if (request.method === "GET" && path === "/api/auth/lark") {
    return startLarkAuth(request, env, "browser");
  }

  if (request.method === "GET" && path === "/cli/login") {
    return startLarkAuth(request, env, "cli");
  }

  if (request.method === "GET" && path === "/api/auth/lark/callback") {
    return finishLarkAuth(request, env);
  }

  if (request.method === "GET" && path === "/api/me") {
    return me(request, env);
  }

  if (request.method === "GET" && path === "/api/pats") {
    return listPats(request, env);
  }

  if (request.method === "POST" && path === "/api/pats") {
    return createPat(request, env);
  }

  const pat = path.match(/^\/api\/pats\/(\d+)$/);
  if (request.method === "DELETE" && pat) {
    return revokePat(Number(pat[1]), request, env);
  }

  if (request.method === "GET" && path === "/api/docs/check") {
    return checkDoc(request, env);
  }

  if (request.method === "GET" && path === "/api/docs") {
    return listDocs(request, env);
  }

  if (request.method === "POST" && path === "/api/docs") {
    return uploadDoc(request, env);
  }

  if (request.method === "GET" && path === "/api/search") {
    return searchDocs(request, env);
  }

  if (request.method === "POST" && path === "/api/share") {
    return createShare(request, env);
  }

  const privateDoc = path.match(/^\/d\/(\d+)$/);
  if (request.method === "GET" && privateDoc) {
    return openPrivateDoc(Number(privateDoc[1]), request, env);
  }

  const view = path.match(/^\/v\/([A-Za-z0-9_.-]+)$/);
  if (request.method === "GET" && view) {
    return openViewToken(view[1], request, env);
  }

  const rawView = path.match(/^\/raw\/view\/([A-Za-z0-9_.-]+)$/);
  if (request.method === "GET" && rawView) {
    return rawViewToken(rawView[1], env);
  }

  const publicShare = path.match(/^\/p\/([A-Za-z0-9_-]+)$/);
  if (request.method === "GET" && publicShare) {
    return openPublicShare(publicShare[1], request, env);
  }

  const rawShare = path.match(/^\/raw\/share\/([A-Za-z0-9_-]+)$/);
  if (request.method === "GET" && rawShare) {
    return rawPublicShare(rawShare[1], env);
  }

  return html("<h1>Not found</h1>", 404);
}

async function dashboard(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  const docs = await env.DB.prepare(
    `SELECT docs.id, docs.title, docs.path, docs.visibility, docs.updated_at, projects.host, projects.owner, projects.repo
     FROM docs JOIN projects ON projects.id = docs.project_id
     ORDER BY docs.updated_at DESC LIMIT 50`
  ).all<DocRow>();

  const rows = (docs.results || [])
    .map((doc) => {
      const project = `${doc.host}/${doc.owner}/${doc.repo}`;
      return `<tr><td><a href="/d/${doc.id}">${escapeHtml(doc.title || doc.path)}</a></td><td>${escapeHtml(project)}</td><td>${escapeHtml(doc.visibility)}</td><td>${new Date(doc.updated_at * 1000).toISOString()}</td></tr>`;
    })
    .join("");

  return html(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>htmldock</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;color:#1f2937;background:#fafafa}
main{max-width:980px;margin:0 auto;padding:28px 20px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
h1{font-size:22px;margin:0} a{color:#0f766e;text-decoration:none} table{width:100%;border-collapse:collapse;background:white;border:1px solid #e5e7eb}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #e5e7eb} th{font-size:12px;color:#6b7280;text-transform:uppercase}
section{margin:18px 0}.panel{background:white;border:1px solid #e5e7eb;padding:14px}.muted{color:#6b7280}input,button{font:inherit;padding:6px 8px}
code{background:#f3f4f6;padding:2px 4px;border-radius:4px;word-break:break-all}
</style>
</head>
<body><main><header><h1>htmldock</h1><form action="/api/search"><input name="q" placeholder="Search docs"><button>Search</button></form></header>
<section class="panel">
${user ? `<p>Signed in as <strong>${escapeHtml(user.name || user.email || `User ${user.id}`)}</strong>.</p>
<form id="pat-form"><input name="name" value="CLI token" aria-label="Token name"><button>Create CLI token</button></form>
<p id="pat-output" class="muted">Tokens are shown once. Use <code>bun src/cli.ts login</code> for browser-based setup, or paste the generated PAT into <code>~/.config/htmldock/config.toml</code>.</p>` : `<p class="muted">Sign in to open private documents and create CLI tokens.</p><p><a href="/api/auth/lark">Sign in with Lark</a></p>`}
</section>
<table><thead><tr><th>Document</th><th>Project</th><th>Visibility</th><th>Updated</th></tr></thead><tbody>${rows || `<tr><td colspan="4">No documents yet.</td></tr>`}</tbody></table>
<p><a href="/health">Health</a></p>
<script>
const form = document.getElementById("pat-form");
if (form) form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const output = document.getElementById("pat-output");
  const name = new FormData(form).get("name") || "CLI token";
  const response = await fetch("/api/pats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  const payload = await response.json();
  output.innerHTML = response.ok ? 'PAT: <code>' + payload.token + '</code>' : 'Error: <code>' + (payload.error || response.status) + '</code>';
});
</script>
</main></body></html>`);
}

async function me(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  return json({ user });
}

async function listPats(request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const result = await env.DB.prepare(
    `SELECT id, token_prefix, name, scopes, last_used_at, expires_at, revoked_at, created_at
     FROM personal_access_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  )
    .bind(user.user_id)
    .all<{
      id: number;
      token_prefix: string;
      name: string | null;
      scopes: string;
      last_used_at: number | null;
      expires_at: number | null;
      revoked_at: number | null;
      created_at: number;
    }>();
  return json({
    tokens: (result.results || []).map((token) => ({
      ...token,
      scopes: JSON.parse(token.scopes || "[]")
    }))
  });
}

async function createPat(request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = (await request.json().catch(() => ({}))) as { name?: string; scopes?: string[]; ttl_days?: number };
  const scopes = normalizePatScopes(body.scopes);
  const ttlDays = typeof body.ttl_days === "number" ? Math.max(1, Math.min(body.ttl_days, 365)) : 365;
  const token = await createPersonalAccessToken(env, user.user_id, body.name || "CLI token", scopes, unixNow() + ttlDays * 86400);
  return json({ token: token.value, token_prefix: token.prefix, scopes, expires_at: token.expires_at }, 201);
}

async function revokePat(id: number, request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  await env.DB.prepare("UPDATE personal_access_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
    .bind(unixNow(), id, user.user_id)
    .run();
  return json({ ok: true });
}

async function checkDoc(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const owner = url.searchParams.get("owner");
  const repo = url.searchParams.get("repo");
  const path = url.searchParams.get("path");
  const sha256 = url.searchParams.get("sha256");
  if (!host || !owner || !repo || !path || !sha256) return json({ error: "invalid_metadata" }, 400);

  const row = await env.DB.prepare(
    `SELECT docs.id, docs.updated_at FROM docs
     JOIN projects ON projects.id = docs.project_id
     WHERE projects.host = ? AND projects.owner = ? AND projects.repo = ? AND docs.path = ? AND docs.sha256 = ?`
  )
    .bind(host, owner, repo, path, sha256)
    .first<{ id: number; updated_at: number }>();
  return json({ up_to_date: Boolean(row), doc: row || null });
}

async function uploadDoc(request: Request, env: Env): Promise<Response> {
  const user = await authenticate(request, env, "docs:write");
  if (user instanceof Response) return user;

  const form = await request.formData();
  const file = form.get("file");
  const metadataField = form.get("metadata");
  if (!(file instanceof File) || typeof metadataField !== "string") {
    return json({ error: "invalid_metadata" }, 400);
  }

  const htmlText = await file.text();
  const size = new TextEncoder().encode(htmlText).byteLength;
  if (size > MAX_HTML_BYTES) return json({ error: "file_too_large", max_bytes: MAX_HTML_BYTES }, 413);

  const metadata = parseMetadata(metadataField);
  if (!metadata) return json({ error: "invalid_metadata" }, 400);

  try {
    assertDisplayPath(metadata.path);
  } catch (error) {
    return json({ error: String(error instanceof Error ? error.message : error) }, 400);
  }

  const actualSha = await sha256Hex(htmlText);
  if (metadata.sha256 && metadata.sha256 !== actualSha) {
    return json({ error: "sha256_mismatch", expected: actualSha }, 400);
  }

  const now = unixNow();
  const projectId = await upsertProject(env.DB, metadata.project, now);
  const key = r2Key(metadata.project, metadata.path);
  const title = metadata.title || extractTitle(htmlText, file.name || metadata.path.split("/").at(-1) || "Untitled");
  const bodyText = extractBodyText(htmlText);

  const existing = await env.DB.prepare("SELECT * FROM docs WHERE project_id = ? AND path = ?")
    .bind(projectId, metadata.path)
    .first<DocRow>();

  if (existing?.sha256 === actualSha) {
    return json({
      status: "up_to_date",
      doc_id: existing.id,
      url: `${appOrigin(request, env)}/d/${existing.id}`
    });
  }

  await env.DOCS.put(key, htmlText, { httpMetadata: { contentType: "text/html; charset=utf-8" } });

  if (existing) {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE docs SET source_path = ?, title = ?, visibility = ?, r2_key = ?, owner_user_id = ?, size_bytes = ?, sha256 = ?, updated_at = ?
         WHERE id = ?`
      ).bind(metadata.source_path, title, metadata.visibility, key, user.user_id, size, actualSha, now, existing.id),
      env.DB.prepare("INSERT INTO docs_fts(docs_fts, rowid, title, body_text) VALUES ('delete', ?, ?, '')").bind(
        existing.id,
        existing.title || ""
      ),
      env.DB.prepare("INSERT INTO docs_fts(rowid, title, body_text) VALUES (?, ?, ?)").bind(existing.id, title, bodyText)
    ]);
    return json({ status: "updated", doc_id: existing.id, url: `${appOrigin(request, env)}/d/${existing.id}` });
  }

  await env.DB.prepare(
    `INSERT INTO docs (project_id, source_path, path, title, visibility, r2_key, owner_user_id, size_bytes, sha256, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(projectId, metadata.source_path, metadata.path, title, metadata.visibility, key, user.user_id, size, actualSha, now, now)
    .run();

  const created = await env.DB.prepare("SELECT id FROM docs WHERE project_id = ? AND path = ?").bind(projectId, metadata.path).first<{ id: number }>();
  if (!created) return json({ error: "insert_failed" }, 500);

  await env.DB.prepare("INSERT INTO docs_fts(rowid, title, body_text) VALUES (?, ?, ?)").bind(created.id, title, bodyText).run();
  return json({ status: "created", doc_id: created.id, url: `${appOrigin(request, env)}/d/${created.id}` }, 201);
}

async function listDocs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 100);
  const result = await env.DB.prepare(
    `SELECT docs.id, docs.path, docs.title, docs.visibility, docs.updated_at, projects.host, projects.owner, projects.repo
     FROM docs JOIN projects ON projects.id = docs.project_id
     ORDER BY docs.updated_at DESC LIMIT ?`
  )
    .bind(limit)
    .all();
  return json({ docs: result.results || [] });
}

async function searchDocs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") || "20"), 100);
  if (!query) return json({ docs: [] });
  const result = await env.DB.prepare(
    `SELECT docs.id, docs.title, docs.path, docs.visibility, projects.host, projects.owner, projects.repo
     FROM docs_fts JOIN docs ON docs_fts.rowid = docs.id
     JOIN projects ON projects.id = docs.project_id
     WHERE docs_fts MATCH ?
     LIMIT ?`
  )
    .bind(query, limit)
    .all();
  return json({ docs: result.results || [] });
}

async function createShare(request: Request, env: Env): Promise<Response> {
  const user = await authenticate(request, env, "share:write");
  if (user instanceof Response) return user;
  const body = (await request.json().catch(() => null)) as null | { doc_id?: number; ttl_days?: number };
  if (!body?.doc_id) return json({ error: "invalid_metadata" }, 400);

  const doc = await env.DB.prepare("SELECT id, visibility FROM docs WHERE id = ?").bind(body.doc_id).first<DocRow>();
  if (!doc) return json({ error: "doc_not_found" }, 404);
  if (doc.visibility !== "public-allowed") return json({ error: "share_not_allowed" }, 403);

  const now = unixNow();
  const ttl = body.ttl_days === 0 ? null : Math.max(1, Math.min(body.ttl_days || 30, 365));
  const expiresAt = ttl ? now + ttl * 86400 : null;
  const token = randomToken(16);
  await env.DB.prepare("INSERT INTO shares (token, doc_id, created_by, expires_at, revoked, created_at) VALUES (?, ?, ?, ?, 0, ?)")
    .bind(token, doc.id, user.user_id, expiresAt, now)
    .run();

  return json({ token, public_url: `${contentOrigin(request, env)}/p/${token}`, expires_at: expiresAt });
}

async function openPrivateDoc(docId: number, request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (!user) {
    return Response.redirect(`${appOrigin(request, env)}/api/auth/lark`, 302);
  }
  const doc = await env.DB.prepare("SELECT id FROM docs WHERE id = ?").bind(docId).first<{ id: number }>();
  if (!doc) return html("<h1>Not found</h1>", 404);
  const token = await signViewToken(
    { doc_id: docId, user_id: user.user_id, exp: unixNow() + 60, nonce: randomToken(8) },
    hmacSecret(env)
  );
  return Response.redirect(`${contentOrigin(request, env)}/v/${token}`, 302);
}

async function openViewToken(token: string, request: Request, env: Env): Promise<Response> {
  const payload = await verifyViewToken(token, hmacSecret(env));
  if (!payload) return html("<h1>Link expired</h1>", 404, noIndexHeaders());
  const doc = await loadDoc(env, payload.doc_id);
  if (!doc) return html("<h1>Not found</h1>", 404, noIndexHeaders());
  return viewerPage(doc, `/raw/view/${token}`, request, env, false);
}

async function rawViewToken(token: string, env: Env): Promise<Response> {
  const payload = await verifyViewToken(token, hmacSecret(env));
  if (!payload) return html("<h1>Link expired</h1>", 404, noIndexHeaders());
  const doc = await loadDoc(env, payload.doc_id);
  return doc ? rawDoc(doc, env) : html("<h1>Not found</h1>", 404, noIndexHeaders());
}

async function openPublicShare(token: string, request: Request, env: Env): Promise<Response> {
  const doc = await loadShareDoc(env, token);
  if (!doc) return html("<h1>Not found</h1>", 404, noIndexHeaders());
  return viewerPage(doc, `/raw/share/${token}`, request, env, true);
}

async function rawPublicShare(token: string, env: Env): Promise<Response> {
  const doc = await loadShareDoc(env, token);
  return doc ? rawDoc(doc, env) : html("<h1>Not found</h1>", 404, noIndexHeaders());
}

async function rawDoc(doc: DocRow, env: Env): Promise<Response> {
  const object = await env.DOCS.get(doc.r2_key);
  if (!object) return html("<h1>Not found</h1>", 404, noIndexHeaders());
  return new Response(object.body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...noIndexHeaders()
    }
  });
}

function viewerPage(doc: DocRow, rawPath: string, request: Request, env: Env, publicMode: boolean): Response {
  const title = doc.title || doc.path;
  const project = [doc.host, doc.owner, doc.repo].filter(Boolean).join("/");
  return html(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
html,body{margin:0;height:100%;overflow:hidden}
.bar{height:32px;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:0 10px;border-bottom:1px solid #e5e7eb;background:#fff;color:#475569;font:12px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.bar a{color:#0f766e;text-decoration:none}.title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#111827}.project{color:#94a3b8}
iframe{display:block;width:100%;height:calc(100vh - 32px);border:0;background:white}
</style>
</head>
<body>
<nav class="bar"><a href="${escapeHtml(appOrigin(request, env))}/dashboard">Back</a><span class="title">${escapeHtml(title)}</span><span class="project">${escapeHtml(project)}</span><span style="margin-left:auto"></span><a href="${escapeHtml(rawPath)}">Raw</a></nav>
<iframe sandbox="allow-scripts allow-forms allow-popups allow-downloads" src="${escapeHtml(rawPath)}"></iframe>
</body>
</html>`, 200, noIndexHeaders());
}

async function loadDoc(env: Env, id: number): Promise<DocRow | null> {
  return env.DB.prepare(
    `SELECT docs.*, projects.host, projects.owner, projects.repo
     FROM docs JOIN projects ON projects.id = docs.project_id WHERE docs.id = ?`
  )
    .bind(id)
    .first<DocRow>();
}

async function loadShareDoc(env: Env, token: string): Promise<DocRow | null> {
  return env.DB.prepare(
    `SELECT docs.*, projects.host, projects.owner, projects.repo
     FROM shares JOIN docs ON docs.id = shares.doc_id
     JOIN projects ON projects.id = docs.project_id
     WHERE shares.token = ? AND shares.revoked = 0
       AND (shares.expires_at IS NULL OR shares.expires_at >= ?)
       AND docs.visibility = 'public-allowed'`
  )
    .bind(token, unixNow())
    .first<DocRow>();
}

async function upsertProject(db: D1Database, project: ProjectCoordinate, now: number): Promise<number> {
  await db
    .prepare("INSERT OR IGNORE INTO projects (host, owner, repo, display_name, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(project.host, project.owner, project.repo, project.repo, now)
    .run();
  const row = await db
    .prepare("SELECT id FROM projects WHERE host = ? AND owner = ? AND repo = ?")
    .bind(project.host, project.owner, project.repo)
    .first<{ id: number }>();
  if (!row) throw new Error("project_insert_failed");
  return row.id;
}

async function authenticate(request: Request, env: Env, scope: string): Promise<TokenUser | Response> {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT id, user_id, scopes, expires_at, revoked_at FROM personal_access_tokens WHERE token_hash = ?`
  )
    .bind(tokenHash)
    .first<{ id: number; user_id: number; scopes: string; expires_at: number | null; revoked_at: number | null }>();
  if (!row || row.revoked_at || (row.expires_at && row.expires_at < unixNow())) {
    return json({ error: "unauthorized" }, 401);
  }
  const scopes = JSON.parse(row.scopes || "[]") as string[];
  if (!scopes.includes(scope)) return json({ error: "forbidden" }, 403);
  await env.DB.prepare("UPDATE personal_access_tokens SET last_used_at = ? WHERE id = ?").bind(unixNow(), row.id).run();
  return { user_id: row.user_id, scopes };
}

function normalizePatScopes(scopes: unknown): string[] {
  const allowed = new Set(["docs:read", "docs:write", "share:write"]);
  if (!Array.isArray(scopes)) return ["docs:read", "docs:write", "share:write"];
  const normalized = scopes.filter((scope): scope is string => typeof scope === "string" && allowed.has(scope));
  return normalized.length > 0 ? [...new Set(normalized)] : ["docs:read"];
}

async function createPersonalAccessToken(
  env: Env,
  userId: number,
  name: string,
  scopes: string[],
  expiresAt: number | null
): Promise<{ value: string; prefix: string; expires_at: number | null }> {
  const value = `hd_pat_${randomToken(24)}`;
  const prefix = value.slice(0, 18);
  await env.DB.prepare(
    `INSERT INTO personal_access_tokens (user_id, token_prefix, token_hash, name, scopes, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(userId, prefix, await hashToken(value), name, JSON.stringify(scopes), expiresAt, unixNow())
    .run();
  return { value, prefix, expires_at: expiresAt };
}

async function currentUser(request: Request, env: Env): Promise<null | { id: number; email: string | null; name: string | null; avatar_url: string | null }> {
  const session = await sessionUser(request, env);
  if (!session) return null;
  return env.DB.prepare("SELECT id, email, name, avatar_url FROM users WHERE id = ?")
    .bind(session.user_id)
    .first<{ id: number; email: string | null; name: string | null; avatar_url: string | null }>();
}

async function sessionUser(request: Request, env: Env): Promise<null | { user_id: number }> {
  const cookie = request.headers.get("Cookie") || "";
  const session = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("hd_session="))
    ?.slice("hd_session=".length);
  if (!session) return null;
  const sessionHash = await hashToken(session);
  const row = await env.DB.prepare("SELECT user_id, expires_at FROM sessions WHERE session_hash = ?")
    .bind(sessionHash)
    .first<{ user_id: number; expires_at: number }>();
  if (!row || row.expires_at < unixNow()) return null;
  return { user_id: row.user_id };
}

function parseMetadata(raw: string): null | {
  project: ProjectCoordinate;
  source_path: string;
  path: string;
  title?: string;
  sha256?: string;
  visibility: Visibility;
} {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const project = value.project as Record<string, unknown> | undefined;
    const visibility = value.visibility || "team";
    if (
      !project ||
      typeof project.host !== "string" ||
      typeof project.owner !== "string" ||
      typeof project.repo !== "string" ||
      typeof value.source_path !== "string" ||
      typeof value.path !== "string" ||
      !["team", "public-allowed", "private-strict"].includes(String(visibility))
    ) {
      return null;
    }
    return {
      project: { host: project.host, owner: project.owner, repo: project.repo },
      source_path: value.source_path,
      path: value.path,
      title: typeof value.title === "string" ? value.title : undefined,
      sha256: typeof value.sha256 === "string" ? value.sha256 : undefined,
      visibility: visibility as Visibility
    };
  } catch {
    return null;
  }
}

async function startLarkAuth(request: Request, env: Env, purpose: "browser" | "cli"): Promise<Response> {
  if (!env.LARK_CLIENT_ID) return json({ error: "lark_not_configured" }, 501);
  const url = new URL(request.url);
  const localCallback = url.searchParams.get("cb");
  if (purpose === "cli" && !isAllowedLocalCallback(localCallback)) {
    return json({ error: "invalid_local_callback" }, 400);
  }
  const redirectUri = `${appOrigin(request, env)}/api/auth/lark/callback`;
  if (!isAllowedRedirect(redirectUri, env)) return json({ error: "redirect_not_allowed" }, 400);
  const state = randomToken(18);
  await env.DB.prepare(
    "INSERT INTO oauth_states (state_hash, purpose, redirect_uri, local_cb, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(await hashToken(state), purpose, redirectUri, localCallback, unixNow(), unixNow() + 600)
    .run();
  const target = new URL("https://open.feishu.cn/open-apis/authen/v1/index");
  target.searchParams.set("app_id", env.LARK_CLIENT_ID);
  target.searchParams.set("redirect_uri", redirectUri);
  target.searchParams.set("state", state);
  return Response.redirect(target.toString(), 302);
}

async function finishLarkAuth(request: Request, env: Env): Promise<Response> {
  if (!env.LARK_CLIENT_ID || !env.LARK_CLIENT_SECRET) return json({ error: "lark_not_configured" }, 501);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return json({ error: "missing_code" }, 400);
  if (!state) return json({ error: "invalid_state" }, 400);
  const stateHash = await hashToken(state);
  const row = await env.DB.prepare("SELECT * FROM oauth_states WHERE state_hash = ?").bind(stateHash).first<{
    purpose: string;
    redirect_uri: string;
    local_cb: string | null;
    expires_at: number;
    consumed_at: number | null;
  }>();
  if (!row || row.consumed_at || row.expires_at < unixNow() || !isAllowedRedirect(row.redirect_uri, env)) {
    return json({ error: "invalid_state" }, 400);
  }
  await env.DB.prepare("UPDATE oauth_states SET consumed_at = ? WHERE state_hash = ?").bind(unixNow(), stateHash).run();

  const appToken = await fetchLarkAppAccessToken(env);
  if (!appToken.ok) return json({ error: "lark_app_token_failed", detail: appToken.error }, 502);

  const accessToken = await fetch("https://open.feishu.cn/open-apis/authen/v1/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appToken.token}`
    },
    body: JSON.stringify({ grant_type: "authorization_code", code })
  }).then((response) => response.json() as Promise<LarkAccessTokenResponse>);
  if (accessToken.code !== 0 || !accessToken.data?.access_token) {
    return json({ error: "lark_access_token_failed", detail: accessToken.msg || accessToken }, 502);
  }

  const userInfo = await fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
    headers: { Authorization: `Bearer ${accessToken.data.access_token}` }
  }).then((response) => response.json() as Promise<LarkUserInfoResponse>);
  const user = userInfo.code === 0 && userInfo.data ? userInfo.data : accessToken.data;
  const openId = user.open_id || user.user_id;
  if (!openId) return json({ error: "lark_user_info_failed", detail: userInfo.msg || userInfo }, 502);

  const now = unixNow();
  await env.DB.prepare(
    `INSERT INTO users (lark_open_id, email, name, avatar_url, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(lark_open_id) DO UPDATE SET email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url`
  )
    .bind(openId, user.email || null, user.name || user.en_name || openId, user.avatar_url || null, now)
    .run();
  const dbUser = await env.DB.prepare("SELECT id FROM users WHERE lark_open_id = ?").bind(openId).first<{ id: number }>();
  if (!dbUser) return json({ error: "user_upsert_failed" }, 500);

  if (row.purpose === "cli") {
    if (!isAllowedLocalCallback(row.local_cb)) return json({ error: "invalid_local_callback" }, 400);
    const token = await createPersonalAccessToken(
      env,
      dbUser.id,
      "CLI login",
      ["docs:read", "docs:write", "share:write"],
      now + 365 * 86400
    );
    return cliLoginCompletePage(appOrigin(request, env), row.local_cb, token.value);
  }

  const session = randomToken(24);
  await env.DB.prepare("INSERT INTO sessions (session_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await hashToken(session), dbUser.id, now + 30 * 86400, now)
    .run();
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${appOrigin(request, env)}/dashboard`,
      "Set-Cookie": `hd_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`
    }
  });
}

function cliLoginCompletePage(serverUrl: string, localCallback: string, pat: string): Response {
  return html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>htmldock CLI login</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;color:#1f2937;background:#fafafa}
main{max-width:680px;margin:48px auto;padding:0 20px}code{background:#f3f4f6;padding:2px 4px;border-radius:4px;word-break:break-all}
</style>
</head>
<body><main>
<h1>htmldock CLI login</h1>
<p id="status">Completing local CLI login...</p>
<p>If the CLI does not finish automatically, paste this token into <code>~/.config/htmldock/config.toml</code>:</p>
<p><code>${escapeHtml(pat)}</code></p>
</main>
<script>
const status = document.getElementById("status");
fetch(${JSON.stringify(localCallback)}, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ server_url: ${JSON.stringify(serverUrl)}, pat: ${JSON.stringify(pat)} })
}).then(() => {
  status.textContent = "CLI login complete. You can close this tab.";
}).catch(() => {
  status.textContent = "Automatic handoff failed. Use the token below.";
});
</script></body></html>`, 200, noIndexHeaders());
}

async function fetchLarkAppAccessToken(env: Env): Promise<{ ok: true; token: string } | { ok: false; error: unknown }> {
  const payload = await fetch("https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: env.LARK_CLIENT_ID, app_secret: env.LARK_CLIENT_SECRET })
  }).then((response) => response.json() as Promise<{ code: number; msg?: string; app_access_token?: string }>);
  if (payload.code !== 0 || !payload.app_access_token) {
    return { ok: false, error: payload.msg || payload };
  }
  return { ok: true, token: payload.app_access_token };
}

function isAllowedRedirect(redirectUri: string, env: Env): boolean {
  const allowlist = (env.LARK_REDIRECT_ALLOWLIST || "").split(",").map((item) => item.trim()).filter(Boolean);
  return allowlist.length === 0 || allowlist.includes(redirectUri);
}

function appOrigin(request: Request, env: Env): string {
  return env.APP_ORIGIN || new URL(request.url).origin;
}

function contentOrigin(request: Request, env: Env): string {
  return env.CONTENT_ORIGIN || new URL(request.url).origin;
}

function hmacSecret(env: Env): string {
  if (!env.HMAC_SECRET) {
    throw new Error("HMAC_SECRET is required");
  }
  return env.HMAC_SECRET;
}

function noIndexHeaders(): Record<string, string> {
  return {
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex"
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function html(value: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(value, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers }
  });
}
