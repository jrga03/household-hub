# Deployment Guide

How Household Hub reaches production, and how to roll it back.

## Production Environment

Everything runs on free tiers.

- **App**: Cloudflare Pages serves the static build in `dist/` and auto-deploys every push to `main`. `public/_headers` sets the security headers and the CSP.
- **Database and auth**: Supabase Free. It pauses an idle project, so the [Keep-alive Worker](#keep-alive-worker) queries it every 3 days.
- **Assistant**: a Cloudflare Worker in front of Workers AI, with Groq as the fallback. See [Assistant Worker](#assistant-worker).
- **Error tracking**: Sentry, only when `VITE_SENTRY_DSN` is set. See [Monitoring](#monitoring).

The production URLs are not recorded here. Find them in the Cloudflare dashboard (Workers & Pages) and the Supabase dashboard.

---

## Environment Variables

Set these in the Pages project's **Settings → Variables and Secrets**. Every `VITE_*` value ends up in the public bundle, so never put a secret here.

### Required Variables

| Variable                 | Description                                         |
| ------------------------ | --------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Production Supabase project URL                     |
| `VITE_SUPABASE_ANON_KEY` | Production Supabase anon (publishable) key (public) |

### Optional Variables

| Variable             | Description                                                                                                                                                                   | Example                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `VITE_SENTRY_DSN`    | Sentry project DSN. Unset, Sentry stays off                                                                                                                                   | `https://xxx@sentry.io/xxx`                       |
| `VITE_APP_VERSION`   | App version for release tracking                                                                                                                                              | `0.0.1` (from package.json)                       |
| `VITE_ASSISTANT_URL` | The [Assistant Worker](#assistant-worker)'s URL. Unset, the app has no Assistant screen or nav entry. The build adds its origin to the CSP's `connect-src` in `dist/_headers` | `https://household-hub-assistant.xxx.workers.dev` |

Supabase values are under the project's **Settings → API**. The Sentry DSN is under the Sentry project's **Settings → Client Keys (DSN)**.

### GitHub Secrets

CI (`.github/workflows/ci.yml`) reads these from **Settings → Secrets and variables → Actions**:

| Secret                      | Used by                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`         | `build` (dummy value when unset) and `e2e`                              |
| `VITE_SUPABASE_ANON_KEY`    | `build` (dummy value when unset) and `e2e`                              |
| `SUPABASE_SERVICE_ROLE_KEY` | `e2e`. Without all three Supabase secrets, the full e2e job is skipped. |

The `database` and `e2e-smoke` jobs run against a local Supabase stack and need no secrets.

---

## Deployment Process

### The App

1. Merge a PR into `main`. The `main` ruleset requires a PR and the `lint`, `typecheck`, `unit-tests` and `knip` checks.
2. Cloudflare Pages sees the push and builds on its own. It does not wait for GitHub Actions.
3. The new version is live when the Pages build finishes. Open clients see the update prompt within 15 minutes (`src/hooks/useServiceWorker.ts`).

To redeploy without a code change, retry the latest deployment in the Pages dashboard (**Deployments**). Do not push an empty commit; `main` takes changes only through PRs.

### Database Migrations

Pages does not apply migrations. A migration ships in its own PR with the regenerated `src/types/database.types.ts` (`npm run gen:types`; CI's `database` job fails on drift). The maintainer applies it to production by hand with `supabase db push` after the PR merges and before the app that needs it goes live. Agents never touch the linked project (`scripts/agent-bash-guard.mjs` blocks it).

### Preview Deployments

None. Only `main` deploys; branches and PRs get no preview build. A preview would also need its origin in the Assistant Worker's `ALLOWED_ORIGINS` and `VITE_ASSISTANT_URL` set for the Preview environment.

---

## Keep-alive Worker

Supabase Free pauses a project after a week without activity, and a paused project refuses every sync until someone restores it in the dashboard. `workers/keep-alive` is a separate Cloudflare Worker whose cron (`0 0 */3 * *`, 00:00 UTC on days 1, 4, 7, …, 31) calls `public.keep_alive()` through the REST API, so runs are never more than 3 days apart.

The function returns `true` and reads no table. Of the client roles, only `anon` can execute it, and `anon` has no grant on households, membership or events (`supabase/tests/060_keep_alive.sql`). So the Worker uses the anon key, which is already public in the app bundle.

### Secrets

| Secret              | Value                                                |
| ------------------- | ---------------------------------------------------- |
| `SUPABASE_URL`      | Production Supabase project URL                      |
| `SUPABASE_ANON_KEY` | Production anon (publishable) key, same as the app's |

```bash
cd workers/keep-alive
npx wrangler@4.149.0 secret put SUPABASE_URL
npx wrangler@4.149.0 secret put SUPABASE_ANON_KEY
npx wrangler@4.149.0 deploy
```

Deploy again only when `workers/keep-alive` changes; pushes to `main` don't deploy it.

### Run it locally

With `supabase start` running and the migrations applied:

```bash
cd workers/keep-alive
cp .dev.vars.example .dev.vars   # fill SUPABASE_ANON_KEY from `supabase status -o env`
npx wrangler@4.149.0 dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+0+*/3+*+*"
```

The Wrangler log prints `Supabase keep-alive succeeded`. A failed query logs `Supabase keep-alive failed: <status> <body>` as an error and fails the run, which shows up under the Worker's Observability tab in Cloudflare (enabled in `wrangler.jsonc`).

---

## Assistant Worker

`workers/assistant` is the in-app assistant's only server part. It accepts `POST` with `Authorization: Bearer <Supabase access token>` and `{ messages, tools }` in the OpenAI chat shape, verifies the token, and streams `@cf/openai/gpt-oss-120b` back as server-sent events through the `AI` binding. The app defines the tools; the Worker only forwards them. It keeps no conversation and never logs message content.

- **Token check:** ES256 against `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (held in memory, refetched for an unknown key id at most once a minute), with `exp`, `aud: "authenticated"` and `iss: <SUPABASE_URL>/auth/v1`. Anything else gets `401`.
- **CORS:** only the origins in `ALLOWED_ORIGINS` get CORS headers, and a request from any other origin gets `403`. A request with no `Origin` header (curl, a script) still needs a valid token; browsers always send `Origin` on the app's cross-origin calls.
- **Limits:** on AiError 3040 (out of capacity) it retries once after 1 s, then answers `503 { "error": "busy" }`. On 3036 (daily neurons used up) it sends the same request to Groq `openai/gpt-oss-120b` and keeps doing so until 00:00 UTC (each isolate remembers this in memory). When Groq answers 429 too, or `GROQ_API_KEY` is unset, it answers `429 { "error": "daily_limit", "resetsAt": "…" }`: the next 00:00 UTC, or sooner if Groq's `retry-after` (a minute when it sends none) ends first. Other model failures answer `502 { "error": "upstream" }` and log only the error code or HTTP status.
- **Groq:** used only with Zero Data Retention on (Groq console → Data Controls), per ADR 0010. Its free plan allows 8K tokens a minute and 200K a day for this model, so two members asking in the same minute can hit the per-minute limit.

### Settings

| Setting           | Kind    | Value                                                                     |
| ----------------- | ------- | ------------------------------------------------------------------------- |
| `AI`              | Binding | Workers AI, declared in `wrangler.jsonc`                                  |
| `SUPABASE_URL`    | Secret  | Production Supabase project URL, no trailing slash                        |
| `ALLOWED_ORIGINS` | Secret  | Comma-separated app origins, e.g. the Pages URL and any custom domain     |
| `GROQ_API_KEY`    | Secret  | Groq API key for the fallback, from an organisation with ZDR on. Optional |

Set the secrets in the assistant Worker's **Settings → Variables and Secrets** (not the Pages project, whose `VITE_*` variables end up in the public bundle, and not GitHub) as type **Secret**: a plain variable set in the dashboard is replaced by the next deploy, a secret is kept.

### Deploy

The Worker is connected to this repository with Workers Builds (**Workers & Pages → Create → Import a repository**):

| Field             | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| Project name      | `household-hub-assistant` (must match `wrangler.jsonc`) |
| Root directory    | `workers/assistant`                                     |
| Build command     | empty                                                   |
| Deploy command    | `npx wrangler@4.149.0 deploy`                           |
| Build watch paths | include `workers/assistant/*`                           |

So a push to `main` that changes `workers/assistant` deploys it, and other pushes don't. Without the watch path, every push to `main` redeploys it.

To deploy from a terminal instead (check the account with `npx wrangler@4.149.0 whoami` first):

```bash
cd workers/assistant
npx wrangler@4.149.0 secret put SUPABASE_URL
npx wrangler@4.149.0 secret put ALLOWED_ORIGINS
npx wrangler@4.149.0 deploy
```

Workers AI on the Free plan gives 10,000 neurons a day, reset at 00:00 UTC; a three-call turn with two small tools cost about 50 in the prototype.

### Run it locally

With `supabase start` running. The `AI` binding always calls Cloudflare, so `wrangler dev` needs `npx wrangler@4.149.0 login` and spends the account's daily neurons.

```bash
cd workers/assistant
cp .dev.vars.example .dev.vars
npx wrangler@4.149.0 dev
```

Get a local access token by signing in to the app (or `POST $API_URL/auth/v1/token?grant_type=password` with the anon key), then:

```bash
curl -N http://localhost:8787 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"How much is in BPI?"}],"tools":[{"type":"function","function":{"name":"get_account_balances","parameters":{"type":"object","properties":{}}}}]}'
```

The reply streams `data:` chunks carrying `delta.tool_calls` and ends with `data: [DONE]`.

---

## Build Configuration

### Cloudflare Pages Settings

| Setting                | Value                     |
| ---------------------- | ------------------------- |
| Build command          | `npm run build`           |
| Build output directory | `dist`                    |
| Root directory         | `/` (project root)        |
| Node version           | `26` (read from `.nvmrc`) |
| Install command        | `npm ci` (auto-detected)  |

`npm run build` runs `tsc -b`, then `vite build`. Vite writes the code-split route chunks to `dist/assets/`, the service worker (`sw.js`, built from `src/sw.ts`), `manifest.webmanifest`, `offline.html` and `_headers`.

### Budgets

- Entry bundle: 378 KB gzip, checked by `npm run size` in CI's `build` job (`scripts/check-bundle-size.mjs`). The target is under 200 KB.
- Statement import worker: 590 KB gzip, same script.
- Page-load targets are in `docs/initial plan/PERFORMANCE-BUDGET.md`.

---

## Monitoring

### Error Tracking (Sentry)

`src/lib/sentry.ts` starts Sentry only in production builds with `VITE_SENTRY_DSN` set.

- It reports errors, unhandled rejections, and stuck sync events (`src/lib/sync/index.ts`).
- Performance tracing samples 10% of transactions. Session replay is off.
- `beforeSend` removes amounts, balances, descriptions, notes and contact details from request data, and filters sensitive breadcrumbs. User info, cookies and HTTP bodies are not collected.

### Workers

The keep-alive and assistant Workers have Observability on. Check each Worker's **Observability** tab for failed runs and errors.

### Lighthouse

`npm run lighthouse` runs `@lhci/cli autorun` against a local build. In CI, `security-check.yml` runs a Lighthouse best-practices audit on every push and PR; it reports but never fails the build.

---

## Rollback Procedure

Roll back for a critical bug, a security problem or a risk to data.

### The App

1. In the Pages project, open **Deployments**.
2. Find the last good deployment, open its menu and choose **Rollback to this deployment**.
3. Check the site: sign in, add a transaction, open Accounts.
4. Fix forward with a PR. A `git revert` in a PR deploys like any other merge. Never force-push `main`.

Rolling back the app is safe for local data: events and their versions never change (ADR 0001). An older build cannot read an event version it doesn't know, though, so roll back past an `eventVersion` bump only if no device has written the new version.

### The Database

Write a new forward migration that undoes the change, and ship it like any other migration. Roll the database back before the app only when the older app can't run against the newer schema.

### Workers

Each Worker keeps its versions. In the Worker's **Deployments** tab, roll back to an earlier version, or redeploy an earlier commit with `npx wrangler@4.149.0 deploy`.

---

## Deployment Checklist

### Before Merging

- [ ] CI is green: lint, knip, typecheck, unit-tests, build and size, database, e2e-smoke
- [ ] A migration, if any, is applied to production first (see [Database Migrations](#database-migrations))
- [ ] New environment variables are set in the Pages project
- [ ] A change that needs a Worker change deploys the Worker first

### After Deploying

- [ ] The site loads and the update prompt appears on an open client
- [ ] Sign in, add a transaction, check it syncs to a second device
- [ ] Reload offline: the app opens and shows local data
- [ ] No new errors in Sentry

---

## Troubleshooting

- **The Pages build fails**: read the build log in the dashboard. Common causes are a missing `VITE_*` variable, a type error, or a Node version mismatch. Reproduce with `npm ci && npm run build`.
- **Blank page**: check the browser console, then the `VITE_SUPABASE_*` variables in the Pages project.
- **Sync stops for everyone**: check the Supabase dashboard. A paused project refuses every request; restore it, then check the [Keep-alive Worker](#keep-alive-worker)'s last runs.
- **The Assistant answers 401 or 403**: check `SUPABASE_URL` and `ALLOWED_ORIGINS` on the Assistant Worker.

---

## Resources

- Status pages: [Cloudflare](https://www.cloudflarestatus.com/), [Supabase](https://status.supabase.com/), [Sentry](https://status.sentry.io/)
- Issues: https://github.com/jrga03/household-hub/issues
- Architecture: `docs/adr/`, `GLOSSARY.md`, `CLAUDE.md`
- Dependencies: Dependabot opens weekly grouped npm PRs (`.github/dependabot.yml`); `security-check.yml` runs `npm audit`.
