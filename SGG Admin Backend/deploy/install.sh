#!/bin/bash
#
# Installs the SGG Admin server as a launchd user agent, plus a nightly
# SQLite backup job. Safe to re-run: it reloads both jobs in place.
#
#   ./deploy/install.sh
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
AGENTS="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"

if [ -z "$NODE_BIN" ]; then
  echo "error: node not found on PATH." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  echo "error: $APP_DIR/.env is missing. Copy .env.production to .env first." >&2
  exit 1
fi

# SITE_ROOT has moved before; a service that publishes into a phantom folder
# fails silently, so refuse to install against a path with no site in it.
SITE_ROOT="$(cd "$APP_DIR" && "$NODE_BIN" -e \
  "import('./src/lib/config.js').then(m => { \
     if (!m.siteExists()) { console.error(m.config.siteRoot); process.exit(1); } \
     console.log(m.config.siteRoot); })" 2>/dev/null)" || {
  echo "error: no index.html found at the configured SITE_ROOT." >&2
  echo "       Fix SITE_ROOT in $APP_DIR/.env before installing." >&2
  exit 1
}

mkdir -p "$APP_DIR/logs" "$APP_DIR/data" "$APP_DIR/data-backups" "$AGENTS"

# Keep Dropbox out of the database and its WAL sidecar. Dropbox syncing a live
# SQLite file mid-write is a known way to corrupt it.
for dir in data data-backups logs node_modules backups uploads; do
  xattr -w com.dropbox.ignored 1 "$APP_DIR/$dir" 2>/dev/null || true
done

install_agent() {
  local label="$1"
  local plist="$AGENTS/$label.plist"

  sed -e "s|__NODE__|$NODE_BIN|g" -e "s|__APP_DIR__|$APP_DIR|g" \
    "$APP_DIR/deploy/$label.plist" > "$plist"

  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$plist"
  launchctl enable "gui/$UID_NUM/$label"
  echo "  installed $label"
}

install_agent co.sgg.admin
install_agent co.sgg.admin.backup

echo
echo "SGG Admin installed."
echo "  node:       $NODE_BIN"
echo "  app:        $APP_DIR"
echo "  publishing: $SITE_ROOT"
echo "  database:   $APP_DIR/data/sgg.db  (nightly snapshots in data-backups/)"
echo "  logs:       $APP_DIR/logs/admin.log"
echo
echo "Waiting for the server to answer..."
for _ in $(seq 1 20); do
  if curl -fsS "http://localhost:${PORT:-4000}/healthz" >/dev/null 2>&1; then
    curl -s "http://localhost:${PORT:-4000}/healthz"
    echo
    exit 0
  fi
  sleep 0.5
done

echo "warning: no response from /healthz yet — check logs/admin.error.log" >&2
