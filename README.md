# htmldock

Team HTML document publishing on Cloudflare Workers, D1, and R2.

## What is implemented

- Upload HTML documents with `POST /api/docs`.
- Store original HTML in R2 and metadata in D1.
- Maintain FTS5 search rows from Worker code.
- List and search documents.
- Create public share links for `public-allowed` documents.
- Serve standalone document reader pages with a very small navigation bar.
- Keep uploaded HTML styling isolated in an iframe.
- Protect private `/d/:id` reads behind a session check.
- Support PAT scopes for CLI/API writes.
- Create/revoke browser session PATs.
- Provide a Bun CLI with `init`, `login`, `logout`, `push`, `list`, `share`, `open`, and `whoami`.

## Cloudflare resources

The current deployment uses the `Xdreamstar2025` wrangler-accounts profile.

- Worker: `htmldock`
- URL: `https://htmldock.pwtk-dev.work`
- D1 database: `htmldock`
- D1 database id: `217ee43a-dd87-45b2-85d5-ef1902302a83`
- R2 bucket: `htmldock-docs`

## Required secrets

`HMAC_SECRET` is required and has been set on the deployed Worker.

Lark login is implemented but not enabled until these secrets are set:

```bash
wrangler-accounts --profile Xdreamstar2025 secret put LARK_CLIENT_ID
wrangler-accounts --profile Xdreamstar2025 secret put LARK_CLIENT_SECRET
```

The Lark redirect URL must be allowed in the Lark app:

```text
https://htmldock.pwtk-dev.work/api/auth/lark/callback
```

## Local checks

```bash
bun test
bunx tsc --noEmit
wrangler-accounts --profile Xdreamstar2025 deploy --dry-run --outdir .wrangler/dry-run
```

## Deploy

```bash
wrangler-accounts --profile Xdreamstar2025 d1 migrations apply htmldock --remote
wrangler-accounts --profile Xdreamstar2025 deploy
```

## Smoke verification

```bash
curl -fsS https://htmldock.pwtk-dev.work/health
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  https://htmldock.pwtk-dev.work/d/1
curl -fsS 'https://htmldock.pwtk-dev.work/api/search?q=Smoke'
```

Expected:

- `/health` returns `{"ok":true,"service":"htmldock"}`.
- `/d/1` returns `302` to `/api/auth/lark` when unauthenticated.
- Search returns the smoke document if the deployment smoke data is present.

## Install CLI from GitHub

The CLI is distributed through GitHub Releases, not npm.

```bash
curl -fsSL https://raw.githubusercontent.com/leeguooooo/htmldock/main/scripts/install.sh | bash
```

Set `HTMLDOCK_REPO` if the repository lives under a different GitHub owner:

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/htmldock/main/scripts/install.sh | HTMLDOCK_REPO=<owner>/htmldock bash
```

Release assets are built by `.github/workflows/release-cli.yml` when pushing a `v*` tag.

## CLI config

Browser-based CLI login:

```bash
htmldock login --server https://htmldock.pwtk-dev.work
```

The CLI reads:

```text
~/.config/htmldock/config.toml
```

Example:

```toml
server_url = "https://htmldock.pwtk-dev.work"
pat = "hd_pat_..."
default_project_sync = "off"
```

If you already have a PAT:

```bash
htmldock config set-token hd_pat_... --server https://htmldock.pwtk-dev.work
```

Common commands:

```bash
htmldock init
htmldock push path/to/doc.html --public
htmldock list
htmldock share 1 --ttl-days 30
htmldock open 1
```

For local development before a release, replace `htmldock` with `bun src/cli.ts`.

## Codex skill

A distributable skill is included at `skills/htmldock/SKILL.md`.

Install it with the `skills.sh` CLI:

```bash
npx skills add leeguooooo/htmldock --skill htmldock -a codex -g
```

For project-local installation, omit `-g`:

```bash
npx skills add leeguooooo/htmldock --skill htmldock -a codex
```

The skill is deployment-agnostic. After installing it, configure the CLI for your own htmldock deployment:

```bash
htmldock config set-token hd_pat_... --server https://docs.example.com
```

The skill includes `scripts/install-cli.sh`, so agents can install the GitHub Release binary automatically when `htmldock` is not already in PATH. This avoids asking users to pick an installation method during upload tasks.
