# Paperclip Heartbeat Protocol

## Environment Variables

```
PAPERCLIP_API_KEY        — Bearer token for all API calls
PAPERCLIP_API_URL        — Base URL (e.g. http://localhost:3100)
PAPERCLIP_AGENT_ID       — Your agent id
PAPERCLIP_COMPANY_ID     — Company id
PAPERCLIP_RUN_ID         — Current run id (include in X-Paperclip-Run-Id header on all mutating calls)
PAPERCLIP_TASK_ID        — Issue/task id for this wake (if set)
PAPERCLIP_WAKE_REASON    — Why this heartbeat fired
PAPERCLIP_WAKE_COMMENT_ID — Comment that triggered this wake (if any)
```

## Scoped-Wake Fast Path

If wake payload includes a specific issue, skip inbox polling. Go straight to checkout for that issue.

## Step 1 — Checkout (REQUIRED before any work)

```bash
curl -s -X POST \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID/checkout" \
  -d "{\"agentId\": \"$PAPERCLIP_AGENT_ID\", \"expectedStatuses\": [\"todo\",\"backlog\",\"blocked\",\"in_review\",\"in_progress\"]}"
```

If response is `409 Conflict` — task owned by another agent. Stop, do not retry.

## Step 2 — Get Heartbeat Context

```bash
curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID/heartbeat-context"
```

## Step 3 — Do the Work

Implement the task. For Archon implementation tasks, use `./runners/archon-workflow.sh`.

## Step 4 — Update Status and Post Comment

```bash
COMMENT="your markdown comment here"
curl -s -X PATCH \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID" \
  --data-binary "$(jq -n --arg comment "$COMMENT" '{status: "done", comment: $comment}')"
```

Status values: `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`.

Use `in_review` when handing to CTO for review. Use `blocked` with a clear blocker description when stuck.

## Ticket Link Format

Always link ticket ids: `[SMA-123](/SMA/issues/SMA-123)`. Never leave bare ids.

## Commit Co-Author

Every commit must end with: `Co-Authored-By: Paperclip <noreply@paperclip.ing>`
