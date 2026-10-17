---
name: stack-up
description: Start the local stack (Docker Desktop, then the household-hub Supabase containers). Use when the user says "stack up", "start the stack", "start Supabase", or before running e2e, pgTAP, or gen:types against a stopped stack.
---

# Stack up

Run from the repo root (the main checkout or a worktree; all worktrees share one stack).

1. Make sure Docker is running. If `docker info >/dev/null 2>&1` fails, run `open -a Docker`, then poll `docker info` every few seconds (use Monitor with an until-loop, not `sleep`) for up to 2 minutes. If it never comes up, stop and tell the user.
2. Start Supabase: `supabase start`. If `supabase status` already succeeds, skip this and say it was already running. On a port conflict, run `docker ps --format '{{.Names}}' | grep supabase_` and report which other project holds the ports; do not stop it without asking.
3. Verify: `supabase status -o env` exits 0, and `curl -sf "$API_URL/auth/v1/health"` (with `API_URL` from that output) returns 2xx. The API port is 54331, not the Supabase default.
4. Report the API URL and Studio URL from step 3.

Do not start Vite. If the user wants the app too, `npm run dev:vite` serves it against the running stack (`npm run dev` would also try to manage Supabase).
