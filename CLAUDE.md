# CLAUDE.md

Household Hub: an offline-first, event-sourced PWA for household finances (PHP only). React 19 + TypeScript, TanStack Router/Query/Table/Virtual, Zustand, shadcn/ui + Tailwind v4, Dexie (IndexedDB), Supabase. Node 26 (`.nvmrc`).

## Commands

```bash
npm run dev                # Vite + local Supabase
npm run build              # tsc -b + vite build
npm run lint               # eslint .
npx vitest run             # unit tests (bare `npm test` is watch mode)
npm run test:e2e:smoke     # chromium smoke; rebuilds dist/ first
npm run size               # bundle budget (355 KB gz)
npx tsc --noEmit -p tsconfig.tests.json    # tests/ + playwright config
npx tsc --noEmit -p tsconfig.strict.json   # noUncheckedIndexedAccess over lib/{sync,offline,debts}
```

## Rules that break data if ignored

- **Writes go through the outbox.** Every entity mutation writes the row and its sync-queue item in one Dexie transaction via `src/lib/offline/*` or `src/lib/debts/*`. Only `src/lib/sync/` writes to Supabase. Lint (`arch/no-direct-dexie-writes`, `arch/no-direct-supabase-writes`) enforces this.
- **IDs are client-generated** (`crypto.randomUUID()`); local ID equals server ID. No temp IDs.
- **Money is integer cents**, always positive, with `type: "income" | "expense"`. Parse input with `parsePHP` / `parsePHPSafe` / `parsePHPUnbounded`, display with `formatPHP` (`src/lib/currency.ts`). Never divide cents without rounding.
- **Transfers are excluded from analytics and budgets** (`transfer_group_id IS NULL`). Read transactions through `src/lib/supabaseQueries.ts`, which owns that filter (`arch/no-raw-transactions-from`).
- **Transaction `date` is the user's local calendar date** (`DATE`); audit timestamps are UTC `TIMESTAMPTZ`. Parse "yyyy-MM-dd" with `parseLocalDate` (`src/lib/utils/dates.ts`), never `new Date("yyyy-MM-dd")`.
- **Budgets are reference targets**, never balances; actual spend is always derived from transactions.
- **Debt balance** = original minus the signed sum of payment rows; reversals are negative and linked via `reverses_payment_id` (`src/lib/debts/balance.ts`).
- **Conflicts (Phase A):** record-level last-write-wins on `updated_at`. Lamport clocks only feed idempotency keys. Vector clocks are Phase B and not built.
- **Reads fall back to Dexie** when offline (`src/lib/offline/reads.ts`). Components fetch through hooks or `supabaseQueries`, never Supabase directly.

Always ask: what happens offline, and what happens when two devices edit the same row?

## Code conventions

- TanStack Router (not react-router-dom); Sonner toasts (not react-hot-toast).
- Server state in TanStack Query, client state in Zustand (minimal).
- Every route uses `<PageShell variant="…">` (`src/components/layout/PageShell.tsx`). Inside rails, sheets, and panes, use container queries (`@[600px]:`), not viewport breakpoints.
- No `any`. No `!` in production code under the strict program; narrow with a guard instead. Tests may use `!` after asserting length.
- No blanket `eslint-disable`; any disable needs a trailing reason.
- Path alias `@/` maps to `src/`.
- Keep all `@radix-ui/*` packages upgraded together; `npm ls @radix-ui/react-dismissable-layer` must show one version (two copies break popovers inside dialogs).

## Git hooks

- **pre-commit:** lint-staged runs `eslint --fix` and Prettier on staged files.
- **pre-push:** `scripts/pre-push.mjs` runs lint, `vitest run --allowOnly=false`, and the three tsc programs in parallel. Pushes that change only `*.md` or `docs/**` skip it. Run it by hand with `node scripts/pre-push.mjs`.
- **Claude Code hooks** (`.claude/settings.json`): a Bash guard blocks force pushes, `supabase db push`, and recursive deletes outside the repo; a Stop hook lints and type-checks changed files.
- `git push` over SSH hangs from Claude's shell (passphrase prompt). Ask the user to run it with `!`.

## Known infrastructure issues

Check here before debugging a test or CLI failure you did not cause. A failure is yours only if it passes on `main` (stash or check out `main` and re-run).

- **E2E has pre-existing failures.** Chromium full suite on `main` (2026-10-02): 37 passed / 33 failed / 24 skipped; per-test baseline in `docs/plans/2026-10-02-phase-1b-e2e-baseline.txt`. Compare per test, not by totals. `settings.spec.ts` is serial, so one failure skips the rest and its export tests flip between skipped and passed. Only chromium and Mobile Chrome layout baselines are trustworthy; firefox/webkit abort with `NS_BINDING_ABORTED`.
- **E2E needs** the local stack running (`supabase start`), `PW_TEST_HTML_REPORT_OPEN=never` for non-interactive runs, and a fresh `dist/` (`npm run test:e2e*` rebuild it; a bare `npx playwright test` does not).
- **Scripts** must parse `supabase status -o env`, never the human-readable output.
- **PWA update handoff** can cause one unexpected reload when a code-split route is tapped during the update window. Known and self-healing; no fix needed.
- Rules: do not root-cause a listed issue mid-task. Log a new pre-existing failure here in the same commit as any workaround; delete an entry when it is fixed.

## Load on demand

| When working on                                             | Read                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Schema, migrations, query patterns, currency and date specs | `docs/initial plan/DATABASE.md`                                                     |
| Sync engine, idempotency, device ID, conflict resolution    | `docs/initial plan/SYNC-ENGINE.md`                                                  |
| Why something is the way it is (numbered decisions)         | `docs/initial plan/DECISIONS.md`                                                    |
| RLS policies                                                | `docs/initial plan/RLS-POLICIES.md`                                                 |
| Overall architecture                                        | `docs/initial plan/ARCHITECTURE.md`                                                 |
| Testing strategy, performance budgets                       | `docs/initial plan/TESTING-PLAN.md`, `docs/initial plan/PERFORMANCE-BUDGET.md`      |
| Deployment (Cloudflare)                                     | `DEPLOYMENT.md`                                                                     |
| Current roadmap and its decisions                           | `docs/plans/2026-09-30-guardrails-roadmap.md` (Resume state, Decisions & Deferrals) |
| Past architecture review findings                           | `docs/reviews/2026-07-02-architecture-review.md`                                    |
| Wide-screen layout design                                   | `docs/plans/2026-05-30-wide-screen-layout-design.md`                                |
| Domain specialists                                          | `.claude/agents/*.md` (sync, offline, currency, schema, frontend, UI, Cloudflare)   |
