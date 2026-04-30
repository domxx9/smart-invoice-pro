# Archon Installation Guide

## Correct Package

Archon is **not** the npm package `archon`. That is an unrelated tool.
The correct package is `@archon/cli` from https://github.com/coleam00/Archon.

## Install (One-Time, Per Machine)

```bash
# 1. Install Bun (if not already installed)
npm install -g bun          # via npm wrapper (works without sudo)
# OR: curl -fsSL https://bun.sh/install | bash  (requires unzip)

# 2. Clone Archon globally
git clone --depth=1 https://github.com/coleam00/Archon ~/.archon-cli

# 3. Install dependencies
cd ~/.archon-cli && bun install

# 4. Add archon alias to shell profile
echo 'alias archon="bun ~/.archon-cli/packages/cli/src/cli.ts"' >> ~/.bashrc
source ~/.bashrc

# 5. Verify
archon --version
```

## Auth

Archon uses global Claude auth by default (`CLAUDE_USE_GLOBAL_AUTH=true`).
No additional setup needed if Claude Code is already authenticated on the machine.

Archon also reads `~/.archon/.env` for overrides. Create it if needed:

```bash
mkdir -p ~/.archon
cat >> ~/.archon/.env << 'EOF'
# Optional: override model
# ANTHROPIC_MODEL=claude-sonnet-4-6
EOF
```

## Environment Variable Passthrough

Paperclip `PAPERCLIP_*` env vars injected by the heartbeat harness **survive**
Archon's env stripping. The strip logic only removes:

- Keys defined in the CWD `.env*` files (Bun auto-loads these)
- `CLAUDECODE=1` and non-auth `CLAUDE_CODE_*` markers

`PAPERCLIP_TASK_ID`, `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY`, and
`PAPERCLIP_RUN_ID` are all safe to use inside Archon `bash:` nodes.

## Running the Paperclip Workflow

```bash
# From the project root (inside a Paperclip heartbeat):
archon workflow run paperclip-fix "$PAPERCLIP_TASK_ID"
```

Or use the helper script:

```bash
./runners/archon-workflow.sh "$PAPERCLIP_TASK_ID"
```

## Updating Archon

```bash
cd ~/.archon-cli && git pull && bun install
```
