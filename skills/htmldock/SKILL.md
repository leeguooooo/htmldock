---
name: htmldock
description: Use when creating, updating, or publishing HTML documentation through htmldock. Triggers include uploading HTML, publishing generated HTML docs, choosing htmldock paths, installing the htmldock CLI, or using htmldock tokens.
---

# htmldock

Use htmldock for HTML technical documents that should be published to the team document base.

## Upload Workflow

1. Confirm the target repo has `.htmldock.toml`. If it does not, run `htmldock init` once from the repo.
2. Keep the published file path at three display segments or fewer after `module_root` is removed.
3. Upload with:

```bash
htmldock push path/to/doc.html
```

Use `--public` only when the document is safe to share by public token.

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

```bash
npx skills add leeguooooo/htmldock --skill htmldock -a codex -g
```

Do not paste PAT values into chat or committed files.
