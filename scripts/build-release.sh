#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
mkdir -p "$DIST"

targets=(
  "bun-darwin-arm64:htmldock-darwin-arm64"
  "bun-darwin-x64:htmldock-darwin-x64"
  "bun-linux-x64:htmldock-linux-x64"
)

for item in "${targets[@]}"; do
  target="${item%%:*}"
  name="${item##*:}"
  bun build "$ROOT/src/cli.ts" --compile --target="$target" --outfile="$DIST/$name"
  chmod +x "$DIST/$name"
done

cd "$DIST"
shasum -a 256 htmldock-* > SHA256SUMS
