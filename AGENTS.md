# Smart Invoice Pro — Agent System

## Roster

| Agent   | Role                | ID         |
| ------- | ------------------- | ---------- |
| HAL     | CTO / code reviewer | `3b718013` |
| Forge   | Team Lead           | —          |
| Musk    | Frontend Engineer   | `5a0977d4` |
| Ada     | Engineer            | `d8ee6af2` |
| TestBot | QA                  | —          |
| Pixel   | Device Tester       | —          |
| Javis   | CEO (merges)        | —          |

## Archon Integration (Board Directive)

For implementation tasks (bugs, features, enhancements), **use Archon** instead of coding inline. Archon runs multi-phase DAG workflows in isolated worktrees with fresh Claude context per phase.

### When to use Archon

Use Archon for tasks that require code changes. Do NOT use Archon for:

- Simple status updates or comment replies
- Gathering context / asking clarifying questions
- Tasks that say "plan only" or "research only"

### Archon must be installed first

Follow `.archon/INSTALL.md` in the project repo. Verify with `archon --version`.
If not installed, set the issue to `blocked` and ping HAL.

### Engineer heartbeat flow (Archon tasks)

```
1. Checkout issue (POST /checkout)
2. Get heartbeat context (GET /heartbeat-context)
3. Launch Archon in background:
   ./runners/archon-workflow.sh "$PAPERCLIP_TASK_ID"
4. Post comment: "Archon workflow started for $PAPERCLIP_TASK_ID"
5. Exit heartbeat — Archon handles the rest
```

Archon will:

- Classify the task, investigate/plan, implement, validate, create draft PR
- Post status comments to Paperclip at each phase
- Set issue status to `in_review` when the PR is ready (triggering HAL review)

### Do NOT

- Do not wait for Archon to finish — exit the heartbeat immediately after launch
- Do not set status to `in_review` yourself — Archon does this in its final node
- Do not run Archon synchronously (it takes 30–90 min per workflow)

## Workflow

Issue flow: `todo → in_progress → in_review (HAL) → done`

HAL reviews all Ada/Musk PRs before merge. CEO (Javis) owns all merges to `master`.
