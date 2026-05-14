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

const fontHref =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";

export function renderDashboard(data: DashboardData): string {
  const brand = data.brandName || "htmldock";
  const ownedRows = data.recent.filter((row) => row.owner.initials === data.user.initials);
  const owned = ownedRows.length > 0 ? ownedRows : data.recent.slice(0, 3);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(brand)} dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontHref}" rel="stylesheet">
<style>
:root{--paper:#FBF8F1;--paper-2:#F4F1E8;--paper-3:#ECE7DA;--card:#fff;--ink:#1B1A17;--ink-2:#5A574E;--ink-3:#8C8678;--line:#E5DED0;--line-2:#D5CDBB;--accent:#0F8A6C;--accent-deep:#096148;--accent-soft:#E2F2EC;--danger:#9C3B2F;--sans:"Inter","PingFang SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--serif:"Instrument Serif","Times New Roman","PingFang SC",serif;--mono:"JetBrains Mono","PingFang SC",ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}html,body{margin:0}body{font:13.5px/1.5 var(--sans);background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}button,input{font:inherit}button{border:0;background:none;color:inherit;cursor:pointer}.app{min-height:100vh;display:grid;grid-template-columns:244px 1fr;grid-template-rows:54px 1fr;grid-template-areas:"brand top" "side main"}.brand{grid-area:brand;display:flex;align-items:center;gap:9px;padding:0 16px;background:var(--paper-2);border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.mark{width:23px;height:23px;border-radius:5px;background:var(--ink);color:var(--paper);display:grid;place-items:center;font:italic 15px/1 var(--serif)}.brand-name{font-weight:700;letter-spacing:0}.brand-name em{font:italic 18px var(--serif);color:var(--accent-deep);font-weight:400}.top{grid-area:top;display:flex;align-items:center;gap:12px;padding:0 20px;border-bottom:1px solid var(--line)}.crumb{color:var(--ink-3)}.top-spacer{flex:1}.search{height:31px;width:min(310px,32vw);display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--line);background:var(--paper-2);border-radius:8px;color:var(--ink-3)}.search:hover{background:var(--card);border-color:var(--line-2)}.kbd{font:10px/1.3 var(--mono);padding:2px 5px;border:1px solid var(--line);border-radius:3px;background:var(--card);color:var(--ink-3)}.btn{height:31px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;border-radius:8px;font-weight:600;font-size:12.5px}.btn-main{background:var(--ink);color:var(--paper)}.hint{font-size:11.5px;color:var(--ink-3)}.avatar,.mini{display:inline-grid;place-items:center;border-radius:50%;background:var(--paper-3);color:var(--ink);font-weight:700;letter-spacing:0}.avatar{width:28px;height:28px;font-size:11px}.mini{width:20px;height:20px;font-size:9px}.side{grid-area:side;background:var(--paper-2);border-right:1px solid var(--line);padding:14px 10px;overflow:auto}.side-label{padding:10px 8px 5px;color:var(--ink-3);font-size:11px;font-weight:600}.team{border-radius:7px}.team summary{list-style:none;display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;cursor:pointer}.team summary::-webkit-details-marker{display:none}.team summary:hover{background:var(--paper-3)}.team summary:before{content:"›";color:var(--ink-3);transition:.15s}.team[open] summary:before{transform:rotate(90deg)}.dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:0 0 auto}.team-name{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.count{margin-left:auto;color:var(--ink-3);font-size:11.5px;font-variant-numeric:tabular-nums}.team-body{padding:0 8px 7px 31px;color:var(--ink-3);font-size:12px}.side-stats{margin-top:18px;padding:12px 8px;border-top:1px solid var(--line);display:grid;gap:8px}.stat{display:flex;justify-content:space-between;color:var(--ink-3)}.stat b{color:var(--ink)}.main{grid-area:main;overflow:auto}.inner{max-width:980px;margin:0 auto;padding:46px 46px 96px}.hello{margin-bottom:28px}.hello small{color:var(--ink-3)}h1{margin:6px 0 8px;font:400 40px/1.08 var(--serif);letter-spacing:0}.hello em{color:var(--accent-deep)}.sub{max-width:650px;color:var(--ink-2);margin:0}.today{border-block:1px solid var(--line);margin:0 0 24px;padding:8px 0 10px}.today-head{display:flex;align-items:center;gap:8px;padding:0 8px 6px;color:var(--ink-3);font-size:12px}.today-head b{color:var(--ink)}.pulse{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}.feed{display:grid;gap:1px}.feed-line{display:grid;grid-template-columns:20px 62px 1fr;align-items:center;gap:11px;padding:6px 8px;border-radius:6px;color:var(--ink-2);font-size:12.5px}.feed-line:hover{background:var(--paper-2)}.when{color:var(--ink-3);font-size:12px;font-variant-numeric:tabular-nums}.tabs{display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--line);margin-bottom:4px}.tab{height:35px;padding:0 12px;display:inline-flex;align-items:center;gap:6px;color:var(--ink-3);border-bottom:2px solid transparent;margin-bottom:-1px}.tab:hover,.tab.active{color:var(--ink)}#owned:target~.tabs a[href="#owned"],body:not(:has(#owned:target)) .tabs a[href="#recent"],#recent:target~.tabs a[href="#recent"]{border-bottom-color:var(--ink);font-weight:600;color:var(--ink)}.panel{display:none}body:not(:has(#owned:target)) #recent,#recent:target,#owned:target{display:block}.list{display:grid}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;padding:12px 8px;border-bottom:1px solid #EFE9DD;border-radius:6px;min-height:58px}.row:hover{background:var(--paper-2)}.row-main{min-width:0}.title{font-weight:650;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{display:flex;align-items:center;gap:8px;color:var(--ink-3);font-size:12px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tag{display:inline-flex;align-items:center;gap:5px;color:var(--ink-2)}.owner{display:inline-flex;align-items:center;gap:5px}.row-right{display:flex;align-items:center;gap:14px}.actions{display:none;gap:2px}.row:hover .age{display:none}.row:hover .actions{display:flex}.ab{width:29px;height:29px;border-radius:6px;display:grid;place-items:center;color:var(--ink-3)}.ab:hover{background:var(--paper-3);color:var(--ink)}.ab.delete:hover{color:var(--danger)}.projects{margin-top:34px}.project{margin-top:12px;border-bottom:1px solid var(--line)}.project summary{list-style:none;display:flex;align-items:center;gap:10px;padding:11px 8px;cursor:pointer}.project summary::-webkit-details-marker{display:none}.project summary:before{content:"⌄";color:var(--ink-3)}.project:not([open]) summary:before{content:"›"}.project h2{font-size:14px;margin:0}.desc{color:var(--ink-3);font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.members{display:flex}.members .mini{margin-left:-5px;border:1.5px solid var(--paper)}.members .mini:first-child{margin-left:0}.cmdk-backdrop{position:fixed;inset:0;background:rgba(27,26,23,.16);backdrop-filter:blur(2px);display:grid;place-items:start center;padding-top:14vh;z-index:5}.cmdk-backdrop.hidden{display:none}.cmdk{width:min(560px,calc(100vw - 24px));background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 24px 60px -12px rgba(27,26,23,.24);overflow:hidden}.cmdk-input{display:flex;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}.cmdk-input input{flex:1;border:0;outline:0;background:transparent;font-size:14px}.cmdk-section{padding:7px}.cmdk-label{padding:5px 9px;color:var(--ink-3);font-size:11px}.cmdk-row{display:flex;align-items:center;gap:10px;padding:8px 9px;border-radius:6px;color:var(--ink)}.cmdk-row:hover{background:var(--paper-2)}.cmdk-row .right{margin-left:auto;color:var(--ink-3);font-size:12px}.empty{padding:20px 8px;color:var(--ink-3)}@media(max-width:780px){.app{grid-template-columns:1fr;grid-template-rows:54px auto 1fr;grid-template-areas:"brand" "top" "main"}.side{display:none}.top{grid-area:top;overflow:auto}.inner{padding:32px 18px 80px}.hint{display:none}.search{width:190px}.project summary{align-items:flex-start;flex-wrap:wrap}.desc{flex-basis:100%}.row{grid-template-columns:1fr}.row-right{justify-content:space-between}h1{font-size:34px}}
</style>
</head>
<body>
<div class="app">
${renderBrand(brand)}
${renderTop(data)}
${renderSidebar(data)}
<main class="main"><div class="inner">
${renderHeader(data)}
${renderToday(data.today)}
<section id="owned" class="panel">${renderRows(owned)}</section>
<section id="recent" class="panel">${renderRows(data.recent)}</section>
<nav class="tabs" aria-label="Document views"><a class="tab" href="#recent">Recent <span class="count">${data.recent.length}</span></a><a class="tab" href="#owned">Owned by me <span class="count">${owned.length}</span></a><span class="top-spacer"></span><span class="hint">Sort: recently updated</span></nav>
<section class="projects" aria-label="Projects">${data.projects.map(renderProject).join("")}</section>
</div></main>
</div>
${renderCommandPalette(data.recent)}
<script>
(()=>{const p=document.querySelector(".cmdk-backdrop"),q=document.querySelector("#cmdk-q");function open(){p.classList.remove("hidden");q&&q.focus()}function close(){p.classList.add("hidden")}document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();open()}if(e.key==="Escape")close()});document.querySelectorAll("[data-cmdk]").forEach(x=>x.addEventListener("click",open));p.addEventListener("click",e=>{if(e.target===p)close()})})();
</script>
</body>
</html>`;
}

function renderBrand(brand: string): string {
  const safeBrand = escapeHtml(brand);
  return `<div class="brand"><div class="mark">${escapeHtml(brand.slice(0, 1).toLowerCase() || "h")}</div><div class="brand-name">${safeBrand.replace("dock", "<em>dock</em>")}</div></div>`;
}

function renderTop(data: DashboardData): string {
  return `<header class="top"><div class="crumb"><b>Home</b> / Dashboard</div><div class="top-spacer"></div><button class="search" type="button" data-cmdk><span>Search docs</span><span class="top-spacer"></span><span class="kbd">⌘K</span></button><a class="btn btn-main" href="/install">Install CLI</a><span class="hint">Copy PAT after login</span><span class="avatar" style="background:${cssColor(data.user.avatarColor)}">${escapeHtml(data.user.initials)}</span></header>`;
}

function renderSidebar(data: DashboardData): string {
  const teams = data.teams
    .map(
      (team) => `<details class="team" ${team.expanded ? "open" : ""}><summary><span class="dot" style="background:${cssColor(team.color)}"></span><span class="team-name">${escapeHtml(team.name)}</span><span class="count">${team.docCount}</span></summary><div class="team-body"><span>${escapeHtml(team.slug)}</span></div></details>`
    )
    .join("");
  return `<aside class="side"><div class="side-label">Teams</div>${teams || `<div class="empty">No teams yet.</div>`}<div class="side-stats"><div class="stat"><span>Pages</span><b>${data.totals.pages}</b></div><div class="stat"><span>Teams</span><b>${data.totals.teams}</b></div><div class="stat"><span>Updated today</span><b>${data.totals.updatedToday}</b></div></div></aside>`;
}

function renderHeader(data: DashboardData): string {
  return `<header class="hello"><small>${data.totals.pages} pages indexed across ${data.totals.teams} teams</small><h1>Good afternoon, <em>${escapeHtml(data.user.name)}</em>.</h1><p class="sub">Recent uploads are grouped by team and project. Use <span class="kbd">⌘K</span> to search, create a team, install the CLI, log out, or open settings.</p></header>`;
}

function renderToday(items: DashboardData["today"]): string {
  const lines = items
    .map(
      (item) => `<div class="feed-line"><span class="mini" style="background:${cssColor(item.color)}">${escapeHtml(item.initials)}</span><span class="when">${escapeHtml(item.whenRel)}</span><span>${item.bodyHtml}</span></div>`
    )
    .join("");
  return `<section class="today"><div class="today-head"><span class="pulse"></span><b>Today</b><span>${items.length} uploaded</span></div><div class="feed">${lines || `<div class="empty">No uploads today.</div>`}</div></section>`;
}

function renderProject(project: DashboardData["projects"][number]): string {
  const members = project.members
    .map((member) => `<span class="mini" style="background:${cssColor(member.color)}">${escapeHtml(member.initials)}</span>`)
    .join("");
  return `<details class="project" open><summary><span class="dot" style="background:${cssColor(project.color)}"></span><h2>${escapeHtml(project.name)}</h2><span class="count">${project.docCount}</span><span class="desc">${escapeHtml(project.description)}</span><span class="members">${members}</span><span class="when">${escapeHtml(project.updatedRel)}</span><button class="ab" type="button" title="More" aria-label="More">⋯</button></summary>${renderRows(project.rows)}</details>`;
}

function renderRows(rows: DashboardRow[]): string {
  return `<div class="list">${rows.length > 0 ? rows.map(renderRow).join("") : `<div class="empty">No documents yet. Install the CLI to publish HTML.</div>`}</div>`;
}

function renderRow(row: DashboardRow): string {
  const tag = row.tag
    ? `<span class="tag"><span class="dot" style="background:${cssColor(row.tag.color)}"></span>${escapeHtml(row.tag.label)}</span><span>·</span>`
    : "";
  return `<article class="row"><div class="row-main"><a class="title" href="/d/${row.id}">${escapeHtml(row.title)}</a><div class="meta">${tag}<span>${escapeHtml(cleanPathLabel(row.pathLabel))}</span><span>·</span><span class="owner"><span class="mini" style="background:${cssColor(row.owner.color)}">${escapeHtml(row.owner.initials)}</span>${escapeHtml(row.owner.name)}</span></div></div><div class="row-right"><span class="age when">${escapeHtml(row.whenRel)}</span><div class="actions"><a class="ab" href="/d/${row.id}" title="Open" aria-label="Open">↗</a><button class="ab" type="button" title="Share" aria-label="Share">⛓</button><button class="ab delete" type="button" title="Delete" aria-label="Delete">⌫</button><button class="ab" type="button" title="More" aria-label="More">⋯</button></div></div></article>`;
}

function renderCommandPalette(rows: DashboardRow[]): string {
  const docs = rows
    .slice(0, 3)
    .map((row) => `<a class="cmdk-row" href="/d/${row.id}"><span class="dot" style="background:${cssColor(row.tag?.color || row.owner.color)}"></span><span>${escapeHtml(row.title)}</span><span class="right">${escapeHtml(cleanPathLabel(row.pathLabel))}</span></a>`)
    .join("");
  return `<div class="cmdk-backdrop hidden"><div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette"><div class="cmdk-input"><span>⌕</span><input id="cmdk-q" placeholder="Search docs or run a command"><span class="kbd">esc</span></div><div class="cmdk-section"><div class="cmdk-label">Search docs</div>${docs}</div><div class="cmdk-section"><div class="cmdk-label">Commands</div><a class="cmdk-row" href="/teams/new"><span>＋</span><span>Create team</span></a><a class="cmdk-row" href="/install"><span>⌘</span><span>Install CLI</span></a><a class="cmdk-row" href="/logout"><span>⎋</span><span>Logout</span></a><a class="cmdk-row" href="/settings"><span>⚙</span><span>Open settings</span></a></div></div></div>`;
}

function cleanPathLabel(pathLabel: string): string {
  return pathLabel.replace(/\s*·\s*v\d+\b/gi, "").replace(/\bv\d+\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

function cssColor(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^var\(--[a-z0-9-]+\)$/i.test(value) ? value : "#ECE7DA";
}
