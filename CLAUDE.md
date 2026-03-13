# Gmail Triage — Claude Instructions

## On Startup
Complete ALL steps before responding to the user. Do not greet until every step is done.

1. Read the project memory file at `.claude/memory/MEMORY.md`
2. Check for stale worktree session memory files:
   - Look for `MEMORY.md` files under `C:\Users\<user>\.claude\projects\` in any directory matching `*--claude-worktrees-*`
   - For each one found, read it and compare to `.claude/memory/MEMORY.md`
   - If it contains anything not already captured, merge the new information into `.claude/memory/MEMORY.md`, then delete the stale file
   - If nothing new, just delete the stale file silently
3. Check for old Claude worktrees by running `scripts/cleanup-worktrees.ps1 -WhatIf`
   - Show the output so the user can see what would be removed
   - Ask if they want to proceed — if yes, run `scripts/cleanup-worktrees.ps1` (without -WhatIf)
   - If nothing to remove, note it briefly in the greeting
4. Greet the user briefly: confirm you're up to speed on the project (key files, deploy setup, recent work), and summarize the worktree check result

## Project Essentials
- Main app: `app/triage.js` (Express routes) + `app/lib/` (all logic/pages)
- Deploy: `.\deploy.ps1` — syncs to `Y:\gmail-triage` via robocopy
- Config (not in git): `config/credentials.json`, `config/token.json`, `config/blocklist.json`, `config/stats.json`
- Run: `docker-compose up` (or `cd app && npm start`)

## Preferences
- Keep responses concise
- No emojis
- Don't over-engineer — minimal changes for the task at hand
