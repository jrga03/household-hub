# CLAUDE.md

Household Hub: an offline-first, event-sourced PWA for household finances (PHP only). React 19 + TypeScript, TanStack Router/Query (Table installed, not yet used), Zustand, shadcn/ui + Tailwind v4, Dexie (IndexedDB), Supabase. Node 26 (`.nvmrc`).

## Commands

```bash
npm run dev                # Vite + local Supabase
npm run build              # tsc -b + vite build
npm run lint               # eslint .
npm run knip               # unused files, exports, deps; stale ignores fail (knip.jsonc)
npx vitest run             # unit tests (bare `npm test` is watch mode)
npm run test:e2e:smoke     # chromium smoke; rebuilds dist/ first
npm run size               # bundle budget (378 KB gz)
npx tsc --noEmit -p tsconfig.tests.json    # tests/ + playwright config
npm run gen:types          # regenerate src/types/database.types.ts (commit with each migration)
supabase test db           # pgTAP (empty-schema check until the #15 baseline)
```

## Rules that break data if ignored

- **Changes are events** (ADR 0001). UI calls a command in `src/lib/commands`; it validates, then `appendEvent` (`src/lib/events/log.ts`) writes the event and projects it in one Dexie transaction. Only commands append events, and only `src/lib/sync` talks to the server `events` table (both lint-enforced). Events are never rewritten: a correction is a new event, and a new payload shape is a new `eventVersion` that the decoder translates.
- **Reads are always local**, from projections built by `src/lib/events/projector.ts`. Components never call Supabase directly (lint-enforced in routes and components).
- **Projections are order-independent.** Devices receive events in any order, sometimes twice; a projector gives the same rows for every permutation (the later HLC wins per record) and ignores duplicates. Prove it with a permutation test like `src/lib/accounts/projection.test.ts`.
- **Conflicts resolve by hybrid logical clock** (`src/lib/events/hlc.ts`). The server sequence only drives pulls; a trigger assigns it under a per-household lock so it matches commit order.
- **Membership is relational and server-authoritative** (`households`, `household_members`; ADR 0004). Changing it needs a connection.
- **IDs are client-generated** (`crypto.randomUUID()`); local ID equals server ID. Households are the exception (server-generated).
- **Money is integer cents**, typed `Cents` (`src/lib/currency.ts`), always positive, with `type: "income" | "expense"`. Parse input with `parsePHP` / `parsePHPSafe` / `parsePHPUnbounded`, display with `formatPHP`. Derive totals with `sumCents` / `diffCents` / `divideCents` (never divide cents without rounding). `asCents` belongs to the data layer: currency.ts and the event decoders (`src/lib/*/events.ts`).
- **Transfers are excluded from analytics and budgets**, through a projection.
- **Transaction `date` is the user's local calendar date** (`DATE`); audit timestamps are UTC `TIMESTAMPTZ`. Parse "yyyy-MM-dd" with `parseLocalDate` (`src/lib/utils/dates.ts`), never `new Date("yyyy-MM-dd")`.
- **Budgets are reference targets**, never balances; actual spend is always derived from transactions.

Always ask: what happens offline, and what happens when two devices edit the same record?

## Code conventions

- TanStack Router (not react-router-dom); Sonner toasts (not react-hot-toast).
- `@tanstack/eslint-plugin-query` (strict) applies to any query.
- Server state in TanStack Query, client state in Zustand (minimal). Projections are read with `useLiveQuery` (dexie-react-hooks), so local writes and synced events re-render on their own.
- Every route uses `<PageShell variant="…">` (`src/components/layout/PageShell.tsx`). Inside rails, sheets, and panes, use container queries (`@[600px]:`), not viewport breakpoints.
- No `any`. No `!` in production code (lint-enforced); narrow with a guard instead. Tests may use `!` after asserting length.
- No blanket `eslint-disable`; any disable needs a trailing reason.
- Path alias `@/` maps to `src/`.
- Keep all `@radix-ui/*` packages upgraded together; `npm ls @radix-ui/react-dismissable-layer` must show one version (two copies break popovers inside dialogs).

