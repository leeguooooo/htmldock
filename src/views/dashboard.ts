import { escapeHtml } from "../lib";

export type DashboardData = {
  user: { name: string; initials: string; avatarColor: string };
  brandName?: string;
  teams: Array<{ slug: string; name: string; docCount: number; color: string; expanded: boolean }>;
  recent: Array<DashboardRow>;
  projects: Array<{
    id: number;
    teamSlug: string;
    slug: string;
    name: string;
    description: string;
    color: string;
    docCount: number;
    members: Array<{ initials: string; color: string }>;
    updatedRel: string;
    rows: DashboardRow[];
  }>;
  today: Array<{ initials: string; color: string; whenRel: string; bodyHtml: string }>;
  totals: { pages: number; teams: number; updatedToday: number };
};

export type DashboardRow = {
  id: number;
  title: string;
  pathLabel: string;
  tag?: { label: string; color: string };
  owner: { name: string; initials: string; color: string };
  whenRel: string;
};

export function renderDashboard(data: DashboardData): string {
  const brand = data.brandName || "htmldock";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(brand)} dashboard</title>
<style>
:root{--bg:#f6f7f8;--panel:#fff;--panel-2:#fbfbfc;--text:#111827;--muted:#6b7280;--faint:#9ca3af;--line:#e5e7eb;--line-2:#d1d5db;--accent:#0f766e;--danger:#b42318;--shadow:0 1px 2px rgba(17,24,39,.04)}
*{box-sizing:border-box}html,body{margin:0}body{font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}button,input{font:inherit}button{cursor:pointer}.page{min-height:100vh}.topbar{height:52px;display:flex;align-items:center;gap:14px;padding:0 22px;background:var(--panel);border-bottom:1px solid var(--line)}.brand{font-weight:700;letter-spacing:0}.brand span{color:var(--accent)}.topbar .meta{color:var(--muted);font-size:13px}.spacer{flex:1}.avatar{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;color:var(--text);background:#dbeafe}.shell{max-width:1180px;margin:0 auto;padding:22px}.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:18px}.sidebar{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;align-self:start;box-shadow:var(--shadow)}.side-title{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:2px 0 8px}.team{display:flex;align-items:center;gap:8px;padding:7px 6px;border-radius:6px}.team:hover{background:var(--panel-2)}.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:0 0 auto}.team-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.count{margin-left:auto;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}.stats{border-top:1px solid var(--line);margin-top:10px;padding-top:10px;display:grid;gap:7px}.stat-line{display:flex;justify-content:space-between;color:var(--muted);font-size:13px}.stat-line b{color:var(--text)}.main{display:grid;gap:18px}.hero{display:flex;align-items:flex-start;gap:16px}.hero h1{font-size:26px;line-height:1.15;margin:0 0 6px}.hero p{margin:0;color:var(--muted);max-width:720px}.actions{margin-left:auto;display:flex;align-items:center;gap:8px}.btn{height:34px;border:1px solid var(--line-2);background:var(--panel);border-radius:7px;padding:0 12px;font-weight:600;color:var(--text)}.btn:hover{border-color:var(--muted)}.btn-primary{background:var(--text);border-color:var(--text);color:white}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.metric{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px;box-shadow:var(--shadow)}.metric .label{color:var(--muted);font-size:12px}.metric .value{font-size:24px;font-weight:750;margin-top:3px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);overflow:hidden}.panel-head{min-height:46px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid var(--line);background:var(--panel-2)}.panel-head h2{font-size:14px;margin:0}.panel-head .note{color:var(--muted);font-size:12px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:middle}th{font-size:11px;text-transform:uppercase;color:var(--muted);font-weight:700;background:var(--panel-2)}td{font-size:13px}.doc-title{font-weight:650}.path{color:var(--muted);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:520px}.owner{display:inline-flex;align-items:center;gap:7px;color:var(--muted)}.mini{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:9px;font-weight:700;color:var(--text)}.time{color:var(--muted);white-space:nowrap}.row-actions{display:flex;gap:6px}.icon-btn{height:30px;border:1px solid var(--line);background:white;border-radius:6px;display:inline-grid;place-items:center;color:var(--muted);padding:0 10px;font-size:12px}.icon-btn:hover{color:var(--text);border-color:var(--line-2)}.project{border-bottom:1px solid var(--line)}.project:last-child{border-bottom:0}.project summary{list-style:none;display:flex;align-items:center;gap:9px;padding:12px 14px;cursor:pointer}.project summary::-webkit-details-marker{display:none}.project summary:before{content:"›";color:var(--muted)}.project[open] summary:before{transform:rotate(90deg)}.project-title{font-weight:700}.project-meta{color:var(--muted);font-size:12px}.project-rows{padding:0 14px 12px 36px}.compact-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #f1f3f5}.compact-row:first-child{border-top:0}.compact-row a{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compact-row span{margin-left:auto;color:var(--muted);font-size:12px}.empty{padding:18px 14px;color:var(--muted)}.setup{padding:14px;display:grid;gap:10px}.setup code{background:#f3f4f6;border:1px solid var(--line);border-radius:5px;padding:2px 5px}.pat-form{display:flex;gap:8px;flex-wrap:wrap}.pat-form input{height:34px;border:1px solid var(--line-2);border-radius:7px;padding:0 10px;min-width:220px}.pat-output{color:var(--muted);font-size:12px;word-break:break-all}#pat-output code{color:var(--text)}@media(max-width:860px){.shell{padding:14px}.layout{grid-template-columns:1fr}.sidebar{display:none}.hero{display:grid}.actions{margin-left:0}.grid{grid-template-columns:1fr}.topbar{padding:0 14px}.topbar .meta{display:none}}
</style>
</head>
<body>
<div class="page">
${renderTopbar(brand, data)}
<div class="shell"><div class="layout">
${renderSidebar(data)}
<main class="main">
${renderHero(data)}
${renderMetrics(data)}
${renderRecent(data.recent)}
${renderProjects(data.projects)}
${renderSetupPanel()}
</main>
</div></div>
</div>
<script>
(()=>{const form=document.getElementById("pat-form");if(!form)return;form.addEventListener("submit",async e=>{e.preventDefault();const out=document.getElementById("pat-output");const name=new FormData(form).get("name")||"CLI token";out.textContent="Creating token...";const res=await fetch("/api/pats",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});const data=await res.json().catch(()=>({}));out.innerHTML=res.ok?"PAT: <code>"+data.token+"</code>":"Error: <code>"+(data.error||data.code||res.status)+"</code>";});})();
</script>
</body>
</html>`;
}

function renderTopbar(brand: string, data: DashboardData): string {
  return `<header class="topbar"><div class="brand">${escapeHtml(brand.replace("dock", ""))}<span>dock</span></div><div class="meta">Team HTML docs</div><div class="spacer"></div><div class="meta">${escapeHtml(data.user.name)}</div><span class="avatar" style="background:${cssColor(data.user.avatarColor)}">${escapeHtml(data.user.initials)}</span></header>`;
}

function renderSidebar(data: DashboardData): string {
  const teams = data.teams.map((team) => `<div class="team"><span class="dot" style="background:${cssColor(team.color)}"></span><span class="team-name">${escapeHtml(team.name)}</span><span class="count">${team.docCount}</span></div>`).join("");
  return `<aside class="sidebar"><div class="side-title">Teams</div>${teams || `<div class="empty">No teams yet.</div>`}<div class="stats"><div class="stat-line"><span>Pages</span><b>${data.totals.pages}</b></div><div class="stat-line"><span>Teams</span><b>${data.totals.teams}</b></div><div class="stat-line"><span>Today</span><b>${data.totals.updatedToday}</b></div></div></aside>`;
}

function renderHero(data: DashboardData): string {
  return `<section class="hero"><div><h1>Dashboard</h1><p>Browse uploaded HTML docs by team and project. Use the CLI token panel when you need to publish from a local repo.</p></div><div class="actions"><a class="btn btn-primary" href="#cli">CLI token</a></div></section>`;
}

function renderMetrics(data: DashboardData): string {
  return `<section class="grid" aria-label="Dashboard metrics"><div class="metric"><div class="label">Documents</div><div class="value">${data.totals.pages}</div></div><div class="metric"><div class="label">Teams</div><div class="value">${data.totals.teams}</div></div><div class="metric"><div class="label">Updated today</div><div class="value">${data.totals.updatedToday}</div></div></section>`;
}

function renderRecent(rows: DashboardRow[]): string {
  const body = rows.map(renderTableRow).join("");
  return `<section class="panel"><div class="panel-head"><h2>Recent documents</h2><span class="note">${rows.length} shown</span></div><div class="table-wrap">${rows.length ? `<table><thead><tr><th>Document</th><th>Owner</th><th>Updated</th><th></th></tr></thead><tbody>${body}</tbody></table>` : `<div class="empty">No documents yet. Install the CLI and push an HTML file.</div>`}</div></section>`;
}

function renderTableRow(row: DashboardRow): string {
  return `<tr><td><a class="doc-title" href="/d/${row.id}">${escapeHtml(row.title)}</a><div class="path">${escapeHtml(cleanPathLabel(row.pathLabel))}</div></td><td><span class="owner"><span class="mini" style="background:${cssColor(row.owner.color)}">${escapeHtml(row.owner.initials)}</span>${escapeHtml(row.owner.name)}</span></td><td class="time">${escapeHtml(row.whenRel)}</td><td><div class="row-actions"><a class="icon-btn" href="/d/${row.id}" title="Open" aria-label="Open">Open</a></div></td></tr>`;
}

function renderProjects(projects: DashboardData["projects"]): string {
  const items = projects.map(renderProject).join("");
  return `<section class="panel"><div class="panel-head"><h2>Projects</h2><span class="note">${projects.length} recent</span></div>${items || `<div class="empty">No projects yet.</div>`}</section>`;
}

function renderProject(project: DashboardData["projects"][number]): string {
  const rows = project.rows.map((row) => `<div class="compact-row"><a href="/d/${row.id}">${escapeHtml(row.title)}</a><span>${escapeHtml(row.whenRel)}</span></div>`).join("");
  return `<details class="project" open><summary><span class="dot" style="background:${cssColor(project.color)}"></span><span class="project-title">${escapeHtml(project.teamSlug)} / ${escapeHtml(project.name)}</span><span class="count">${project.docCount}</span><span class="project-meta">${escapeHtml(project.updatedRel)}</span></summary><div class="project-rows">${rows || `<div class="empty">No visible documents.</div>`}</div></details>`;
}

function renderSetupPanel(): string {
  return `<section class="panel" id="cli"><div class="panel-head"><h2>CLI setup</h2><span class="note">Token is shown once</span></div><div class="setup"><form id="pat-form" class="pat-form"><input name="name" value="CLI token" aria-label="Token name"><button class="btn btn-primary" type="submit">Create PAT</button></form><div class="pat-output" id="pat-output">After creating a token, run <code>htmldock config set-token &lt;PAT&gt; --server https://htmldock.pwtk-dev.work</code>.</div></div></section>`;
}

function cleanPathLabel(pathLabel: string): string {
  return pathLabel.replace(/\s*·\s*v\d+\b/gi, "").replace(/\bv\d+\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

function cssColor(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^var\(--[a-z0-9-]+\)$/i.test(value) ? value : "#dbeafe";
}
