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
