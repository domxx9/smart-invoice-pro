#!/usr/bin/env bash
# runners/archon-workflow.sh
#
# Helper: launch an Archon paperclip-fix workflow for a Paperclip task.
# Intended to be called from an engineer agent (Ada/Musk) heartbeat.
#
# Usage:
#   ./runners/archon-workflow.sh [TASK_ID]
#
# If TASK_ID is omitted, falls back to $PAPERCLIP_TASK_ID env var.
#
# Env vars expected (injected by Paperclip harness):
#   PAPERCLIP_TASK_ID, PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_RUN_ID
#
# Archon must be installed per .archon/INSTALL.md.
# After this script exits, Archon runs in the background and sets the issue
# to in_review when complete. The heartbeat can exit immediately.

set -euo pipefail

TASK_ID="${1:-${PAPERCLIP_TASK_ID:-}}"

if [ -z "$TASK_ID" ]; then
  echo "ERROR: No task ID. Pass as argument or set PAPERCLIP_TASK_ID." >&2
  exit 1
fi

# Locate archon — prefer alias, fall back to bun direct invocation
if command -v archon &>/dev/null; then
  ARCHON_CMD="archon"
elif [ -f "$HOME/.archon-cli/packages/cli/src/cli.ts" ]; then
  ARCHON_CMD="bun $HOME/.archon-cli/packages/cli/src/cli.ts"
elif command -v npx &>/dev/null; then
  # Last resort: use npx bun (slower, downloads on first run)
  ARCHON_CMD="npx bun $HOME/.archon-cli/packages/cli/src/cli.ts"
else
  echo "ERROR: archon not found. Follow .archon/INSTALL.md to install." >&2
  exit 1
fi

echo "Starting Archon paperclip-fix for task: $TASK_ID"

# Run in background — heartbeat exits immediately, Archon runs async
$ARCHON_CMD workflow run paperclip-fix "$TASK_ID" \
  --env PAPERCLIP_TASK_ID="$TASK_ID" \
  --env PAPERCLIP_API_URL="${PAPERCLIP_API_URL:-}" \
  --env PAPERCLIP_API_KEY="${PAPERCLIP_API_KEY:-}" \
  --env PAPERCLIP_RUN_ID="${PAPERCLIP_RUN_ID:-}" \
  &

ARCHON_PID=$!
echo "Archon workflow started (PID $ARCHON_PID). Heartbeat can exit."
echo "Archon will set issue $TASK_ID to in_review when complete."