## Git hooks

- **pre-commit:** lint-staged runs `eslint --fix` and Prettier on staged files.
- **pre-push:** `scripts/pre-push.mjs` runs lint (`--max-warnings=0`), `vitest run --allowOnly=false --silent`, the two tsc programs, and Knip in parallel. Pushes that change only `*.md` or `docs/**` skip it. Run it by hand with `node scripts/pre-push.mjs`.
- **Claude Code hooks** (`.claude/settings.json`): a Bash guard blocks force pushes, `supabase db push`, and recursive deletes outside the repo; a Stop hook lints and type-checks changed files with `--max-warnings=0`.
- Push with `GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" git push`: it works when the key agent is loaded and fails fast instead of hanging on a passphrase prompt when it isn't. Only then ask the user to run it with `!`.

## Known infrastructure issues

Check here before debugging a test or CLI failure you did not cause. A failure is yours only if it passes on `main` (stash or check out `main` and re-run).

- **E2E has pre-existing failures.** After #16 stripped the app (2026-10-10, chromium and Mobile Chrome), these fail on both projects and predate #16 (they are ✘ in the older per-test baseline `docs/plans/2026-10-02-phase-1b-e2e-baseline.txt`): `keyboard-nav` "navigate main menu" (expects `data-nav` attributes), `performance` "acceptable bundle size", and `pwa` "work offline after caching" and "show offline indicator". Compare per test, not by totals. Only chromium and Mobile Chrome layout baselines are trustworthy; firefox/webkit abort with `NS_BINDING_ABORTED`.
- **E2E needs** the local stack running (`supabase start`), `PW_TEST_HTML_REPORT_OPEN=never` for non-interactive runs, and a fresh `dist/` (`npm run test:e2e*` rebuild it; a bare `npx playwright test` does not).
- **Scripts** must parse `supabase status -o env`, never the human-readable output.
- **PWA update handoff** can cause one unexpected reload when a code-split route is tapped during the update window. Known and self-healing; no fix needed.
- Rules: do not root-cause a listed issue mid-task. Log a new pre-existing failure here in the same commit as any workaround; delete an entry when it is fixed.

## Load on demand

| When working on                                             | Read                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Schema, migrations, query patterns, currency and date specs | `docs/initial plan/DATABASE.md`                                                                   |
| Event log, sync, projections, membership boundary           | `docs/adr/0001-event-log-is-the-only-synced-data.md`, `docs/adr/0004-membership-is-relational.md` |
| Why something is the way it is (numbered decisions)         | `docs/initial plan/DECISIONS.md`                                                                  |
| RLS policies                                                | `docs/initial plan/RLS-POLICIES.md`                                                               |
| Overall architecture                                        | `docs/initial plan/ARCHITECTURE.md`                                                               |
| Testing strategy, performance budgets                       | `docs/initial plan/TESTING-PLAN.md`, `docs/initial plan/PERFORMANCE-BUDGET.md`                    |
| Deployment (Cloudflare)                                     | `DEPLOYMENT.md`                                                                                   |
| Current roadmap and its decisions                           | `docs/plans/2026-09-30-guardrails-roadmap.md` (Resume state, Decisions & Deferrals)               |
| Past architecture review findings                           | `docs/reviews/2026-07-02-architecture-review.md`                                                  |
| Wide-screen layout design                                   | `docs/plans/2026-05-30-wide-screen-layout-design.md`                                              |
| Domain specialists                                          | `.claude/agents/*.md` (sync, offline, currency, schema, frontend, UI, Cloudflare)                 |

## Agent skills

### Issue tracker

GitHub Issues on jrga03/household-hub via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` and `docs/adr/` (plus legacy `docs/initial plan/DECISIONS.md`). See `docs/agents/domain.md`.
