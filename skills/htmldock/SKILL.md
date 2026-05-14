---
name: htmldock
description: Use when creating, updating, or publishing HTML documentation through htmldock. Triggers include uploading HTML, publishing generated HTML docs, choosing htmldock paths, installing the htmldock CLI, or using htmldock tokens.
---

# htmldock

Use htmldock for HTML technical documents that should be published to the team document base.

## Agent Autopilot

When the user wants to upload or publish HTML, do not ask how to install the CLI.

1. Check whether `htmldock` works:

```bash
command -v htmldock && htmldock --version
```

2. If it is missing, install it automatically from the GitHub Release binary. Prefer the bundled installer:

```bash
installer="$(find "$HOME/.codex/skills" "$HOME/.agents/skills" -path "*/htmldock/scripts/install-cli.sh" -print -quit 2>/dev/null)"
if [ -n "$installer" ]; then
  bash "$installer"
else
  curl -fsSL https://raw.githubusercontent.com/leeguooooo/htmldock/main/scripts/install.sh | bash
fi
```

3. If the binary was installed to `~/.local/bin` and that directory is not in PATH, run it by absolute path for this session:

```bash
~/.local/bin/htmldock --version
```

4. If the user says they already have a token, configure it with `htmldock config set-token <token> --server <server>`. Never ask the user to choose between install methods.

## Upload Workflow

1. Confirm the target repo has `.htmldock.toml`. If it does not, run `htmldock init` once from the repo. **`team` is required** in `.htmldock.toml`; ask the user which team this repo belongs to, or run `htmldock team list` to see joined teams.
2. **Before writing the HTML**, run `htmldock list --tree` for the current project to see the existing module tree. **Reuse existing module prefixes** (`auth/`, `billing/`, `infra/`) rather than inventing synonyms (`authentication/`, `infrastructure/`).
3. Keep the published file path at **three display segments or fewer** after `module_root` is removed:
   - ✓ `auth-redesign.html` (1 level)
   - ✓ `auth/login-flow.html` (2 levels)
   - ✓ `auth/oauth/lark-integration.html` (3 levels)
   - ✗ `auth/oauth/lark/v2/proposal.html` — server rejects with `path_too_deep`
4. Upload with:

```bash
htmldock push path/to/doc.html
```

Use `--public` only when the document is safe to share by public token.

## Team Workflow

```bash
htmldock team create acme-infra "Acme Infrastructure"  # create team (you become admin)
htmldock team list                                      # list teams you joined
htmldock team add acme-infra alice@example.com          # admin: invite member
```

## Deleting Documents

Hard delete — no recycle bin, not recoverable:

```bash
htmldock delete <doc-id>                  # delete one doc (you own it, or you are team admin)
htmldock project delete acme-infra/cherry --yes  # delete whole project (team admin only)
```

## HTML Style Reference

When generating the HTML you are about to publish, match the patterns in
[`ThariqS/html-effectiveness`](https://github.com/ThariqS/html-effectiveness)
— Thariq Shihipar's 20-file companion to his essay
*The Unreasonable Effectiveness of HTML*. Use the file whose category
fits the doc you are writing:

| Doc kind | Reference file in `ThariqS/html-effectiveness` |
|---|---|
| Exploration of options (code/visual) | `01-exploration-code-approaches.html`, `02-exploration-visual-designs.html` |
| Code review / PR walkthrough | `03-code-review-pr.html`, `17-pr-writeup.html` |
| Code understanding / module walkthrough | `04-code-understanding.html` |
| Design system / component variants | `05-design-system.html`, `06-component-variants.html` |
| Animation / interaction prototype | `07-prototype-animation.html`, `08-prototype-interaction.html` |
| Slide deck | `09-slide-deck.html` |
| SVG illustration / diagram | `10-svg-illustrations.html`, `13-flowchart-diagram.html` |
| Status / weekly / quarterly report | `11-status-report.html` |
| Incident / postmortem / RCA | `12-incident-report.html` |
| Feature explainer / research deep-dive | `14-research-feature-explainer.html`, `15-research-concept-explainer.html` |
| Implementation plan | `16-implementation-plan.html` |
| Tunable / editable artifact (knobs, triage board) | `18-editor-triage-board.html`, `19-editor-feature-flags.html`, `20-editor-prompt-tuner.html` |

A hosted mirror of all 20 examples lives at
`https://htmldock.pwtk-dev.work` under team `html-effectiveness`,
project `gallery`. Browse there for quick visual comparison without
cloning the repo.

Style invariants to copy:

- Self-contained `<style>` in `<head>` — no external CDN, no JS frameworks
- CSS custom properties on `:root` for the palette
- Semantic tags (`<header>`, `<section>`, `<aside>`, `<table>`) — not div soup
- Tables beat nested bullet lists for structured data
- One accent color + two or three grays — no decoration for its own sake
- Font stack: `-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Inter", sans-serif`

## Token Setup

The CLI reads `~/.config/htmldock/config.toml`:

```toml
server_url = "https://<your-htmldock-url>"
pat = "hd_pat_..."
default_project_sync = "off"
```

If no token is configured, run:

```bash
htmldock login
```

If the user already has a PAT, configure it with:

```bash
htmldock config set-token hd_pat_... --server https://<your-htmldock-url>
```

## Useful Commands

```bash
htmldock list
htmldock push ./design.html --public
htmldock share 1 --ttl-days 30
htmldock open 1
```

## Install This Skill

Platform-agnostic; install once for every agent on the machine:

```bash
npx skills add leeguooooo/htmldock --skill htmldock -g
```

(Pass `-a <agent>` to scope to one runner, e.g. `-a codex` or `-a claude`. Default registers for all detected agents.)

Do not paste PAT values into chat or committed files.
