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
- **Review deferral: the ADR 0001 refinement** (membership is relational, not events; the gate reads the network with a local fallback) is still owed. Revisit: when milestone 1 lands.
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
- **Review deferral: adding a projection touches three places** (Dexie table, `logTables` in `log.ts`, the dispatch in `projector.ts`). Revisit: a projection registry when the second projection lands.

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
- #22 in review: PR #31 (`rearch/22-personal-accounts`). #25 owes: keep Personal events when a household is deleted; reset the pull cursor on leaving.
- Next: #23 (its edit form shows visibility read-only), #19, #24, #25; #20 (keep-alive cron) is independent.
- Gotchas found in #16:
  - `src/types/database.types.ts` is in `.prettierignore`: commit raw `npm run gen:types` output; CI diffs it against Supabase CLI 2.119.0 (must match the local CLI).
  - `supabase test db` exits 1 when `supabase/tests/` has no `.sql` files; `000_empty_baseline.sql` (asserts public has no tables) must be replaced, not just deleted, by #21's baseline tests.
  - The auto-mode classifier blocks bulk `git rm` of test files; ask the user to run large deletions with `!`.
- Unverified: nothing outstanding from #16.
