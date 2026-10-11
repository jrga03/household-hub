# Re-architecture against the vision

Source of truth: `docs/VISION.md`. Vocabulary: `GLOSSARY.md`. Status: Milestone 1 (#15) landed and closed 2026-10-11; production keep-alive check pending in #40. Milestone 2 scoped 2026-10-12. ADRs: `docs/adr/0001`-`0005`.

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
- **Milestone 1's seam 3 stays split across three e2e specs** (`personal-accounts`, `event-sync`, `household-lifecycle`), not one two-member offline flow. Why: each step is covered, and pushing an event doesn't depend on which member wrote it; another two-browser test would slow E2E for little gain. Revisit: if a push or pull bug shows up only between two members.
- **Milestone 2 = transactions, categories as envelopes, allocations, Unassigned, and the Card Payment reservation.** Transfers (including paying a card bill), budgets, import, dashboard and export move to Milestone 3 and later. Why: under ADR 0003 every transaction moves envelope money, so transactions built without envelopes would need rework. Consequence: in M2 a Card Payment only shrinks through refunds or allocations. Agreed 2026-10-11.
- **Categories carry visibility, fixed at creation, like accounts.** Household accounts use Household categories; a member's Personal accounts use their own Personal categories, which travel with them. Categories can still be added, renamed and retired. Why: a Personal account holding money in Household categories would strand it when the member leaves (ADR 0002's orphan argument). Agreed 2026-10-11.
- **A transaction's category may be Unassigned, expenses included**, for when the member doesn't yet know which envelope. Income defaults to Unassigned. Agreed 2026-10-11.
- **Groups hold no money**: money sits only in categories; a group's total is the sum of its categories. Agreed 2026-10-11.
- **Removing a transaction is a `removed` event, undone by `restored`**, resolved by latest HLC apart from the details (like retire/unretire). The UI offers Undo in the toast; no trash view in M2. Agreed 2026-10-11.
- **Cleared/pending resolves by its own latest HLC**, apart from the details. New transactions default to cleared. Agreed 2026-10-11.
- **An account's balance is its starting balance plus income minus expenses** over transactions not removed (a card's amount owed goes the other way), shown with a "Cleared · Pending" split and the account's Unassigned. Agreed 2026-10-11.
- **M2's transaction list is the vision's full list**: search, filters (month, account, category, type, status), totals of the filter, multi-select bulk actions, swipe actions on phones, a detail pane on wide screens, virtualized for 10,000 rows. Agreed 2026-10-11.
- **Default categories are offered from the empty categories screen, with deterministic IDs** (derived from the household and a fixed key), so two members seeding offline produce the same events. Agreed 2026-10-11.
- **A card transaction records the card's Paying Account when it is recorded**; its reservation stays there if the card's default changes later. Editing the transaction's account records the new one. Moving a reservation between accounts is a transfer (M3). Why: reading "the Paying Account at the time" would make the projection depend on HLC comparisons across entities. Agreed 2026-10-11.
- **Uncategorized card transactions use the Paying Account's Unassigned**: a purchase moves Unassigned into Card Payment, a refund or cashback moves it back. Agreed 2026-10-11.
- **A card's starting amount owed reserves nothing**; members allocate into its Card Payment themselves. Card Payment can be allocated to and from like a category. Agreed 2026-10-11.
- **Uncategorized expenses show "Needs a category"**, with a filter and a count on the transactions screen. Agreed 2026-10-11.
- **A transaction can move to another account of the same visibility**, card or not (its reservation follows). Across visibility it is a remove plus an add. Agreed 2026-10-11.
- **Allocations have a date and are editable and removable** under the transaction rules (latest HLC; remove/restore; Undo toast). From and to are each a category, a Card Payment or Unassigned, inside one account. Agreed 2026-10-11.
- **One Categories screen** lists groups and categories with their money (summed, expandable per account) and each account's Unassigned, with a Move money dialog. New Transactions and Categories routes join the nav. Allocating to budgets waits for M3. Agreed 2026-10-11.
- **Retiring a category is allowed whatever it holds.** A retired category can't be picked for new transactions or allocations; one still holding money stays listed under "Retired, still holding money". A group retires only once its categories are retired. Agreed 2026-10-11.
- **Transaction fields in M2:** local date (default today), direction, amount, account, category or Unassigned, status, optional description, optional notes. Tagging members waits for expense splitting. Agreed 2026-10-11.
- **Bulk actions:** mark cleared, mark pending, change category, remove (with Undo). **Swipe:** toggle cleared, remove. **Search:** description and notes, plus an exact amount when the query is a number. Agreed 2026-10-11.
- **A retired account takes no new transactions or allocations**; its existing ones stay editable and removable, and it stays filterable in the list. Agreed 2026-10-11.
- **No server migration in M2**: `events.entity_type` accepts any non-empty type, so categories, transactions and allocations reuse the existing table and RLS.
- **M2 starts with the projection registry** (resolves the #18, #19, #24 and #25 deferrals): per-entity table, decoder, version table and upcast (moved to `lib/events`), fold, description, creation check and household-switch wipe; accounts move onto it with no visible change. Agreed 2026-10-12.
- **Envelope money is summed at read time** from the transaction and allocation projections, never stored as its own projection, so it is order-independent by construction. Guard: a Vitest timing test, 10,000 transactions summed for the Categories screen under 50 ms. Revisit: if that budget fails (then cache per account). Agreed 2026-10-12.
- **Unassigned may go negative**: Move money warns but doesn't block; a negative Unassigned shows red with "Allocated more than this account has". Why: two offline devices can't be stopped from both allocating it. Agreed 2026-10-12.
- **The Categories screen shows current money only**; month views come with budgets in M3, using the allocation dates recorded now. Agreed 2026-10-12.
- **Quick entry from anywhere**: an Add transaction button in the shell (floating on phones, header button and `n` on wide screens), prefilled with today, the last-used account and category, and cleared. Agreed 2026-10-12.
- **Transactions sort by date, then by recorded time (HLC).** The clock-skew warning stays deferred: a skewed clock only reorders same-day items. Revisit: if same-day order confuses members. Agreed 2026-10-12.
- **M2 seams:** projections and read-time sums (Vitest + fake-indexeddb; permutations, duplicates, and the balance = Unassigned + category money invariant after every permutation, card cases included); commands (Vitest); Playwright on chromium for an offline card purchase reaching a second device, and for list filter totals and bulk mark-cleared. No pgTAP. Agreed 2026-10-12.
- **Default Household categories:** Savings (Forever House, Retirement, Big Ticket Items), Bills (Utilities, Subscriptions), Food (Groceries, Restaurants, Delivery), Getting Around (Transportation), Personal (Allowances). Personal categories get no defaults. Revisit: easy to edit later; the household renames and adds its own. Agreed 2026-10-12.
- **Category visibility is ADR 0005.** Agreed 2026-10-12.
- **M2 splits into seven sub-issues**: projection registry; categories and groups; transactions core; Card Payment reservation; allocations and the Categories screen; the transaction list; list actions. Agreed 2026-10-12.

## Milestone 2

Spec: #46. Scoped 2026-10-12 (decisions above, dated 2026-10-11 and 2026-10-12). Order follows the blocking edges.

- [x] #47 Projection registry
- [ ] #48 Categories and groups (blocked by #47)
- [ ] #49 Transactions core (blocked by #48)
- [ ] #50 Card Payment reservation (blocked by #49)
- [ ] #51 Allocations and the Categories screen (blocked by #48, #49)
- [ ] #52 Transaction list: virtualized, filters, totals, search (blocked by #49)
- [ ] #53 Transaction list actions: bulk, swipe, detail pane (blocked by #52)
- [ ] Close #46

## Issue #47: projection registry

- [x] Version table type, `currentVersion` and `upcast` in `src/lib/events/versions.ts`
- [x] Registry in `src/lib/events/projector.ts`: table, versions, creation check, fold, description; it upcasts, sorts by HLC, folds, and puts or deletes the row
- [x] Accounts register through it; `log.ts` takes its transaction tables and household-switch wipe from it
- [x] Fake second entity test (`projector.test.ts`): projects, upcasts, skips unknown versions, describes, discards, wipes on switch

### #47 decisions

- **Seams were taken from the issue's acceptance criteria** (a fake entity driven through `log.ts`, plus the existing account tests), as in #19, #23 and #24.
- **The registry upcasts before the fold and the description**, so an entity's decoders only see current-version payloads and can't forget to upcast. An unknown version is left out of the fold and described from its type and the current row. The version tables stay with their entity (`ACCOUNT_VERSIONS`); the type and `upcast` live in `lib/events`.
- **The household-switch wipe is generic**: every registered row carries `householdId` and `visibility`, so the registry deletes other households' Household rows from each table. Revisit: an entity whose rows don't carry visibility.
- **Entities are registered in `projector.ts`** (one line each), not by side effect on import, so the registry is never empty when the log receives events. Tests can register more.
- **Review deferral: commands pair a version table with an event type by hand** (`currentVersion(ACCOUNT_VERSIONS, eventType)`), so a new entity could pass the wrong table. Revisit: #48, when the second real entity lands (bind the lookup to the entity).
- **Review deferral: `ACCOUNT_VERSIONS` stays in `accounts/events.ts`**, while the issue's acceptance line says version tables live in `lib/events`. Only the type and `upcast` moved, so each entity keeps its own table. Revisit: never, unless a cross-entity version lookup is needed.
- **The registry stores table names, not tables**, for the log's transactions (Dexie's `Table<Row>` is invariant, so typed tables can't share a list without `any`).

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

## Issue #21: create a household

- [x] Baseline migration: `households`, `household_members`, Household Code generator, `create_household`, RLS, privileges
- [x] pgTAP replaces `000_empty_baseline.sql`: create and own, second create fails, non-member can't read, members read their own, code format and uniqueness
- [x] Regenerate `database.types.ts`
- [x] `src/lib/households.ts`: query options with an offline fallback to the last known membership, `createHousehold`, the route gate (unit tests)
- [x] Root `beforeLoad` gate both ways; `/create-or-join` route (create form, offline explanation, sign out); home shows the household and the Owner's code
- [x] Sign-out clears the cached membership
- [x] E2E: fixture users get a household; signup spec walks create-or-join to the Owner view; home layout baselines (chromium, Mobile Chrome)
- [x] build, lint, vitest, both tsc, knip, `supabase test db`, `supabase db lint`
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #21 decisions

- **Household Codes are unique across all households, not only active ones.** Dissolving (#25) will delete the household row, so this is the same rule. Revisit: if dissolved households are kept (soft delete); use a partial unique index then.
- **Household ids are server-generated** (`gen_random_uuid()`), unlike records: households are server-authoritative and creating one needs a connection. Revisit: never, unless households become events.
- **The gate falls back to the last membership seen online** (localStorage, keyed by user, cleared on sign-out), so a member opening the app offline isn't sent to create-or-join. Revisit: when #18 adds local storage for membership, or #25 needs removal to wipe it.
- **The Join card on create-or-join is a placeholder** ("coming soon"). Revisit: #17 replaces it with the code form.
- **The Household Code shows only to the Owner on home.** Revisit: #17/#25 if Members should share it too.
- **Found and fixed a redirect loop:** AppLayout picked its chrome from the pending location, which remounted signup/login mid-navigation; their mount effects re-navigated against the gate's redirect. AppLayout now follows `resolvedLocation`, and signup depends on the stable router like login.
- **Review fixes:** a concurrent second create now reports "You already belong to a household" (the member insert's unique violation is mapped), and `HouseholdRow` uses the generated `Tables<"households">`.
- **Review deferral: the gate reuses a cached membership for the global 5-minute `staleTime`.** Harmless while nobody can leave. Revisit: #25 (removal must reach the gate promptly).
- **Review deferral: an Owner's auth user can't be deleted** (`owner_user_id` has no `on delete`, plus the owner-is-member FK). Revisit: #25 dissolve and handover.
- **Review deferral: `households.ts` holds the gate, the last-known cache and Supabase I/O together.** Revisit: split when #17 adds join functions.
- **Review deferral: the fixture setup matches the "already belong" message text** to stay idempotent. Revisit: if that message changes or gets its own errcode.
- **Review deferral: the ADR 0001 refinement** (membership is relational, not events; the gate reads the network with a local fallback). Resolved: ADR 0004 (#18).
- **E2E fixture users get a household** ("Test household") in global setup via `create_household`; the remote CI E2E job assumes its fixture users already have one. Revisit: if that job is re-enabled against a remote project.

## Issue #18: event log tracer

Seams (agreed): HLC (pure), event store + account projection + `createAccount` (Vitest + fake-indexeddb), sync engine against an in-memory remote (Vitest), server contract (pgTAP), architecture lint, one two-context Playwright flow.

- [x] Migration: append-only `events` (client id, identity sequence, household, visibility, owner, entity, event type/version, HLC, device, actor, payload), RLS, insert-only grants, `pull_events`
- [x] pgTAP: duplicate id keeps one row; pull after N is later events in order; non-member reads nothing; update and delete denied
- [x] Regenerate `database.types.ts`
- [x] HLC (`src/lib/events/hlc.ts`) with tests
- [x] Dexie v2 tables (events, accounts, meta); event store; account projector (create only) with permutation and duplicate tests
- [x] `createAccount` command: validate, append, project in one transaction
- [x] Sync engine: push, pull, project; triggers on start, reconnect, local writes (debounced), visibility; tests with a fake remote
- [x] Accounts list (local projection only) and add-account form on home
- [x] Lint: only commands append events; only the sync engine touches the server `events`
- [x] ADR 0004; CLAUDE.md data rules for the event log
- [x] Playwright: offline create on A, reconnect, appears on B (chromium)
- [x] build, lint, vitest, both tsc, knip, `supabase test db`, `supabase db lint`
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #18 decisions

- **Sequences are assigned by a trigger under a per-household advisory lock**, not by an identity default. A default draws the number before commit, so concurrent pushes could become visible out of order and a pull cursor would skip one forever. Revisit: if push contention in one household ever matters (it serializes that household's pushes).
- **Clients have no privilege on the event sequence** (Supabase grants it by default); a client `setval` would rewind every cursor.
- **Personal events are rejected by RLS for now** (insert and read are Household only). Revisit: #22.
- **The accounts list lives on home**, not a new route, so navigation stays untouched. Revisit: when accounts get detail views (#23).
- **Sync runs on app start, reconnect, visibility and local writes only; no polling or Realtime.** An open device sees another's change at its next trigger. Revisit: #24 (sync status) if members expect live updates.
- **Sign-out halts sync and makes one push attempt (5 s cap) before wiping the local store**; unpushed events that still fail are lost. Revisit: #24 adds a sync status and an unsynced-events warning before sign-out.
- **Sync failures without a Postgres code are treated as unreachable and only logged; server refusals go to Sentry.** A refused event blocks the push queue, but the device still pulls (review fix). Revisit: #24/#25 (membership removal will produce refusals).
- **Events of unknown types, or with an unreadable payload, stay in the log unprojected.** Nothing re-projects them after an app update yet. Revisit: #23, when a second event type needs a projection rebuild (replay the log by HLC).
- **`dexie-react-hooks` reinstalled** for the live accounts list.
- **Home layout baselines regenerated.** The old ones still passed with the Accounts card added: `maxDiffPixelRatio: 0.02` absorbs a sparse card. Revisit: tighten when layouts are rebuilt.
- **ADR 0001 refinement written as ADR 0004** (resolves the #21 deferral).
- **Review fixes:** pull even when a push is refused; sign-out waits for an in-flight sync before its final push; `listUnpushed`/`markPushed`/`receiveEvents` are lint-fenced to `src/lib/sync` (and the sync engine can't `appendEvent`); a visibility guard replaces a cast; the balance-range message derives from `MAX_AMOUNT_CENTS`; CLAUDE.md says projections are read with `useLiveQuery`.
- **Review deferral: projections aren't scoped to the signed-in member.** Session expiry keeps the local store (so unsynced events survive), so a different person signing in on that device would see the previous household's accounts, and their old events would be refused. Revisit: #25 (wipe or scope the store when the signed-in user or household changes).
- **Review deferral: no bound on how far ahead a received HLC may be**; one device with a wrong clock drags every clock forward (ordering stays consistent). Revisit: #23, when edits make HLC order user-visible.
- **Review deferral: adding a projection touches three places** (Dexie table, `logTables` in `log.ts`, the dispatch in `projector.ts`). Resolved: #47 (projection registry).

## Issue #17: Join Request lifecycle

Seams (from the issue's acceptance criteria): server contract (pgTAP) and one two-context Playwright flow.

- [x] Migration: `join_requests` (pending or declined; accepted and cancelled rows are deleted), one pending per person, `request_to_join`, `my_join_request`, `cancel_join_request`, `accept_join_request`, `decline_join_request`, `dismiss_join_request`; becoming a member clears that person's requests
- [x] pgTAP: request by code, no household data revealed, Owner-only answers, requester-only cancel, accept makes a Member, members can't request, one pending at a time, unknown code
- [x] Regenerate `database.types.ts`
- [x] `src/lib/join-requests.ts` (split from `households.ts`)
- [x] create-or-join: join form, pending screen with cancel, declined notice; Owner's pending list on home
- [x] Playwright: two contexts, create, request, accept, B lands home; unknown code; decline
- [x] build, lint, vitest, both tsc, knip, `supabase test db`, `supabase db lint`
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #17 decisions

- **Only pending and declined requests are kept**; accepting or cancelling deletes the row, since membership is the record and its history isn't kept (ADR 0004). One pending request per person is a partial unique index. Revisit: if the Owner needs a request history.
- **Becoming a Member by any path clears that person's requests** (a trigger on `household_members`), so creating a household while a request is open leaves nothing dangling.
- **A requester sees nothing of the household**, not even its name, until accepted: `my_join_request()` returns only id and status, and the table's RLS is Owner-only.
- **The Owner sees the requester's email**, snapshotted at request time; there are no display names yet. Revisit: when profiles exist.
- **A decline stays until the requester presses OK** (`dismiss_join_request`), across sessions; asking again replaces it.
- **Answers arrive by polling**: a pending requester checks every 5 s, the Owner's list every 30 s and on focus. No Realtime, as in #18. Revisit: #24 if it feels slow.
- **The join-request card on home is the Owner's only.** Members see no list, and RLS returns them nothing.
- **Review fixes:** accept and decline lock the request row (an Owner accepting while the requester cancels made them a Member anyway); a vanished request says "no longer pending" instead of "only the Owner"; the Owner-only refusal is a plain `raise`, so only messages our functions write reach people (passing 42501 through would have shown Postgres's own permission errors); pgTAP covers decline by a non-Owner; the household refetch moved from a `queryFn` into the hook; create-or-join owns the branching between choices and an open request.
- **Review deferral: "a replaced code" isn't tested**; codes can't be replaced yet. Lookup is by the current code, so an old one will get "No household with that code". Revisit: #25 (code replacement).
- **Review deferral: the form-error box and `error instanceof Error ? … : fallback` repeat** across create, join, the request card and AccountsCard. Revisit: extract a `FormError` when the next form lands.

## Issue #22: Personal accounts

Seams (from the issue's acceptance criteria): server contract (pgTAP), account projection and `createAccount` (Vitest), one two-member Playwright flow.

- [x] Migration: Personal events readable only by their owner (whatever their membership), appendable only by their owner while a member; Household events unchanged
- [x] pgTAP: owner reads Personal, other members don't, foreign owner rejected, Household readable by all members, owner still reads Personal after leaving
- [x] `createAccount` takes a visibility (Household by default) and keys Personal events to the actor
- [x] Projection fixes visibility, owner and household from the earliest create; permutation test with a later create that tries to change it
- [x] Add-account form: Household/Personal choice defaulting to Household (reset after each add); Personal badge in the list
- [x] Playwright: B adds Personal and Household accounts; A sees only the Household one (chromium)
- [x] Home laptop layout baselines regenerated (chromium, Mobile Chrome)
- [x] build, lint, vitest, both tsc, knip, `supabase test db`, `supabase db lint`
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #22 decisions

- **The read-only visibility on edit forms moves to #23**, which builds the first edit form. Why: no edit form exists yet. Revisit: #23.
- **Visibility, owner and household come from the account's earliest create (lowest HLC); every other field follows the latest event.** No edit event exists yet, so a later `account.created` stands in for an edit in the permutation test. #23's edit events must not touch them, and must carry the account's own visibility and owner so RLS shows them to the same people. Revisit: #23.
- **A Personal event is readable by its owner whatever their membership** (RLS on `owner_user_id`, not household). Appending still needs current membership. Resolves the #18 deferral.
- **Review fixes:** the pgTAP definer helper says why it reads past RLS; the e2e people are `owner` and `member`; the projection's locked fields are named `fixedAtCreation`.
- **Review deferral: deleting a household cascades to its events, Personal ones included** (`events.household_id ... on delete cascade`). Leaving keeps them (pgTAP covers it), but dissolving a household would delete a sole member's Personal accounts, against ADR 0002. Fixing it now makes `householdId` nullable through the sync and projection types for a path that doesn't exist yet. Revisit: #25 (dissolve must keep Personal events, with a pgTAP case that deletes the household).
- **Review deferral: the pull cursor is one global sequence.** A member who moves to another household would skip its earlier events. Revisit: #25 (the wipe on leaving resets the cursor to 0, which also re-pulls their Personal events).
- **Local account rows from #18 have no `createdHlc`** and can't have their visibility corrected; dev-only, since there is no production data. Revisit: never.
- **Extras beyond the issue:** a Personal badge in the accounts list, and a partial index on `(owner_user_id, sequence)` for the owner's Personal reads.

## Resume state

- #16 merged (PR #26, 41f23ee) and CI pin bump merged (PR #27, afdeb7a); CI green on main after #27.
- #21 merged (PR #28). #18 merged (PR #29).
- #17 merged (PR #30).
- #22 merged (PR #31). #23 merged (PR #32). #19 merged (PR #33).
- #24 merged (PR #34).
- #25 merged (PR #38, 7f7bf9c). Follow-up: #36 (offline gate retry delay).
- #20 merged (PR #37, 6eefab2). Deployed 2026-10-11: production reset to the six new migrations (`supabase db reset --linked --no-seed`; old tables held 0 estimated rows), `keep_alive()` returns `true` with the anon key, Worker `household-hub-keep-alive` deployed (version cd146b55). Owes: first run 2026-10-13 00:00 UTC shows `Supabase keep-alive succeeded` in Observability; around 2026-10-18 the Supabase project is still active.
- #36 merged (PR #41, e294de5).
- #42 merged (PR #43, 57587d4).
- Triaged 2026-10-11: #15 closed as completed; #40 updated (deploy steps done; first-run check 2026-10-13, still-active check on or after 2026-10-17).
- Next: #40's two dashboard checks (human).
- Milestone 2 scoped 2026-10-12: spec #46, sub-issues #47-#53 (`ready-for-agent`), ADR 0005. Next: #47, in a worktree.
- Gotchas found in #16:
  - `src/types/database.types.ts` is in `.prettierignore`: commit raw `npm run gen:types` output; CI diffs it against Supabase CLI 2.119.0 (must match the local CLI).
  - `supabase test db` exits 1 when `supabase/tests/` has no `.sql` files; `000_empty_baseline.sql` (asserts public has no tables) must be replaced, not just deleted, by #21's baseline tests.
  - The auto-mode classifier blocks bulk `git rm` of test files; ask the user to run large deletions with `!`.
- Unverified: nothing outstanding from #16.

## Issue #19: credit cards with a Paying Account

Seams (from the issue's acceptance criteria): the Paying Account picker's filter (Vitest, pure), account projection (Vitest, through `receiveEvents`/`listAccounts`), the create, edit and retire commands (Vitest), one Playwright demo flow.

- [x] `credit_card` type; account details carry `payingAccountId` (required for a card, null otherwise); `account.edited` v2 adds it, v1 upcasts to null
- [x] Picker filter: non-card, same visibility and owner, not retired; unit tests
- [x] Projection: a card resolves its Paying Account at read time, so it resolves whenever that account arrives; edits that cross card/non-card are ignored
- [x] Commands: create and edit validate the Paying Account against local accounts; type can't change to or from credit card; retiring a Paying Account of an active card is blocked, naming the card
- [x] UI: Paying Account picker on add and edit for cards; the list shows a card's Paying Account
- [x] Playwright: add a household bank account, then a card paying from it; the card shows its Paying Account (chromium)
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #19 decisions

- **A card's Paying Account resolves when the list is read, not when the card is projected.** The card stores only `payingAccountId`; `listAccounts` joins it, so a card whose Paying Account arrives later shows it as soon as it does, with no cross-entity re-projection. Only an account of the card's own visibility and owner resolves.
- **`account.edited` v2 adds `payingAccountId`**; v1 upcasts to null, which is right because v1 edits predate cards.
- **Being a credit card is fixed at creation**, like visibility (resolves the #23 deferral). `editAccount` refuses either direction; the projection ignores an edit whose card-ness differs from the account's. The edit form shows a card's type as text and offers non-card accounts only non-card types.
- **Only cards in use block retiring their Paying Account**, so a card and its bank can be retired together (card first). Unretiring a card whose Paying Account is retired is blocked the same way ("Unretire BDO Savings first"), so one device can't reach a card in use paying from a retired account. Why: the issue doesn't say, and blocking on retired cards would force unretiring a card just to repoint it. Confirmed by the user 2026-10-11.
- **The block is local, so two offline devices can still leave a card paying from a retired account.** The list shows "Paid from X (retired)", and the edit form makes the member choose again. Revisit: Card Payments, if a retired Paying Account must be impossible.
- **Paying Account validation lives in the commands** (against this device's accounts); `checkAccountDetails` only checks that a card has one and nothing else does, and the projection rejects a card paying from itself.
- **Review fixes:** the type-crossing guard has a permutation test; the read-time join refuses a card as a Paying Account (`canPay`, shared with the picker); one `Ownership` type replaces four inline copies; the form's type state is an `AccountType`; unretiring a card checks its Paying Account.
- **Review deferral: the version table and `upcast` still live in `accounts/events.ts`** (from #23). Why: accounts are still the only entity. Resolved: #47 (`lib/events/versions.ts`).
- **Review deferral: no test of two devices changing the same card's Paying Account at once.** Concurrent edits of any detail already resolve by HLC (#23's permutation tests), and the Paying Account permutation test covers one edit against every arrival order. Revisit: if the Paying Account ever resolves apart from the other details.
- **A card's starting balance is labelled "Starting amount owed"** (GLOSSARY: a card's balance is an amount owed). Stored the same way as other starting balances. Confirmed by the user 2026-10-11.

## Issue #24: sync status

Seams (from the issue's acceptance criteria): the event store's push states, waiting count, stuck list and discard rebuild (Vitest + fake-indexeddb); push-error classification (pure); the sync engine with a fake remote that refuses some events; retry backoff in the triggers; the indicator's label (pure); the sign-out flow (mocked confirm); one Playwright demo flow.

- [x] Dexie v4: events carry `pushState` (`waiting`, `stuck`, `pushed`) and a stuck reason, replacing `pushed`
- [x] Event store: waiting count, stuck list with descriptions, mark stuck, requeue, discard (deletes a stuck event and rebuilds its entity; the account disappears)
- [x] Classification: Postgres classes 22, 23, 42501 and raised exceptions are permanent; network, auth and server-unavailable errors are transient; no session is transient
- [x] Engine: a refused batch is pushed one event at a time; refused events go stuck and the queue moves on; transient errors still throw
- [x] Triggers: transient failures retry with exponential backoff, reset by a success
- [x] Retry and discard from `@/lib/sync`
- [x] Indicator in the shell (mobile header, sidebar footer) with a panel: online/offline, waiting count, stuck events with Retry and Discard
- [x] Sign-out: push first, then warn with "Export and sign out", "Sign out anyway", "Cancel"; export downloads the unpushed events as JSON; local data is still wiped
- [x] Playwright: offline, add two accounts, "2 waiting", reconnect to "Synced"; a refused push shows stuck, discard removes the account (chromium)
- [x] Layout baselines regenerated (chromium, Mobile Chrome)
- [x] Remove the offline banner (the indicator covers it)
- [x] Point the pwa "show offline indicator" e2e at the sync indicator (removes it from CLAUDE.md's known failures)
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #24 decisions

- **Seams were taken from the issue's acceptance criteria** (waiting count, stuck classification, discard rebuild) plus the existing engine, trigger and sign-out test files, as in #19 and #23.
- **Stuck changes don't count as waiting.** The indicator shows both ("Offline · 3 waiting · 1 stuck"); stuck outranks offline, which outranks waiting.
- **Permanent means Postgres classes 22, 23, 42501 and P0; everything else is transient** (no code = unreachable, PostgREST's own `PGRST*` errors, 08, 40, 53, 57). A push without a session is transient, since it would go out as anon and read as an RLS refusal. Revisit: #25, when removal makes 42501 the normal reply for a removed member.
- **The server refuses a batch as a whole, so a refused batch is re-pushed one event at a time** to find which ones are stuck; the rest go out. Stuck events are never resent on their own.
- **Transient failures retry from the triggers with a doubling delay (2 s up to 5 min)**, reset by any success; any other trigger cancels the pending retry.
- **Discard is the one way an event leaves the log, and only a stuck one**: it never reached the server, so no device holds it. The entity is rebuilt from what remains; an account with no create left is deleted from the projection.
- **Sign-out syncs first (5 s cap) and warns only if something is still unpushed** (waiting or stuck). The export is `{ exportedAt, events }` with each event's push state. The confirm dialog gained an optional third button (`alternativeLabel`, outcome `alternative`). Resolves the #16 and #18 sign-out deferrals.
- **`useOnlineStatus`'s 30 s health check no longer overrides `navigator.onLine`**: `getSession` reads storage and succeeds offline, so it flipped the indicator back to online.
- **The offline banner is removed**: the indicator already says "Offline", and the banner covered the top of the page and announced "Back online! Your changes are syncing" whether or not they were. Revisit: if members miss going offline (an `aria-live` announcement on the indicator is the lighter option).
- **Layout baselines regenerated** with `--update-snapshots=all`; a plain `--update-snapshots` rewrote nothing because the 2% threshold absorbed the indicator.
- **Deferred: warn on a skewed clock** (from #23). Revisit: when HLC order is visible in a list (transactions).
- **The old ultrawide settings baseline predated #16** (it still showed transactions, export and compaction) and passed only within the 2% tolerance; the regenerated one shows the current shell.
- **Review fixes:** only 42501 in class 42 is permanent (a missing table or column means a deploy out of step, which clears); the export's object URL is revoked after a delay so the download isn't cancelled; the tone is `waiting`, not `pending` (Pending is a transaction state); `stuckCount` names the number; `countChanges` shares the plural wording; an engine test checks a transient failure leaves nothing stuck; ADR 0001 records the discard exception; GLOSSARY gains Waiting and Stuck.
- **Review deferral: events aren't tied to the signed-in user before they are pushed.** After a session expiry (local data kept on purpose), a different person signing in would push the previous person's waiting events. Same as the #18 deferral. Revisit: #25.
- **Review deferral: with no session, pushes wait and retry quietly** ("Not signed in" is transient); the indicator says waiting, not "sign in". Session expiry already routes to /login. Revisit: if members get stuck signed out with waiting changes.
- **Review deferral: discarding a stuck create leaves that account's later events in the log**, and they may already be on the server. Projections ignore changes with no create, so nothing shows. Revisit: #25 (decided 2026-10-11: also drop its unpushed edits there).
- **Review deferral: per-entity dispatch now repeats in `projectEvent` and `describeEvent`.** Resolved: #47 (projection registry).
- **Review deferral: sign-out can't confirm the export finished downloading** before wiping (browsers don't report it). The 1 s delayed revoke covers the cancel case. Revisit: if exports go missing on iOS.
- **Deferred: live updates (polling or Realtime)** (from #18 and #17). The indicator shows what is waiting here, not what others changed. Revisit: if members expect it.

## Issue #23: edit and retire accounts

Seams (from the issue's acceptance criteria): account projection (Vitest, through `receiveEvents`/`listAccounts`), the edit and retire commands (Vitest), one two-context Playwright flow.

- [x] Projection rebuilds an account from its own events (Dexie v3 indexes `events.entityId`): earliest create fixes visibility, owner and household; details follow the latest create or edit; retirement follows the latest retire or unretire
- [x] Permutation tests: concurrent edits resolve to the later HLC; equal wall time falls back to the counter, then the device id; an edit before its create applies once the create arrives
- [x] `account.created` v2 adds `payingAccountId` (null for every non-card type); v1 upcasts to v2; fixture test
- [x] Edits whose visibility or owner differ from the account's are ignored
- [x] Commands: `editAccount`, `retireAccount`, `unretireAccount` (offline, carry the account's visibility and owner)
- [x] UI: edit form per account (visibility read-only), retire/unretire, retired view; balance via `formatPHP`
- [x] Playwright: two contexts edit the same account's name offline; after sync both show the later edit (chromium)
- [x] GLOSSARY: Retired
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #23 decisions

- **`account.created` v2 adds a nullable `payingAccountId`** so the v1→v2 upcaster is real, not test-only; #19 fills it for credit cards. Why: the issue asks for an upcasting test and events are never rewritten. Revisit: #19.
- **Details and retirement resolve independently** (each by its own latest HLC), so one device retiring while another renames keeps both. Revisit: if a retired account must refuse edits.
- **Projections rebuild one entity from its own history**: `log.ts` reads every event it holds for the entity and the projector folds them in HLC order. An edit that arrives before its create is a sort, not a special case. Partly resolves the #18 "nothing re-projects" deferral: an event this version couldn't read is picked up at that entity's next event, not at app update. Revisit: a full replay on app update when a shipped version adds an event type that older devices already hold.
- **Changes whose visibility or owner differ from the account's are ignored**, so an edit can't move an account across visibility (ADR 0002). The #22 stand-in test (a later create) is replaced by real edits.
- **Edit events carry the actor's current household**, not the account's: RLS requires `household_id = current_household_id()`, and a Personal account travels with its owner. The projection keeps the household from the earliest create. Revisit: #25 if dissolving needs Personal events detached from a household.
- **Dexie v3 upgrade normalizes account rows** (adds `retired: false` and `payingAccountId: null`, drops `hlc`/`createdHlc`); review found upgraded devices would otherwise list no accounts.
- **Review fixes:** `FormError` and `errorMessage` extracted (resolves the #17 deferral; all forms and toasts use them); the edit dialog closes if another device retires its account; the dialog footer uses a container query; the account change command takes a typed event-type union; the e2e flow also checks the retirement reaches the other device.
- **Review deferral: "type can't change to or from credit card" has no guard yet**, because the credit card type doesn't exist and the decoder rejects it. Revisit: #19 (enforce in `editAccount` and in the projection).
- **Review deferral: the version table and `upcast` live in `accounts/events.ts`.** Revisit: #19 or the first non-account entity (move to `lib/events`, with the projection registry from #18).
- **Review deferral: no bound on how far ahead a received HLC may be** (from #18). Every bound breaks convergence between devices with different clocks, so only reporting large drift is safe. Revisit: #24 (sync status could warn on a skewed clock).
- **Review deferral: the starting balance input strips the peso sign from `formatPHP`**; a currency helper for input values would own that. Revisit: when a second amount field is pre-filled (transactions).

## Issue #25: leaving, removal, ownership handover and code replacement

Seams (from the issue's acceptance criteria): server contract (pgTAP); the local store's household switch and projection rule (Vitest + fake-indexeddb); the sync engine's membership check with a fake remote; one two-member Playwright flow.

- [x] Migration: `leave_household` (Owner blocked while others remain; the last Member dissolves), `remove_member`, `hand_over_ownership`, `replace_household_code`, `list_household_members`; drop the `events.household_id` foreign key so dissolving keeps Personal events
- [x] pgTAP: Owner-only controls; Owner can't leave with others; last Member dissolves (Personal events survive); removed Member reads Personal only and can't insert; departed Member's Household events stay readable; old code finds nothing
- [x] Regenerate `database.types.ts`
- [x] Local store: `switchHousehold` wipes pushed Household events and Household projections, marks waiting Household events stuck, resets the pull cursor; Household events of another household never project
- [x] Discarding a stuck create also drops that account's unpushed edits (from #24)
- [x] Engine: membership check between push and pull; a change calls back so the gate re-runs
- [x] Sync runs whenever someone is signed in and membership is known, so a non-member's device wipes too
- [x] UI: Members card on home (list for everyone; remove and hand over for the Owner; Leave for all); Replace code for the Owner
- [x] Docs: README/DEPLOYMENT note that a device which never syncs keeps its copy
- [x] Playwright: A removes B; B's next sync drops the household account, keeps B's Personal one, shows create-or-join (chromium)
- [x] build, lint, vitest, both tsc, knip, `supabase test db`, `supabase db lint`
- [x] Home layout baselines regenerated (chromium, Mobile Chrome)
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #25 decisions

- **Unpushed Household changes survive losing membership as stuck, and never project.** They appear in the sign-out export and can be discarded. Why: no silent loss of offline work. Chosen by the user 2026-10-11.
- **Signed-in user scoping stays deferred** (the #18/#24 deferral). Chosen by the user 2026-10-11. Revisit: if devices are shared between members.
- **Members card on home** holds the member list, the Owner's remove and hand-over, and Leave. Chosen by the user 2026-10-11.
- **Dissolving deletes the household's Household events and keeps Personal events** by dropping the `events.household_id` foreign key; RLS's insert check already ties new events to the caller's current household. Resolves the #22 deferral without a nullable `householdId`.
- **The engine asks the server for the caller's household first in every sync**, so a changed household resets the cursor before the pull (resolves the #22 cursor deferral), and a device in no household pushes nothing (resolves the #24 deferral: a removed device no longer reports a 42501 per event to Sentry).
- **Membership reads in sync skip the client's GET retries** (`.retry(false)`). supabase-js retries GETs 3 times (1 s, 2 s, 4 s) on network errors, which held sign-out's last sync offline past its 5 s cap; the e2e sign-out test caught it. The triggers already back off.
- **The household and members queries go stale after 30 s, not 5 min** (resolves the #21 gate deferral): removal reaches a device through sync; a new Owner's controls appear at the next refocus.
- **Sync runs on create-or-join too**, once membership is known, so a removed person who opens the app online still has the household wiped.
- **A removed Member's Personal changes wait, and go out once they join a household again.** The insert policy now requires membership and ownership for a Personal event but not a matching household, since an offline change names the household it was made in (review fix; the first version said Retry would work, but the old policy refused it every time).
- **Route gate's household GET retried offline** (about 7 s before falling back to the last known membership on an offline app start). Pre-existing since the supabase-js upgrade. Fixed in #36.
- **A Household event projects unless it belongs to a household this device has left** (meta `leftHouseholdIds`; rejoining removes it). Why: matching the recorded household instead hid changes made in a just-joined household before the first sync (found while fixing review findings).
- **Review fixes:** membership is checked before the push; the wipe touches only Household data of other households, so changes made in the new household stay; a device that never recorded its household is wiped too; one `callMembershipFunction` serves join requests and membership; clearer names in `MembersCard`; ADR 0001 records that discarding a stuck create drops its unpushed changes, ADR 0004 records leaving and dissolving, and GLOSSARY's Stuck covers changes from a left household.
- **Review deferral: no permutation test for the left-household filter.** It drops events by household before the HLC fold, so it can't depend on arrival order; the account permutation tests still cover the fold. Revisit: if the filter ever depends on event order.
- **Review deferral: `accept_join_request` doesn't lock the household row**, so an accept racing a hand-over can land just after it. Locking it there would take the request lock before the household lock, the reverse of a dissolve, and risk deadlocks. Revisit: if an ex-Owner's accept ever matters.
- **Review deferral: a Household event inserted while its household dissolves can commit after the delete**, leaving an unreadable row. Harmless (nobody can read it). Revisit: if orphaned events need cleaning.
- **Still deferred: an Owner's auth user can't be deleted** (from #21; `owner_user_id` has no `on delete`). Leaving and dissolving don't need it. Revisit: account deletion.
- **Review deferral: a per-entity projection registry** (`isCreation` joins `projectEvent` and `describeEvent`; `switchHousehold` names `db.accounts`). Same as the #18/#24 deferrals. Resolved: #47.

## Issue #20: keep-alive cron

Seams: `public.keep_alive()` privileges (pgTAP), `pingSupabase` logging and failure (Vitest), a manual `wrangler dev --test-scheduled` run against local Supabase.

- [x] Migration `20261011200000_keep_alive.sql`: `keep_alive()` returns `true`, security invoker, executable by `anon` only; pgTAP `060_keep_alive.sql`
- [x] `database.types.ts` updated (matches `gen types` from an isolated DB byte for byte)
- [x] `workers/keep-alive`: `pingSupabase` (unit tests), scheduled entry, `wrangler.jsonc` with cron `0 0 */3 * *`
- [x] Local scheduled trigger: success logs `Supabase keep-alive succeeded`; a missing function logs the 404 as an error and fails the run
- [x] Lint, knip and `tsconfig.tests.json` cover `workers/`
- [x] `DEPLOYMENT.md`: the Worker, its secrets and why it exists
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #20 decisions

- **The Worker uses the anon key, not a dedicated key.** Why: it's already public in the app bundle, and `anon` can call only `keep_alive()` (no grant on households, membership or events, asserted in pgTAP). Revisit: if `anon` gets grants on any table.
- **Wrangler is not a dependency**; the Worker deploys with `npx wrangler` by hand. Why: workerd is a large download for every `npm ci`, for a Worker that changes rarely. Revisit: if the Worker gains logic worth a CI deploy.
- **Migration version `20261011200000` and pgTAP file `060_keep_alive.sql`**: #25 already used `20261011120000` and `050_household_lifecycle.sql`.
- **`keep_alive()` is `select true`, reading no table.** Supabase doesn't document what counts as activity; a REST call that reaches Postgres very likely does. Revisit: if the project still pauses a week after the Worker is deployed (then read a catalog table, still with no grant to anon).
- **CLAUDE.md's `tsconfig.tests.json` comment now lists `workers/`** (review fix, user-approved).
- Gotcha: worktrees share one local Supabase stack. To test a migration without disturbing another branch's DB, copy `supabase/` to a scratch dir, change `project_id` and the db/api/pooler/shadow ports, and run `supabase db start`/`test db`/`stop --no-backup` with `--workdir`.

## Issue #36: offline app start waits on the gate's retries

Seam (from the issue): one Playwright flow, an offline reload of home (chromium).

- [x] Playwright: create a household, reload under the service worker, go offline, reload; the household shows within 3 s. Red first: blank page at 3 s, passing at 15 s (12.6 s run)
- [x] `.retry(false)` on the gate's household read (`fetchMyHousehold`); the households unit test's Supabase fake gains `retry()`
- [x] lint, vitest, both tsc, knip; chromium E2E 32 passed, only the 3 known failures
- [x] Code review: no standards violations; spec met. Fixes: test comment, dropped a no-op `setOffline(false)`, this decision line's wording

Deferrals:

- No unit assertion that `retry` gets `false`: it would test the call, not the behaviour; the e2e catches a regression. Revisit if the e2e is dropped.
- `fetchPendingJoinRequests` still retries offline: it delays only the Owner's join-request card, not reaching home. Revisit if that card's offline state feels slow.
- Offline start with an expired access token lands on the login page (reproduced with a Playwright probe: valid token, home in 55 ms; expired, the login page and no home within 90 s). Revisit: #42.

## Issue #42: offline start with an expired access token

Cause (auth-js 2.117.3 `__loadSession`): an expired session triggers a refresh; offline it fails with a retryable error, `getSession()` returns no session, and the root `beforeLoad` redirects to login. The stored session survives a retryable failure.

Seams (agreed): `useAuthStore.initialize()` (Vitest, `getSession` faked), Playwright offline start with an expired token, Playwright back online (refresh and sync resume).

- [x] Unit: a network refresh failure keeps the stored user signed in; any other failure, or nothing stored, signs out; offline, neither `initialize()` nor the gate waits on the server
- [x] Fixed `auth.storageKey`; `initialize()` falls back to the stored session on a retryable refresh failure, and uses it at once when `navigator.onLine` is false; the gate uses the last known household at once offline
- [x] Playwright: expired token, offline reload reaches home within 3 s (chromium). Red first: the login page; with only the retryable fallback, still loading after 150 s
- [x] Playwright: back online, the stored expiry moves into the future (a real refresh) and an account added offline reaches a second device without signing in again (chromium)
- [x] lint, vitest, both tsc, knip; chromium E2E 34 passed, only the 3 known failures
- [x] Code review fixes:
  - After about 26 s offline, auth-js's failed refresh reported a null `INITIAL_SESSION` and the listener cleared the user, so the next navigation went to login (reproduced: `/login?redirect=%2Fsettings`). The listener now ignores a null session on any event but `SIGNED_OUT`; the e2e waits 30 s offline, then opens Settings.
  - Signing out offline left the session in storage (auth-js keeps it when the server can't be reached), so the next person's offline start could read it. `signOut` now removes the stored session itself.
  - Smaller: the e2e reads `AUTH_STORAGE_KEY` instead of the literal; `initialize()` uses an explicit `if`.

Decisions:

- **The app owns its auth storage key** (`household-hub-auth`), so it can read the stored session without copying auth-js's `sb-<ref>-auth-token` naming. Why: that naming is internal and could change in an upgrade. Cost: existing logins sign out once; production has no users. Revisit: never.
- **Offline, skip the server on start instead of waiting for it to fail.** Why: offline, every supabase-js request first awaits auth-js, which retries an expired token's refresh for about 26 s; the gate's household read waited behind it too, so the retryable fallback alone never reached home in 150 s. `navigator.onLine` false means the stored session and last known household are used at once. Cost: a connection the browser thinks is online but isn't (captive portal) still waits ~26 s, then falls back. Revisit: if that case shows up in use.
- **`src/stores/README.md` is stale** (wrong line count, a `loading` state, no offline stored-session fallback). Why: out of scope for #42, and it was already out of date. Revisit: a separate docs cleanup.
