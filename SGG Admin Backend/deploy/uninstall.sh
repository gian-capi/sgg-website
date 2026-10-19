#!/bin/bash
#
# Removes the launchd agents. Leaves data/, data-backups/ and the site alone.
#
set -euo pipefail

UID_NUM="$(id -u)"

for label in co.sgg.admin co.sgg.admin.backup; do
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
  echo "  removed $label"
done

echo
echo "Agents removed. The database in data/ and its snapshots are untouched."
