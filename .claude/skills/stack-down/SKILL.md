---
name: stack-down
description: Stop the local stack (the household-hub Supabase containers via the CLI, then any household-hub Docker container still running). Use when the user says "stack down", "stop the stack", "shut down Supabase", or is done for the day.
---

# Stack down

Run from the repo root. All worktrees share this stack, so stopping it breaks e2e or dev servers running in other worktrees; if `git worktree list` shows more than the main checkout, mention that in the report.

1. If `docker info >/dev/null 2>&1` fails, Docker is already down. Say so and stop.
2. Stop Supabase: `npx supabase stop`. This keeps the database volume, so local data survives. Never add `--no-backup` unless the user asks to wipe local data.
3. Stop any household-hub container the CLI left behind: `docker ps -q --filter name=_household-hub | xargs -r docker stop`. Containers from other projects (for example `supabase_*_okaeri-resort`) are not touched.
4. Verify: `docker ps --filter name=_household-hub --format '{{.Names}}'` prints nothing. Report what was stopped, and list any other projects' containers still running so the user knows.

Leave Docker Desktop itself running unless the user asks to quit it.
