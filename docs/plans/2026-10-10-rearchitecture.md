# Re-architecture against the vision

Source of truth: `docs/VISION.md`. Vocabulary: `GLOSSARY.md`. Status: grilling done pending confirmation; nothing is built from this yet. ADRs: `docs/adr/0001`-`0003`.

## Context

A comparison of the code against the vision (2026-10-10) found:

- Households are hard-coded to a single household (`src/lib/household.ts`).
- Sync is a row outbox with last-write-wins, plus mostly dead event-sourcing leftovers.
- Reads are network-first.
- There are no tombstones.
- Transfers have a single date.
- Export is CSV only.
- Debts have no UI.

Fix commits cluster in `src/lib/{sync,offline,debts}`.

## Decisions & Deferrals

- **Motivation: accidental complexity, plus moving to a domain-first process.** Why: the sync, outbox and reconcile work costs more than the features it supports. Revisit: never; this is the premise.
- **The vision is the source of truth** (`docs/VISION.md`); `docs/initial plan/*` becomes history once the glossary and ADRs cover it. Revisit: when the initial plan docs are retired.
- **Two roles: Member and Owner.** Members have equal standing over records. The Owner controls the door, must hand over ownership before leaving, and the last member leaving dissolves the household. Revisit: if a household needs read-only members.
- **Visibility belongs to the account; transactions inherit it.** Why: it removes orphans when a member leaves, and RLS checks one column. Revisit: if a personal expense ever needs to sit on a household account.
- **Transfers only link accounts of the same visibility.** Money crossing between a personal and a household account is household income or spending (for example, an allowance). Why: allowances must show as household spending. Revisit: never (ADR candidate).
- **Categories are envelopes of real money that can span accounts; a budget stays a monthly target.** Envelope money carries over. Income lands in Unassigned, and an Allocation moves money between envelopes inside one account (it is not a transaction). A transfer moves one envelope's money between accounts. This amends the vision's "not envelope budgeting" line. A budget never goes down; the envelope's money does. Allocating can default each envelope to its budget. Envelopes may go negative (shown in red with a label). A credit card has a Paying Account: recording a card purchase moves the category's money into that card's Card Payment envelope in the paying account, and paying the bill is a transfer from it.
- **Transfer, Debt Payment and Draft are roles a transaction plays.** A reversal touches only the debt link, never a transaction.
- **Refactor in place, not a new repo.** Revisit: if the households or sync replacement proves too entangled.
- **There is no production data**, so schema and local storage can be reset freely, with no data migrations needed.
- **Personal accounts belong to the member, not the household**, and travel with them. **Account visibility is fixed at creation.**
- **Each device holds a full replica of what its member can see, and reads are always local.** (ADR candidate)
- **Event sourcing is kept, and done fully: the event log is the only thing that syncs, and screens read local projections built from it.** Why: union-merge of immutable events can't lose a new entry, deletes are just events, and history and debt reversals come for free. The old app ran a row outbox and an event log at once. Hosting: a Supabase Postgres append-only `events` table (push is an insert that ignores duplicates; pull is "events after sequence N"; enforced by RLS), Supabase Auth, Cloudflare Pages, and a Cloudflare cron keep-alive query every 3 days against Supabase's idle pausing. Ordering: conflicting edits are resolved by a hybrid logical clock (the edit made later wins); the server sequence only drives pulls. Rejected: a Durable Object per household (shared 100k requests/day cap, untested 10 ms CPU limit for JWT checks; the upgrade path if sequence gaps or pausing bite) and PowerSync (about 1 MB client, idle pausing, self-hosting costs money). (ADR candidate)
- **Start the database from one fresh baseline.** Drop the 30 migrations; households, membership and the event log come first, then features are rebuilt on top in order. Debts UI Part B is paused.
- **Platforms: free or free-tier only.** PowerSync's free cloud pauses after a week idle, and its self-hosted edition needs a server. InstantDB, Zero, Electric (no offline writes), Replicache and Triplit are out.
- **Internal debts are a note of what's owed; money still moves only by allocations and transfers.** A Debt Payment links a transaction, a transfer, or an allocation.
- **A credit card balance is not an external debt, and installments are not tracked.**
- **A person must create or join a household before recording anything**; someone alone is a household of one.
- **The Owner can remove a member.** A removed member is treated as one who left; household data is wiped from their devices at their next sync (a device that never syncs keeps its copy, and the docs say so).
- **Events are never rewritten; event types are versioned and old versions are translated when read.**
- **First release = spreadsheet replacement:** households (join and approve), accounts and credit cards, transactions, transfers, categories as envelopes with allocations, budgets, card statement import, the dashboard, sync status, and full export. Next, in order: debts, analytics drilldown, per-side transfer dates.
- **Start with opening balances, not a history import.** Each account's starting balance, an opening allocation across envelopes, and this month's budgets; the spreadsheet stays as the archive. Revisit: a one-time history import, if missed.
- **A credit card has a default Paying Account, changeable at payment time** (moving the reservation first). Paying less than the full bill leaves the rest reserved. Deferred: paying one card from two accounts.
- **Typos are fixed by edit events**: transactions, allocations, budgets, accounts and categories are freely editable. Only debt payments are corrected by a visible reversal. A move across visibility is a remove plus an add (ADR 0002).
- **Milestone 1 = foundation plus accounts** (spec: issue #15). Fresh baseline, households and membership, event-log sync with HLC, local projections, sync status, and Accounts as the first projected entity. Why: proves event, sync, projection and screen end to end before money features. Test seams: projection (Vitest), server contract (pgTAP), one two-device Playwright flow. Revisit: if accounts alone don't exercise enough of the pipeline.
- **Households, membership and join requests stay relational, server-authoritative tables, not events.** Why: they are the access boundary RLS checks. This refines ADR 0001 to "the only synced record data"; record it as an ADR when milestone 1 lands. Revisit: if membership history needs to be shown.

## Issue #16: strip the app to its shell

- [x] Delete feature routes, components, hooks, stores and their tests
- [x] Delete sync, offline, debts, realtime, transaction reads
- [x] Rewrite the shell: App, root route, layout nav, settings (theme only), home placeholder
- [x] Reset Dexie to an empty schema and wipe old local databases on open (`db.upgrade.test.ts`)
- [x] Delete migrations, pgTAP tests and edge functions; `supabase db reset` passes; types regenerated
- [x] Delete E2E specs for removed features; new home/settings layout baselines (chromium, Mobile Chrome)
- [x] Remove lint rules and Knip ignores that guarded removed modules
- [x] CLAUDE.md: mark the data rules as replaced by #15
- [x] build, lint, vitest, both tsc, knip pass; remaining E2E on chromium
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #16 decisions

- **Edge functions `budget-alerts` and `transaction-reminders` deleted** with the push worker; they read dropped tables. Revisit: when notifications are rebuilt on the event log.
- **Sign-out no longer offers a CSV export first**: there is no outbox to hold unsynced changes. Revisit: #15 adds the unsynced-events check back.
- **Settings keeps only Appearance; export and compaction are gone.** Full export is a milestone 1+ feature. Revisit: with export.
- **Mobile drawer keeps a Settings link** so `mobile-drawer-nav.spec.ts` still guards the snap-back regression.
- **Unused dependencies uninstalled** (recharts, pdfjs-dist, papaparse, zod, react-hook-form resolvers, TanStack Virtual, dexie-react-hooks, fingerprintjs, use-gesture, dotenv). Revisit: reinstall each when a rebuilt feature needs it (Virtual for the transactions list).
- **In-tree READMEs left stale** (`src/{,components,components/layout,hooks,lib,lib/dexie,lib/utils,types}/README.md`, `tests/README.md`); the Supabase migrations, functions and tests READMEs were stubbed instead; `docs/features/*` is history like `docs/plans`. Revisit: rewrite alongside #15, which replaces the modules they describe.
- **Sidebar active shortcut hint now uses the accent foreground**: the new signed-in axe test caught 4.34:1 contrast on the active item.
- **pgTAP keeps one empty-schema assertion** (`supabase/tests/000_empty_baseline.sql`): `supabase test db` exits 1 on an empty directory, which would fail CI. Revisit: #15 replaces it.
- **Navigation destinations stay spread across sidebar, tab bar, drawer, shortcuts and page title** (review smell). Revisit: centralize when #15 adds real routes.
- **Shortcut icons (`public/icons/shortcut-*.png`) and their generation in `scripts/generate-icons.js` stay** though the manifest shortcuts are gone. Revisit: a separate icon-pipeline cleanup.
