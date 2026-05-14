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
  color?: string;
  dayLabel?: string;
  dayMeta?: string;
};

const fontHref =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";

export function renderDashboard(data: DashboardData): string {
  const brand = data.brandName || "htmldock";
  const liveTeams = data.teams.filter((team) => team.slug !== "legacy");
  const legacyTeams = data.teams.filter((team) => team.slug === "legacy");
  const legacyProjectSlugs = new Set(data.projects.filter((project) => project.teamSlug === "legacy").map((project) => project.slug));
  const timelineRows = data.recent.filter((row) => !isLegacyRow(row, legacyProjectSlugs));
  const onboarding = liveTeams.length === 0 || data.totals.pages === 0;
  const paletteRows = onboarding ? timelineRows : timelineRows.length > 0 ? timelineRows : data.recent;

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
:root{--paper:#FBF8F1;--paper-2:#F4F0E5;--paper-3:#ECE7D9;--card:#fff;--ink:#1B1A17;--ink-2:#5A574E;--ink-3:#908B7E;--ink-4:#BCB6A6;--line:#E8E2D2;--line-soft:#EFEADD;--line-strong:#D5CFBC;--accent:#0F8A6C;--accent-deep:#07604A;--accent-soft:#E0EFE8;--danger:#9C3B2F;--sans:"Inter","PingFang SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--serif:"Instrument Serif","Times New Roman","PingFang SC",serif;--mono:"JetBrains Mono","PingFang SC",ui-monospace,SFMono-Regular,Menlo,monospace;--r-sm:5px;--r-md:8px;--r-lg:12px}
*{box-sizing:border-box}html,body{margin:0}body{font:13.5px/1.5 var(--sans);background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}a{color:inherit;text-decoration:none}button{font:inherit;border:0;background:none;color:inherit;cursor:pointer;padding:0}.app{min-height:100vh;background:var(--paper);display:grid;grid-template-columns:224px minmax(0,1fr);grid-template-rows:48px 1fr;grid-template-areas:"brand top" "side main";overflow:hidden}.brand{grid-area:brand;display:flex;align-items:center;gap:8px;padding:0 14px;background:var(--paper-2);border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.mark{width:20px;height:20px;border-radius:5px;background:var(--ink);color:var(--paper);display:grid;place-items:center;font:italic 13px/1 var(--serif);padding-bottom:1px}.brand-name{font-size:13.5px;font-weight:600;letter-spacing:0}.brand-name em{font:italic 17px var(--serif);font-weight:400;color:var(--accent-deep)}
.top{grid-area:top;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:1px solid var(--line);min-width:0}.crumb{font-size:12.5px;color:var(--ink-3);display:flex;align-items:center;gap:6px;min-width:0}.crumb b{color:var(--ink);font-weight:600}.sep{color:var(--ink-4)}.spacer{flex:1}.search{height:28px;width:240px;display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--line);background:var(--card);border-radius:var(--r-md);color:var(--ink-3);font-size:12.5px}.search:hover{border-color:var(--line-strong)}.search span:first-of-type{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kbd{font:10px/1.4 var(--mono);color:var(--ink-3);padding:1.5px 5px;border:1px solid var(--line);border-radius:3px;background:var(--paper-2);letter-spacing:0}.tbtn{height:28px;padding:0 10px;border-radius:var(--r-md);font-size:12.5px;color:var(--ink-2);display:inline-flex;align-items:center;gap:6px}.tbtn:hover{background:var(--paper-2);color:var(--ink)}
.av,.mini{display:inline-grid;place-items:center;border-radius:50%;background:var(--paper-3);color:var(--ink);font-weight:700;letter-spacing:0;flex-shrink:0}.av{width:22px;height:22px;font-size:10px}.mini{width:14px;height:14px;font-size:8px}.side{grid-area:side;background:var(--paper-2);border-right:1px solid var(--line);padding:14px 8px 10px;display:flex;flex-direction:column;overflow-y:auto;gap:2px}.side-section+.side-section{margin-top:14px}.side-section.archive{margin-top:auto;padding-top:14px;border-top:1px solid var(--line);opacity:.9}.side-label{font-size:10.5px;color:var(--ink-3);letter-spacing:.04em;text-transform:uppercase;padding:4px 10px 6px;display:flex;align-items:center;justify-content:space-between}.team{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:var(--r-sm);font-size:13px;color:var(--ink);font-weight:600;letter-spacing:0}.team:hover{background:var(--paper-3)}.team.active{background:var(--paper-3)}.team .caret{width:12px;color:var(--ink-3);flex-shrink:0}.dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}.team-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.count{font-size:11px;font-weight:500;color:var(--ink-3);font-variant-numeric:tabular-nums}.project-list{padding:1px 0 2px 22px;display:flex;flex-direction:column;gap:1px}.project-link{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:var(--r-sm);font-size:12.5px;color:var(--ink-2)}.project-link:hover{background:var(--paper-3);color:var(--ink)}.project-link .folder{width:12px;color:var(--ink-4);flex-shrink:0}.project-link .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11.5px/1.5 var(--mono);letter-spacing:0}.archive .team{color:var(--ink-3);font-weight:500;font-size:12.5px}.archive .team-name{font-style:italic}.side-foot{margin-top:12px;padding:6px 8px;font-size:11.5px;color:var(--ink-3);display:flex;align-items:center;gap:6px}.side-foot .me{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.side-foot b{color:var(--ink);font-weight:600}.new-team{margin-top:4px;padding:6px 8px;border-radius:var(--r-sm);font-size:12px;color:var(--ink-3);display:flex;align-items:center;gap:6px}.new-team .plus{width:14px;height:14px;border-radius:3px;border:1px dashed var(--line-strong);display:grid;place-items:center}
.main{grid-area:main;overflow-y:auto;display:flex;flex-direction:column}.main-inner{max-width:720px;width:100%;margin:0 auto;padding:40px 48px 64px}.page-head{margin-bottom:18px}.eyebrow{font-size:12px;color:var(--ink-3);margin-bottom:6px;display:flex;align-items:center;gap:6px}.page-head h1,.onboarding h1{margin:0;font-family:var(--serif);font-weight:400;font-size:38px;letter-spacing:0;line-height:1.05;color:var(--ink);text-wrap:balance}.page-head h1 em,.onboarding h1 em{font-style:italic;color:var(--accent-deep)}.sub{font-size:13.5px;color:var(--ink-2);margin:10px 0 0;line-height:1.55;max-width:560px}.sub b{color:var(--ink);font-weight:600}.cli-ribbon{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 12px;border:1px solid var(--line);background:var(--card);border-radius:var(--r-md);margin-bottom:28px;font-size:12px;color:var(--ink-2);font-variant-numeric:tabular-nums}.live{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);flex-shrink:0}.cli-ribbon .status{font-size:11.5px;color:var(--ink-3)}.cli-ribbon b{color:var(--ink);font-weight:600}.cli-ribbon .rule{width:1px;height:14px;background:var(--line);margin:0 2px}.cli-ribbon code,.cmd{font-family:var(--mono);font-size:11.5px;color:var(--ink);background:var(--paper-2);border-radius:4px;letter-spacing:0}.cli-ribbon code{padding:3px 8px;display:inline-flex;align-items:center;gap:4px}.prompt{color:var(--ink-4)}.copy{font-size:10.5px;color:var(--ink-3);padding:1px 4px;border-radius:3px;margin-left:2px}.copy:hover{background:var(--paper-2);color:var(--ink)}
.timeline{display:flex;flex-direction:column}.tl-day{display:grid;grid-template-columns:88px minmax(0,1fr);gap:24px;padding:4px 0 18px;position:relative}.tl-day+.tl-day{padding-top:18px;border-top:1px solid var(--line)}.tl-day>.label{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);padding-top:8px;font-weight:500}.tl-day>.label .label-meta{display:block;margin-top:4px;font-weight:400;color:var(--ink-4);text-transform:none;letter-spacing:0;font-size:11px}.tl-rows{display:flex;flex-direction:column}.tl-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:12px;align-items:flex-start;padding:8px 8px 8px 0;border-radius:var(--r-sm);position:relative}.tl-row:hover{background:var(--paper-2)}.tl-row:hover .row-act{opacity:1}.doc-glyph{width:28px;height:36px;background:var(--card);border:1px solid var(--line);border-radius:3px;position:relative;flex-shrink:0;overflow:hidden;margin-top:1px}.doc-glyph svg{display:block;width:100%;height:100%}.tl-row .body{min-width:0}.title{font-size:13.5px;font-weight:500;color:var(--ink);letter-spacing:0;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}.meta{font-size:12px;color:var(--ink-3);margin-top:2px;display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.path{font-family:var(--mono);font-size:11.5px;color:var(--ink-2);letter-spacing:0;overflow:hidden;text-overflow:ellipsis}.path .slash{color:var(--ink-4);padding:0 2px}.owner{display:inline-flex;align-items:center;gap:5px}.when{font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums;white-space:nowrap;padding-top:1px;min-width:56px;text-align:right}.row-act{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:1px;background:var(--paper-2);padding:2px;border-radius:5px;opacity:0;transition:opacity .12s}.ab{width:24px;height:24px;border-radius:4px;display:grid;place-items:center;color:var(--ink-3);font-size:13px}.ab:hover{background:var(--card);color:var(--ink)}
.onboarding{max-width:620px;width:100%;margin:0 auto;padding:64px 48px}.onboarding h1{font-size:44px}.lede{font-size:15px;color:var(--ink-2);margin-top:16px;line-height:1.6;max-width:500px}.steps{margin-top:36px;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--r-lg);background:var(--card);overflow:hidden}.step{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:18px;padding:18px 20px;align-items:flex-start}.step+.step{border-top:1px solid var(--line-soft)}.step .n{font-family:var(--serif);font-size:28px;color:var(--ink-3);line-height:1;font-style:italic;font-weight:400}.step .ttl{font-size:14px;font-weight:600;color:var(--ink);letter-spacing:0}.step .d{font-size:12.5px;color:var(--ink-3);margin-top:4px;line-height:1.5}.cmd{margin-top:10px;padding:10px 12px;border:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between;gap:8px}.step .right{font-size:11px;color:var(--ink-4);white-space:nowrap;padding-top:6px}.onb-foot{margin-top:28px;display:flex;align-items:center;justify-content:space-between;font-size:12.5px;color:var(--ink-3)}.onb-foot a{color:var(--accent-deep);border-bottom:1px solid currentColor;padding-bottom:1px}.cmdk-backdrop{position:fixed;inset:0;background:rgba(27,26,23,.16);backdrop-filter:blur(2px);display:grid;place-items:start center;padding-top:14vh;z-index:5}.cmdk-backdrop.hidden{display:none}.cmdk{width:min(560px,calc(100vw - 24px));background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 24px 60px -12px rgba(27,26,23,.24);overflow:hidden}.cmdk-input{display:flex;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}.cmdk-input input{flex:1;border:0;outline:0;background:transparent;font-size:14px}.cmdk-section{padding:7px}.cmdk-label{padding:5px 9px;color:var(--ink-3);font-size:11px}.cmdk-row{display:flex;align-items:center;gap:10px;padding:8px 9px;border-radius:6px;color:var(--ink)}.cmdk-row:hover{background:var(--paper-2)}.cmdk-row .right{margin-left:auto;color:var(--ink-3);font-size:12px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.empty{padding:20px 8px;color:var(--ink-3)}@media(max-width:780px){.app{grid-template-columns:1fr;grid-template-rows:48px auto 1fr;grid-template-areas:"brand" "top" "main"}.side{display:none}.top{grid-area:top;overflow:auto}.main-inner,.onboarding{padding:32px 18px 80px}.search{width:190px}.tl-day{grid-template-columns:1fr;gap:6px}.tl-day>.label{padding-top:0}.tl-row{grid-template-columns:36px minmax(0,1fr)}.tl-row .when{grid-column:2;text-align:left;padding-top:0}.cli-ribbon{flex-wrap:wrap}.step{grid-template-columns:42px 1fr}.step .right{display:none}.onboarding h1{font-size:38px}.page-head h1{font-size:34px}}
</style>
</head>
<body>
<div class="app">
${renderBrand(brand)}
${renderTop(data)}
${renderSidebar(data, liveTeams, legacyTeams)}
<main class="main">${onboarding ? renderOnboarding(data, legacyTeams) : renderTimeline(data, liveTeams, timelineRows)}</main>
</div>
${renderCommandPalette(paletteRows)}
<script>
(()=>{const p=document.querySelector(".cmdk-backdrop"),q=document.querySelector("#cmdk-q");function open(){p.classList.remove("hidden");q&&q.focus()}function close(){p.classList.add("hidden")}document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();open()}if(e.key==="Escape")close()});document.querySelectorAll("[data-cmdk]").forEach(x=>x.addEventListener("click",open));p.addEventListener("click",e=>{if(e.target===p)close()});document.querySelectorAll("[data-copy]").forEach(btn=>btn.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(btn.getAttribute("data-copy")||"")}catch{}}))})();
</script>
</body>
</html>`;
}

function renderBrand(brand: string): string {
  const safeBrand = escapeHtml(brand);
  return `<div class="brand"><div class="mark">${escapeHtml(brand.slice(0, 1).toLowerCase() || "h")}</div><div class="brand-name">${safeBrand.replace("dock", "<em>dock</em>")}</div></div>`;
}

function renderTop(data: DashboardData): string {
  return `<header class="top"><div class="crumb"><b>Home</b><span class="sep">·</span><span>${data.totals.pages} pages across ${data.totals.teams} ${data.totals.teams === 1 ? "team" : "teams"}</span></div><div class="spacer"></div><button class="search" type="button" data-cmdk><span>Search docs</span><span class="spacer"></span><span class="kbd">⌘K</span></button><a class="tbtn" href="https://github.com/leeguooooo/htmldock" rel="noreferrer">CLI</a><span class="av" style="background:${cssColor(data.user.avatarColor)}">${escapeHtml(data.user.initials)}</span></header>`;
}

function renderSidebar(data: DashboardData, liveTeams: DashboardData["teams"], legacyTeams: DashboardData["teams"]): string {
  const projectList = (teamSlug: string) =>
    data.projects
      .filter((project) => project.teamSlug === teamSlug)
      .slice(0, 6)
      .map(
        (project) =>
          `<div class="project-link"><span class="folder">▱</span><span class="name">${escapeHtml(project.slug)}</span><span class="count">${project.docCount}</span></div>`
      )
      .join("");

  const live = liveTeams
    .map((team, index) => `<section class="side-section"><div class="team ${index === 0 ? "active" : ""}"><span class="caret">⌄</span><span class="dot" style="background:${cssColor(team.color)}"></span><span class="team-name">${escapeHtml(team.name)}</span><span class="count">${team.docCount}</span></div><div class="project-list">${projectList(team.slug) || `<div class="empty">No projects yet.</div>`}</div></section>`)
    .join("");
  const archive = legacyTeams
    .map((team) => `<div class="team"><span class="caret">›</span><span class="dot" style="background:${cssColor(team.color)}"></span><span class="team-name">${escapeHtml(team.name.replace(/\s*\(migration backfill\)$/i, "") || "Pre-migration")}</span><span class="count">${team.docCount}</span></div>`)
    .join("");

  return `<aside class="side"><div class="side-section"><div class="side-label"><span>Teams</span></div>${live || `<div class="new-team"><span class="plus">+</span><span>Create your first team with the CLI</span></div>`}</div><div class="spacer"></div>${archive ? `<section class="side-section archive"><div class="side-label"><span>Archive</span></div>${archive}</section>` : ""}<div class="side-foot"><span class="av" style="background:${cssColor(data.user.avatarColor)}">${escapeHtml(data.user.initials)}</span><span class="me"><b>${escapeHtml(data.user.name)}</b></span></div></aside>`;
}

function renderTimeline(data: DashboardData, liveTeams: DashboardData["teams"], rows: DashboardRow[]): string {
  const firstName = data.user.name.split(/\s+/)[0] || data.user.name;
  const teamLabel = liveTeams.length === 1 ? liveTeams[0].name : `${liveTeams.length} teams`;
  return `<div class="main-inner"><header class="page-head"><div class="eyebrow"><span>${dateLabel()}</span><span class="sep">·</span><span>${escapeHtml(teamLabel)}</span></div><h1>Welcome back, <em>${escapeHtml(firstName)}</em>.</h1><p class="sub"><b>${data.totals.updatedToday}</b> docs updated today across <b>${data.totals.pages}</b> pages. Recent work is grouped by time, with legacy migration content kept in Archive.</p></header>${renderCliRibbon()}<section class="timeline">${renderTimelineDays(rows)}</section></div>`;
}

function renderCliRibbon(): string {
  return `<div class="cli-ribbon"><span class="live"></span><span class="status">Connected · <b>htmldock CLI</b></span><span class="rule"></span><code><span class="prompt">$</span>htmldock push</code><button class="copy" type="button" data-copy="htmldock push" title="Copy command">Copy</button><span class="spacer"></span><span class="status">Install from GitHub release</span></div>`;
}

function renderTimelineDays(rows: DashboardRow[]): string {
  if (rows.length === 0) return `<div class="empty">No active team documents yet. Publish from a repo with <span class="kbd">htmldock push</span>.</div>`;
  const groups = new Map<string, { meta?: string; rows: DashboardRow[] }>();
  for (const row of rows) {
    const key = row.dayLabel || inferredDayLabel(row.whenRel);
    const existing = groups.get(key) || { meta: row.dayMeta, rows: [] };
    existing.rows.push(row);
    if (!existing.meta && row.dayMeta) existing.meta = row.dayMeta;
    groups.set(key, existing);
  }
  const order = ["Today", "Yesterday", "Last week", "Earlier"];
  return [...groups.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([label, group]) => `<div class="tl-day"><div class="label">${escapeHtml(label)}${group.meta ? `<span class="label-meta">${escapeHtml(group.meta)}</span>` : ""}</div><div class="tl-rows">${group.rows.map(renderTimelineRow).join("")}</div></div>`)
    .join("");
}

function renderTimelineRow(row: DashboardRow): string {
  return `<article class="tl-row"><div class="doc-glyph">${renderDocGlyph(`${row.id}-${row.title}`, row.color || row.tag?.color || row.owner.color || "#0F8A6C")}</div><div class="body"><a class="title" href="/d/${row.id}">${escapeHtml(row.title)}</a><div class="meta"><span class="path">${renderPath(cleanPathLabel(row.pathLabel))}</span><span class="sep">·</span><span class="owner"><span class="mini" style="background:${cssColor(row.owner.color)}">${escapeHtml(row.owner.initials)}</span>${escapeHtml(row.owner.name)}</span></div></div><div class="when">${escapeHtml(row.whenRel)}</div><div class="row-act"><a class="ab" href="/d/${row.id}" title="Open" aria-label="Open">↗</a><button class="ab" type="button" title="Copy document link" aria-label="Copy document link" data-copy="/d/${row.id}">⛓</button></div></article>`;
}

function renderOnboarding(data: DashboardData, legacyTeams: DashboardData["teams"]): string {
  const firstName = data.user.name.split(/\s+/)[0] || data.user.name;
  const legacyCopy = legacyTeams.length > 0 ? ` Your pre-migration docs are preserved in Archive, but new work should come from a real team and project.` : "";
  return `<div class="onboarding"><div class="eyebrow"><span class="live"></span><span>Workspace ready · ${data.totals.pages} docs · ${data.totals.teams} teams</span></div><h1>You're set, <em>${escapeHtml(firstName)}</em>. Now connect a project.</h1><p class="lede">The HTML docs Claude Code generates in your repos — plans, runbooks, design briefs — land here and get organized by team and project.${escapeHtml(legacyCopy)}</p><div class="steps">${renderStep("i.", "Install the CLI", "Use the GitHub-published CLI binary or the htmldock skill installer.", "curl -fsSL https://raw.githubusercontent.com/leeguooooo/htmldock/main/scripts/install.sh | bash", "~ 1 min")}${renderStep("ii.", "Authenticate once", "Open a browser to Lark and issue a personal access token for CLI pushes.", "htmldock login", "~ 20 sec")}${renderStep("iii.", "Push from any git repo", "The CLI infers project metadata and uploads HTML docs under team → project → path.", "htmldock push", "~ 8 sec")}</div><div class="onb-foot"><div>No active team yet · push from a repo to start</div><a href="https://github.com/leeguooooo/htmldock" rel="noreferrer">CLI reference</a></div></div>`;
}

