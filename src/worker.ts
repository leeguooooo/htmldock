import {
  assertDisplayPath,
  escapeHtml,
  extractBodyText,
  extractTitle,
  hashToken,
  isAllowedLocalCallback,
  isValidSlug,
  randomToken,
  sha256Hex,
  signViewToken,
  teamProjectR2Key,
  unixNow,
  verifyViewToken,
  type ProjectCoordinate,
  type Visibility
} from "./lib";
import { renderDashboard, type DashboardData, type DashboardRow } from "./views";

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

interface TeamRow {
  id: number;
  slug: string;
  name: string;
  created_by: number | null;
  created_at: number;
  role?: "admin" | "member";
}

interface ProjectRow {
  id: number;
  team_id: number;
  slug: string;
  host: string;
  owner: string;
  repo: string;
  display_name: string | null;
  created_by: number | null;
  created_at: number;
  team_slug?: string;
}

interface R2ListPage {
  objects: { key: string }[];
  truncated: boolean;
  cursor?: string;
}

interface DeletableR2Bucket extends R2Bucket {
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<R2ListPage>;
}

interface EnsureProjectInput {
  team_slug?: string;
  project_slug?: string;
  git?: {
    host?: string;
    owner?: string;
    repo?: string;
  };
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
  team_slug?: string;
  project_slug?: string;
}

