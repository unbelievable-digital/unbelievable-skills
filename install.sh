#!/bin/sh
# Install the Unbelievable Skills plugin for Claude Code.
#
#   curl -fsSL https://raw.githubusercontent.com/unbelievable-digital/unbelievable-skills/main/install.sh | bash
#
set -eu

REPO="unbelievable-digital/unbelievable-skills"
MARKETPLACE="unbelievable"
PLUGIN="unbelievable-skills@unbelievable"

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found. Install Claude Code first: https://claude.com/claude-code" >&2
  exit 1
fi

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

echo "==> Adding marketplace ($REPO)"
if claude plugin marketplace add "$REPO" >"$LOG" 2>&1; then
  :
elif grep -qi "already exists" "$LOG"; then
  echo "    already added, skipping."
else
  cat "$LOG" >&2
  exit 1
fi

echo "==> Installing plugin ($PLUGIN)"
claude plugin install "$PLUGIN"

echo ""
echo "Done. Restart Claude Code (or start a new session) to pick up the skills."
echo "Check: claude plugin list"