function renderStep(n: string, title: string, detail: string, command: string, time: string): string {
  return `<div class="step"><div class="n">${escapeHtml(n)}</div><div><div class="ttl">${escapeHtml(title)}</div><div class="d">${escapeHtml(detail)}</div><div class="cmd"><span><span class="prompt">$ </span><code>${escapeHtml(command)}</code></span><button class="copy" type="button" data-copy="${escapeHtml(command)}">Copy</button></div></div><span class="right">${escapeHtml(time)}</span></div>`;
}

function renderCommandPalette(rows: DashboardRow[]): string {
  const docs = rows
    .slice(0, 5)
    .map((row) => `<a class="cmdk-row" href="/d/${row.id}"><span class="dot" style="background:${cssColor(row.color || row.tag?.color || row.owner.color)}"></span><span>${escapeHtml(row.title)}</span><span class="right">${escapeHtml(cleanPathLabel(row.pathLabel))}</span></a>`)
    .join("");
  return `<div class="cmdk-backdrop hidden"><div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette"><div class="cmdk-input"><span>⌕</span><input id="cmdk-q" placeholder="Search docs"><span class="kbd">esc</span></div><div class="cmdk-section"><div class="cmdk-label">Search docs</div>${docs || `<div class="empty">No documents yet.</div>`}</div></div></div>`;
}

