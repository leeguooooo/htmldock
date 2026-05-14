#!/usr/bin/env bash
set -euo pipefail

REPO="${HTMLDOCK_REPO:-leeguooooo/htmldock}"
VERSION="${HTMLDOCK_VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
  *) echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

asset="htmldock-$os-$arch"
if [ "$VERSION" = "latest" ]; then
  url="https://github.com/$REPO/releases/latest/download/$asset"
else
  url="https://github.com/$REPO/releases/download/$VERSION/$asset"
fi

mkdir -p "$INSTALL_DIR"
curl -fsSL "$url" -o "$INSTALL_DIR/htmldock"
chmod +x "$INSTALL_DIR/htmldock"

echo "Installed $("$INSTALL_DIR/htmldock" --version 2>/dev/null || echo htmldock) to $INSTALL_DIR/htmldock"