const MAX_HTML_BYTES = 2 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(error);
      return apiError("internal_error", "Internal error", 500);
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

  if (request.method === "POST" && path === "/api/teams") {
    return createTeam(request, env);
  }

  if (request.method === "GET" && path === "/api/teams") {
    return listTeams(request, env);
  }

  const teamMember = path.match(/^\/api\/teams\/([^/]+)\/members$/);
  if (request.method === "POST" && teamMember) {
    return addTeamMember(decodeURIComponent(teamMember[1]), request, env);
  }

  const teamMemberDelete = path.match(/^\/api\/teams\/([^/]+)\/members\/(\d+)$/);
  if (request.method === "DELETE" && teamMemberDelete) {
    return removeTeamMember(decodeURIComponent(teamMemberDelete[1]), Number(teamMemberDelete[2]), request, env);
  }

  if (request.method === "POST" && path === "/api/projects/ensure") {
    return ensureProjectRoute(request, env);
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

  const docDelete = path.match(/^\/api\/docs\/(\d+)$/);
  if (request.method === "DELETE" && docDelete) {
    return deleteDoc(Number(docDelete[1]), request, env);
  }

  const projectDelete = path.match(/^\/api\/projects\/(\d+)$/);
  if (request.method === "DELETE" && projectDelete) {
    return deleteProject(Number(projectDelete[1]), request, env);
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

const TEAM_PALETTE = ["#0F8A6C", "#C26A3E", "#4768A8", "#8C5B7B", "#B2853A", "#B9533F"];
const AVATAR_PALETTE = ["#CFE3D7", "#F2D7C7", "#D6DEEF", "#E4D2DE", "#EBDCB7", "#ECC8C0"];

function deterministicColor(palette: string[], key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function initialsOf(s: string): string {
  const parts = (s || "?").trim().split(/\s+/);
  const first = (parts[0] || "?").charAt(0);
  const second = parts.length > 1 ? (parts[parts.length - 1] || "").charAt(0) : "";
  return (first + second).toUpperCase() || "?";
}

function relTime(ts: number, now: number): string {
  const diff = Math.max(1, now - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

async function dashboard(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) {
    return html(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>htmldock</title><style>body{font:14px/1.5 -apple-system,"PingFang SC",sans-serif;margin:0;color:#1B1A17;background:#FBF8F1}main{max-width:560px;margin:80px auto;padding:32px;background:#fff;border:1px solid #E8E5DA;border-radius:12px}h1{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-size:36px;margin:0 0 12px}a.btn{display:inline-block;background:#0F8A6C;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600}</style></head><body><main><h1>htmldock</h1><p>Sign in with Lark to open the team dashboard, browse private documents, or create CLI tokens.</p><p><a class="btn" href="/api/auth/lark">Sign in with Lark</a></p></main></body></html>`);
  }

  const now = unixNow();

  const teamRows = (
    await env.DB.prepare(
      `SELECT teams.slug AS slug, teams.name AS name,
              (SELECT COUNT(*) FROM docs JOIN projects p ON p.id = docs.project_id WHERE p.team_id = teams.id) AS doc_count
       FROM teams JOIN team_members ON team_members.team_id = teams.id
       WHERE team_members.user_id = ?
       ORDER BY teams.slug`
    )
      .bind(user.id)
      .all<{ slug: string; name: string; doc_count: number }>()
  ).results || [];

  const teamSlugs = teamRows.map((t) => t.slug);

  interface DocListRow {
    id: number; title: string | null; path: string; team_slug: string; project_slug: string;
    updated_at: number; owner_user_id: number | null; owner_name: string | null; owner_email: string | null;
  }

  const recentResults: DocListRow[] = teamSlugs.length === 0 ? [] :
    ((await env.DB.prepare(
      `SELECT docs.id, docs.title, docs.path, docs.updated_at,
              teams.slug AS team_slug, projects.slug AS project_slug,
              docs.owner_user_id, owner.name AS owner_name, owner.email AS owner_email
       FROM docs JOIN projects ON projects.id = docs.project_id
       JOIN teams ON teams.id = projects.team_id
       JOIN team_members ON team_members.team_id = teams.id AND team_members.user_id = ?
       LEFT JOIN users owner ON owner.id = docs.owner_user_id
       ORDER BY docs.updated_at DESC LIMIT 20`
    )
      .bind(user.id)
      .all<DocListRow>()).results || []);

  const toRow = (doc: DocListRow): DashboardRow => {
    const ownerName = doc.owner_name || doc.owner_email || (doc.owner_user_id ? `User ${doc.owner_user_id}` : "—");
    return {
      id: doc.id,
      title: doc.title || doc.path,
      pathLabel: `${doc.team_slug} / ${doc.project_slug} / ${doc.path}`,
      owner: { name: ownerName, initials: initialsOf(ownerName), color: deterministicColor(AVATAR_PALETTE, ownerName) },
      whenRel: relTime(doc.updated_at, now)
    };
  };

  const recent = recentResults.map(toRow);

  interface ProjectListRow {
    id: number; team_slug: string; project_slug: string; project_name: string | null;
    doc_count: number; last_updated: number | null;
  }

  const projectResults: ProjectListRow[] = teamSlugs.length === 0 ? [] :
    ((await env.DB.prepare(
      `SELECT projects.id AS id, teams.slug AS team_slug, projects.slug AS project_slug,
              projects.display_name AS project_name,
              (SELECT COUNT(*) FROM docs WHERE docs.project_id = projects.id) AS doc_count,
              (SELECT MAX(updated_at) FROM docs WHERE docs.project_id = projects.id) AS last_updated
       FROM projects JOIN teams ON teams.id = projects.team_id
       JOIN team_members ON team_members.team_id = teams.id AND team_members.user_id = ?
       ORDER BY last_updated DESC, projects.slug
       LIMIT 8`
    )
      .bind(user.id)
      .all<ProjectListRow>()).results || []);

  const projects: DashboardData["projects"] = [];
  for (const p of projectResults) {
    const rowsRaw = await env.DB.prepare(
      `SELECT docs.id, docs.title, docs.path, docs.updated_at,
              teams.slug AS team_slug, projects.slug AS project_slug,
              docs.owner_user_id, owner.name AS owner_name, owner.email AS owner_email
       FROM docs JOIN projects ON projects.id = docs.project_id
       JOIN teams ON teams.id = projects.team_id
       LEFT JOIN users owner ON owner.id = docs.owner_user_id
       WHERE projects.id = ?
       ORDER BY docs.updated_at DESC LIMIT 8`
    ).bind(p.id).all<DocListRow>();
    projects.push({
      id: p.id,
      teamSlug: p.team_slug,
      slug: p.project_slug,
      name: p.project_name || p.project_slug,
      description: "",
      color: deterministicColor(TEAM_PALETTE, p.team_slug),
      docCount: p.doc_count,
      members: [],
      updatedRel: p.last_updated ? relTime(p.last_updated, now) : "—",
      rows: (rowsRaw.results || []).map(toRow)
    });
  }

  const todayCutoff = now - 86400;
  const today = recent
    .filter((_, i) => recentResults[i].updated_at >= todayCutoff)
    .slice(0, 5)
    .map((r) => ({
      initials: r.owner.initials,
      color: r.owner.color,
      whenRel: r.whenRel,
      bodyHtml: `<b>${escapeHtml(r.owner.name)}</b> uploaded <span class="ref">${escapeHtml(r.title)}</span>`
    }));

  const totalsRow = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM docs JOIN projects ON projects.id = docs.project_id
        JOIN team_members tm ON tm.team_id = projects.team_id AND tm.user_id = ?) AS pages,
       (SELECT COUNT(*) FROM team_members WHERE user_id = ?) AS teams,
       (SELECT COUNT(*) FROM docs WHERE updated_at >= ?) AS updated_today`
  ).bind(user.id, user.id, todayCutoff).first<{ pages: number; teams: number; updated_today: number }>();

  const userName = user.name || user.email || `User ${user.id}`;
  const data: DashboardData = {
    user: { name: userName, initials: initialsOf(userName), avatarColor: deterministicColor(AVATAR_PALETTE, userName) },
    brandName: "htmldock",
    teams: teamRows.map((t) => ({
      slug: t.slug, name: t.name, docCount: t.doc_count,
      color: deterministicColor(TEAM_PALETTE, t.slug), expanded: true
    })),
    recent,
    projects,
    today,
    totals: {
      pages: totalsRow?.pages || 0,
      teams: totalsRow?.teams || 0,
      updatedToday: totalsRow?.updated_today || 0
    }
  };

  return html(renderDashboard(data));
}

async function createTeam(request: Request, env: Env): Promise<Response> {
  const user = await currentActor(request, env);
  if (user instanceof Response) return user;
  const body = (await request.json().catch(() => null)) as null | { slug?: string; name?: string };
  const slug = body?.slug?.trim();
  const name = body?.name?.trim();
  if (!slug || !name || !isValidSlug(slug)) return apiError("invalid_metadata", "Invalid team metadata", 400);

  const now = unixNow();
  await env.DB.prepare("INSERT INTO teams (slug, name, created_by, created_at) VALUES (?, ?, ?, ?)")
    .bind(slug, name, user.user_id, now)
    .run();
  const team = await env.DB.prepare("SELECT * FROM teams WHERE slug = ?").bind(slug).first<TeamRow>();
  if (!team) return apiError("insert_failed", "Team insert failed", 500);
  await env.DB.prepare("INSERT INTO team_members (team_id, user_id, role, added_at) VALUES (?, ?, 'admin', ?)")
    .bind(team.id, user.user_id, now)
    .run();
  return json({ team: { ...team, role: "admin" } }, 201);
}

async function listTeams(request: Request, env: Env): Promise<Response> {
  const user = await currentActor(request, env);
  if (user instanceof Response) return user;
  const result = await env.DB.prepare(
    `SELECT teams.id, teams.slug, teams.name, teams.created_by, teams.created_at, team_members.role
     FROM teams JOIN team_members ON team_members.team_id = teams.id
     WHERE team_members.user_id = ?
     ORDER BY teams.slug`
  )
    .bind(user.user_id)
    .all<TeamRow>();
  return json({ teams: result.results || [] });
}

async function addTeamMember(teamSlug: string, request: Request, env: Env): Promise<Response> {
  const user = await currentActor(request, env);
  if (user instanceof Response) return user;
  const team = await requireTeamAdmin(env.DB, teamSlug, user.user_id);
  if (team instanceof Response) return team;

  const body = (await request.json().catch(() => null)) as null | { email?: string; role?: string };
  const email = body?.email?.trim();
  const role = body?.role || "member";
  if (!email || !["admin", "member"].includes(role)) return apiError("invalid_metadata", "Invalid member metadata", 400);

  const member = await env.DB.prepare("SELECT id, email, name FROM users WHERE email = ?").bind(email).first<{
    id: number;
    email: string | null;
    name: string | null;
  }>();
  if (!member) return apiError("user_not_found", "User not found", 404);

  await env.DB.prepare(
    `INSERT INTO team_members (team_id, user_id, role, added_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role`
  )
    .bind(team.id, member.id, role, unixNow())
    .run();
  return json({ member: { ...member, role } }, 201);
}

async function removeTeamMember(teamSlug: string, userId: number, request: Request, env: Env): Promise<Response> {
  const user = await currentActor(request, env);
  if (user instanceof Response) return user;
  const team = await requireTeamAdmin(env.DB, teamSlug, user.user_id);
  if (team instanceof Response) return team;

  const target = await env.DB.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .bind(team.id, userId)
    .first<{ role: "admin" | "member" }>();
  if (!target) return new Response(null, { status: 204 });
  if (target.role === "admin") {
    const adminCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM team_members WHERE team_id = ? AND role = 'admin'")
      .bind(team.id)
      .first<{ count: number }>();
    if ((adminCount?.count || 0) <= 1) return apiError("last_admin", "Cannot remove the last team admin", 400);
  }

  await env.DB.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").bind(team.id, userId).run();
  return new Response(null, { status: 204 });
}

async function ensureProjectRoute(request: Request, env: Env): Promise<Response> {
  const user = await authenticate(request, env, "docs:write");
  if (user instanceof Response) return user;
  const body = (await request.json().catch(() => null)) as null | EnsureProjectInput;
  const project = await ensureProject(env.DB, user.user_id, body, unixNow());
  if (project instanceof Response) return project;
  return json({ project });
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
    return apiError("invalid_metadata", "Invalid metadata", 400);
  }

  const htmlText = await file.text();
  const size = new TextEncoder().encode(htmlText).byteLength;
  if (size > MAX_HTML_BYTES) return json({ code: "file_too_large", message: "File too large", max_bytes: MAX_HTML_BYTES }, 413);

  const metadata = parseMetadata(metadataField);
  if (!metadata) return apiError("invalid_metadata", "Invalid metadata", 400);

  try {
    assertDisplayPath(metadata.path);
  } catch (error) {
    const code = String(error instanceof Error ? error.message : error).split(":")[0];
    return apiError(code, code, 400);
  }

  const actualSha = await sha256Hex(htmlText);
  if (metadata.sha256 && metadata.sha256 !== actualSha) {
    return json({ code: "sha256_mismatch", message: "SHA-256 mismatch", expected: actualSha }, 400);
  }

  const now = unixNow();
  const project = await ensureProject(env.DB, user.user_id, metadata, now);
  if (project instanceof Response) return project;
  const projectId = project.id;
  const key = teamProjectR2Key(metadata.team_slug, metadata.project_slug, metadata.path);
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

async function deleteDoc(docId: number, request: Request, env: Env): Promise<Response> {
  const user = await authenticate(request, env, "docs:delete");
  if (user instanceof Response) return user;
  const doc = await env.DB.prepare(
    `SELECT docs.*, projects.team_id, projects.slug AS project_slug, teams.slug AS team_slug
     FROM docs JOIN projects ON projects.id = docs.project_id
     JOIN teams ON teams.id = projects.team_id
     WHERE docs.id = ?`
  )
    .bind(docId)
    .first<DocRow & { team_id: number }>();
  if (!doc) return apiError("doc_not_found", "Document not found", 404);

  const allowed = doc.owner_user_id === user.user_id || (await isTeamAdmin(env.DB, doc.team_id, user.user_id));
  if (!allowed) return apiError("forbidden", "Forbidden", 403);

  try {
    await (env.DOCS as DeletableR2Bucket).delete(doc.r2_key);
  } catch {
    return apiError("r2_delete_failed", "R2 delete failed", 502);
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM shares WHERE doc_id = ?").bind(doc.id),
    env.DB.prepare("INSERT INTO docs_fts(docs_fts, rowid, title, body_text) VALUES ('delete', ?, ?, '')").bind(
      doc.id,
      doc.title || ""
    ),
    env.DB.prepare("DELETE FROM docs WHERE id = ?").bind(doc.id)
  ]);
  return new Response(null, { status: 204 });
}

async function deleteProject(projectId: number, request: Request, env: Env): Promise<Response> {
  const user = await authenticate(request, env, "projects:delete");
  if (user instanceof Response) return user;
  if (request.headers.get("X-Confirm") !== "yes") {
    return apiError("confirm_required", "X-Confirm: yes is required", 428, { "X-Confirm-Required": "yes" });
  }

  const project = await env.DB.prepare(
    `SELECT projects.*, teams.slug AS team_slug
     FROM projects JOIN teams ON teams.id = projects.team_id
     WHERE projects.id = ?`
  )
    .bind(projectId)
    .first<ProjectRow & { team_slug: string }>();
  if (!project) return apiError("project_not_found", "Project not found", 404);
  if (!(await isTeamAdmin(env.DB, project.team_id, user.user_id))) return apiError("forbidden", "Forbidden", 403);

  const prefix = teamProjectR2Key(project.team_slug, project.slug, "");
  let cursor: string | undefined;
  const keys: string[] = [];
  try {
    do {
      const page = await (env.DOCS as DeletableR2Bucket).list({ prefix, cursor, limit: 1000 });
      keys.push(...page.objects.map((object) => object.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    for (let offset = 0; offset < keys.length; offset += 1000) {
      await (env.DOCS as DeletableR2Bucket).delete(keys.slice(offset, offset + 1000));
    }
  } catch {
    return apiError("r2_delete_failed", "R2 delete failed", 502);
  }

  const docs = await env.DB.prepare("SELECT id, title FROM docs WHERE project_id = ?").bind(project.id).all<{ id: number; title: string | null }>();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM shares WHERE doc_id IN (SELECT id FROM docs WHERE project_id = ?)").bind(project.id),
    ...(docs.results || []).map((doc) =>
      env.DB.prepare("INSERT INTO docs_fts(docs_fts, rowid, title, body_text) VALUES ('delete', ?, ?, '')").bind(doc.id, doc.title || "")
    ),
    env.DB.prepare("DELETE FROM docs WHERE project_id = ?").bind(project.id),
    env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(project.id)
  ]);
  return new Response(null, { status: 204 });
}

async function listDocs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 100);
  const result = await env.DB.prepare(
    `SELECT docs.id, docs.path, docs.title, docs.visibility, docs.updated_at, teams.slug AS team_slug, projects.slug AS project_slug
     FROM docs JOIN projects ON projects.id = docs.project_id
     JOIN teams ON teams.id = projects.team_id
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
    `SELECT docs.id, docs.title, docs.path, docs.visibility, teams.slug AS team_slug, projects.slug AS project_slug
     FROM docs_fts JOIN docs ON docs_fts.rowid = docs.id
     JOIN projects ON projects.id = docs.project_id
     JOIN teams ON teams.id = projects.team_id
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
  const project = [doc.team_slug, doc.project_slug].filter(Boolean).join("/");
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
    `SELECT docs.*, projects.host, projects.owner, projects.repo, projects.slug AS project_slug, teams.slug AS team_slug
     FROM docs JOIN projects ON projects.id = docs.project_id
     JOIN teams ON teams.id = projects.team_id
     WHERE docs.id = ?`
  )
    .bind(id)
    .first<DocRow>();
}

async function loadShareDoc(env: Env, token: string): Promise<DocRow | null> {
  return env.DB.prepare(
    `SELECT docs.*, projects.host, projects.owner, projects.repo, projects.slug AS project_slug, teams.slug AS team_slug
     FROM shares JOIN docs ON docs.id = shares.doc_id
     JOIN projects ON projects.id = docs.project_id
     JOIN teams ON teams.id = projects.team_id
     WHERE shares.token = ? AND shares.revoked = 0
       AND (shares.expires_at IS NULL OR shares.expires_at >= ?)
       AND docs.visibility = 'public-allowed'`
  )
    .bind(token, unixNow())
    .first<DocRow>();
}

async function ensureProject(
  db: D1Database,
  userId: number,
  input: EnsureProjectInput | null,
  now: number
): Promise<(ProjectRow & { team_slug: string }) | Response> {
  if (
    !input?.team_slug ||
    !input.project_slug ||
    !isValidSlug(input.team_slug) ||
    !isValidSlug(input.project_slug) ||
    !input.git?.host ||
    !input.git.owner ||
    !input.git.repo
  ) {
    return apiError("invalid_metadata", "Invalid project metadata", 400);
  }

  const team = await db.prepare("SELECT * FROM teams WHERE slug = ?").bind(input.team_slug).first<TeamRow>();
  if (!team) return apiError("team_not_found", "Team not found", 404);
  const membership = await db.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .bind(team.id, userId)
    .first<{ role: "admin" | "member" }>();
  if (!membership) return apiError("not_team_member", "User is not a team member", 403);

  const gitProject = await db.prepare("SELECT * FROM projects WHERE host = ? AND owner = ? AND repo = ?")
    .bind(input.git.host, input.git.owner, input.git.repo)
    .first<ProjectRow>();
  if (gitProject && gitProject.team_id !== team.id) {
    return apiError("project_conflict", "Git repository is already bound to another team", 409);
  }
  if (gitProject) return { ...gitProject, team_slug: team.slug };

  const slugProject = await db.prepare("SELECT * FROM projects WHERE team_id = ? AND slug = ?")
    .bind(team.id, input.project_slug)
    .first<ProjectRow>();
  if (slugProject) return { ...slugProject, team_slug: team.slug };

  await db
    .prepare(
      `INSERT INTO projects (team_id, slug, host, owner, repo, display_name, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(team.id, input.project_slug, input.git.host, input.git.owner, input.git.repo, input.project_slug, userId, now)
    .run();
  const created = await db.prepare("SELECT * FROM projects WHERE team_id = ? AND slug = ?")
    .bind(team.id, input.project_slug)
    .first<ProjectRow>();
  if (!created) return apiError("insert_failed", "Project insert failed", 500);
  return { ...created, team_slug: team.slug };
}

async function requireTeamAdmin(db: D1Database, teamSlug: string, userId: number): Promise<TeamRow | Response> {
  const team = await db.prepare("SELECT * FROM teams WHERE slug = ?").bind(teamSlug).first<TeamRow>();
  if (!team) return apiError("team_not_found", "Team not found", 404);
  const membership = await db.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .bind(team.id, userId)
    .first<{ role: "admin" | "member" }>();
  if (membership?.role !== "admin") return apiError("forbidden", "Forbidden", 403);
  return team;
}

async function isTeamAdmin(db: D1Database, teamId: number, userId: number): Promise<boolean> {
  const membership = await db.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
    .bind(teamId, userId)
    .first<{ role: "admin" | "member" }>();
  return membership?.role === "admin";
}

async function authenticate(request: Request, env: Env, scope: string): Promise<TokenUser | Response> {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return apiError("unauthorized", "Unauthorized", 401);
  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT id, user_id, scopes, expires_at, revoked_at FROM personal_access_tokens WHERE token_hash = ?`
  )
    .bind(tokenHash)
    .first<{ id: number; user_id: number; scopes: string; expires_at: number | null; revoked_at: number | null }>();
  if (!row || row.revoked_at || (row.expires_at && row.expires_at < unixNow())) {
    return apiError("unauthorized", "Unauthorized", 401);
  }
  const scopes = JSON.parse(row.scopes || "[]") as string[];
  if (!scopes.includes(scope)) return apiError("forbidden", "Forbidden", 403);
  await env.DB.prepare("UPDATE personal_access_tokens SET last_used_at = ? WHERE id = ?").bind(unixNow(), row.id).run();
  return { user_id: row.user_id, scopes };
}

async function currentActor(request: Request, env: Env): Promise<TokenUser | Response> {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    const tokenHash = await hashToken(token);
    const row = await env.DB.prepare(
      `SELECT id, user_id, scopes, expires_at, revoked_at FROM personal_access_tokens WHERE token_hash = ?`
    )
      .bind(tokenHash)
      .first<{ id: number; user_id: number; scopes: string; expires_at: number | null; revoked_at: number | null }>();
    if (!row || row.revoked_at || (row.expires_at && row.expires_at < unixNow())) {
      return apiError("unauthorized", "Unauthorized", 401);
    }
    await env.DB.prepare("UPDATE personal_access_tokens SET last_used_at = ? WHERE id = ?").bind(unixNow(), row.id).run();
    return { user_id: row.user_id, scopes: JSON.parse(row.scopes || "[]") as string[] };
  }

  const session = await sessionUser(request, env);
  return session ? { user_id: session.user_id, scopes: [] } : apiError("unauthorized", "Unauthorized", 401);
}

function normalizePatScopes(scopes: unknown): string[] {
  const allowed = new Set(["docs:read", "docs:write", "docs:delete", "projects:delete", "share:write"]);
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
  team_slug: string;
  project_slug: string;
  git: ProjectCoordinate;
  source_path: string;
  path: string;
  title?: string;
  sha256?: string;
  visibility: Visibility;
} {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const git = value.git as Record<string, unknown> | undefined;
    const visibility = value.visibility || "team";
    if (
      typeof value.team_slug !== "string" ||
      typeof value.project_slug !== "string" ||
      !isValidSlug(value.team_slug) ||
      !isValidSlug(value.project_slug) ||
      !git ||
      typeof git.host !== "string" ||
      typeof git.owner !== "string" ||
      typeof git.repo !== "string" ||
      typeof value.source_path !== "string" ||
      typeof value.path !== "string" ||
      !["team", "public-allowed", "private-strict"].includes(String(visibility))
    ) {
      return null;
    }
    return {
      team_slug: value.team_slug,
      project_slug: value.project_slug,
      git: { host: git.host, owner: git.owner, repo: git.repo },
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

function apiError(code: string, message: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

function html(value: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(value, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers }
  });
}