function renderDocGlyph(seed: string, color: string): string {
  const h = hash(seed);
  const rows = [0, 1, 2, 3, 4].map((i) => 12 + ((h >> (i * 3)) & 0xf));
  const blockRow = (h >> 17) % 5;
  const isBlock = ((h >> 23) & 1) === 1;
  return `<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="0" y="0" width="2" height="36" fill="${cssColor(color)}"></rect>${rows.map((w, i) => isBlock && i === blockRow ? `<rect x="5" y="${6 + i * 5}" width="16" height="3" rx="0.5" fill="#1B1A17" opacity="0.7"></rect>` : `<rect x="5" y="${7 + i * 5}" width="${w}" height="1.6" rx="0.8" fill="#1B1A17" opacity="${i === 0 ? "0.78" : "0.36"}"></rect>`).join("")}</svg>`;
}

function renderPath(pathLabel: string): string {
  return pathLabel
    .split(" / ")
    .map((part, index) => `${index > 0 ? `<span class="slash">/</span>` : ""}<span>${escapeHtml(part)}</span>`)
    .join("");
}

function cleanPathLabel(pathLabel: string): string {
  return pathLabel.replace(/\s*·\s*v\d+\b/gi, "").replace(/\bv\d+\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

function inferredDayLabel(whenRel: string): string {
  const value = whenRel.toLowerCase();
  if (value.includes("yesterday")) return "Yesterday";
  if (/^\d+[smh]\s+ago$/.test(value)) return "Today";
  const dayMatch = value.match(/^(\d+)d\s+ago$/);
  if (dayMatch && Number(dayMatch[1]) < 7) return "Last week";
  return "Earlier";
}

function isLegacyRow(row: DashboardRow, legacyProjectSlugs: Set<string>): boolean {
  const firstPart = row.pathLabel.split(" / ")[0] || "";
  return firstPart === "legacy" || legacyProjectSlugs.has(firstPart);
}

function dateLabel(): string {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(new Date());
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function cssColor(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^var\(--[a-z0-9-]+\)$/i.test(value) ? value : "#ECE7D9";
}
