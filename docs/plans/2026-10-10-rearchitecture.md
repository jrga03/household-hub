# Re-architecture against the vision

Source of truth: `docs/VISION.md`. Vocabulary: `GLOSSARY.md`. Status: Milestone 1 (#15) landed and closed 2026-10-11; production keep-alive check pending in #40. Milestone 2 (#46) landed and closed 2026-10-12. Milestone 3 landed and closed 2026-10-13 (spec #70). Milestone 4 scoped 2026-10-13. ADRs: `docs/adr/0001`-`0008`.

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
- **Transfer, Debt Payment and Draft are roles a transaction plays.** A reversal touches only the debt link, never a transaction. Superseded for transfers 2026-10-12: a transfer is its own record (ADR 0006).
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
- **#53 (bulk, swipe, detail pane) stays one sub-issue.** Why: the three share the list's selection and row model. Revisit: split if it grows unwieldy during the build. Agreed 2026-10-12.
- **Milestone 3 = transfers (including paying a card), budgets with a month view, the category ledger, Distribute money, export, and the opening checklist.** Statement import and the dashboard (the "at a glance" summary) move to Milestone 4, which completes the first release. Why: transfers and budgets are what the opening state and paydays need; import and the dashboard read on top of them. Revisit: never; this is the M3 scope. Agreed 2026-10-12.
- **A transfer is its own entity type `transfer`** (created, edited, removed, restored), one HLC per record, shown as two legs (ADR 0006). It carries one envelope, the same on both sides: a category, Unassigned, or Card Payment. Moving into a different category is a transfer plus an allocation. Why: two linked transactions can drift apart under concurrent edits. Agreed 2026-10-12.
- **Transfer rules:** accounts differ, share visibility, and aren't retired for new transfers; existing transfers stay editable. Edit, remove and Undo follow the transaction rules. One cleared/pending status for both legs. Revisit: per-leg status with per-side dates. Agreed 2026-10-12.
- **Transfers in the list:** one row ("BPI → GCash · Groceries"), signed when an account filter is on, left out of income and expense totals, counted in balances. Agreed 2026-10-12.
- **Paying a card is a transfer from the paying account's Card Payment for that card into the card.** A partial payment leaves the rest reserved. Paying from a non-default account B is one command writing three records: an allocation in the default account A (Card Payment → Unassigned), an allocation in B (Unassigned → Card Payment), then the transfer from B. Agreed 2026-10-12.
- **A budget is `budget.set {categoryId, fromMonth, amount, accountId}`**, its ID derived from category and month, latest HLC wins within a month. It stands until a later fromMonth replaces it, so every set is a version (history). Amount 0 or null clears it. `accountId` is the funding account: same visibility as the category, not a card. Personal categories can have budgets (ADR 0007, amends 0003). Agreed 2026-10-12.
- **"Spent" = expenses minus refunds in the category by local date**, transfers excluded, card purchases on their purchase date. Agreed 2026-10-12.
- **Month view:** a month picker on Categories showing budget, spent, allocated this month, and end-of-month money (current money for this month). Groups show sums. Categories keep their name order (no user order exists; `src/lib/categories/projection.ts` sorts by name). Agreed 2026-10-12.
- **Category ledger:** tapping a category in the month view opens every transaction, transfer and allocation touching it that month, with a running balance from the start to the end of the month, plus a "Budget history" list (versions with months, amount, account). Detail pane on wide screens, sheet on phones. Agreed 2026-10-12.
- **Distribute money** starts from a source account's Unassigned. Lines come from the budgets (amount, and destination = the budget's funding account). Prefill = remaining budget this month (budget minus what was allocated to that category this month in any account, floored at 0), which handles twice-monthly PH payroll. Carryover balance is ignored. Agreed 2026-10-12.
- **Distribute writes one command:** one transfer of Unassigned per destination account that isn't the source (the line totals), plus allocations in each destination; lines staying in the source are plain allocations. The excess stays in Unassigned. A shortfall warns ("₱X more than this income") but doesn't block. Unbudgeted categories can be added by hand. Retired categories are skipped. A retired funding account falls back to the source and shows "Funding account retired". Agreed 2026-10-12.
- **Distribute entry points:** a "Distribute" action in the toast after recording income (prefilled with that account and amount), and an opening-allocation mode with blank amounts and the source as the destination. Agreed 2026-10-12.
- **Export (Settings):** a transactions CSV (transfers included and marked) plus the event-log JSON, covering only what the member can see. No zip library. Agreed 2026-10-12.
- **Opening checklist on home:** starting balances, then distribute, then set budgets. It ticks itself off from the data; dismissal is per device in localStorage, wrapped in try/catch. Agreed 2026-10-12.
- **No server migration in M3** (`events.entity_type` accepts any type) **and no pgTAP.** Agreed 2026-10-12.
- **M3 seams:** Vitest permutation and duplicate tests for the transfer and budget projections, plus the balance = Unassigned + category money invariant with transfers and card payments; Vitest for the Distribute command, including twice-monthly payday; Playwright chromium for an offline transfer reaching a second device and a payroll distribution leaving the account at ₱0. Agreed 2026-10-12.
- **M3 splits into seven sub-issues** (#71-#77), built in rounds: {#71 Transfers, #73 Budgets}, then {#72 Pay card, #74 Category ledger, #75 Distribute, #76 Export}, then #77 Opening checklist. Agreed 2026-10-12.
- **The glossary's Funding Account (a budget's) is distinct from a card's Paying Account**, so "Funding account" left Paying Account's avoid list. Why: the agreed budget design names its account the funding account. Revisit: if members confuse the two. 2026-10-12.
- **Deferred: a per-account register.** Why: the filtered transaction list covers it for now. Revisit: Milestone 4, or on request. Agreed 2026-10-12.
- **Deferred: category priority order for shortfalls.** Why: Distribute warns and the member trims by hand. Revisit: if trimming gets tedious. Agreed 2026-10-12.
- **Dropped: a home account per category.** Why: superseded by the budget's funding account (ADR 0007). Revisit: never. Agreed 2026-10-12.
- **Deferred: transfers out of a card.** A cash advance is a card expense plus income. Revisit: if they come up often. Agreed 2026-10-12.
- **Deferred: restoring from a backup.** Revisit: after the first release. Agreed 2026-10-12.
- **Deferred: export modes**, a size-optimized app-restorable one and a compatibility-optimized Excel/Sheets one (#69, `needs-triage`). Revisit: someday, after the first release, when no higher-value feature is waiting. Agreed 2026-10-12.
- **The debts UI docs are obsolete** (`docs/plans/2026-10-10-debts-ui-design.md`, `docs/plans/2026-10-10-debts-ui.md`): they describe the old row-outbox design. Each carries a superseded line. Revisit: when debts are rebuilt on the event log (after the first release). Agreed 2026-10-12.
- **The other envelope helpers stay in `allocations/events.ts`** (`sameEnvelope`, `cardPaymentEnvelope`, the `Envelope` type); #83 moved only `envelopeLabel`, and no follow-up issue was opened. Why: triage scoped #83 to the label. Revisit: if more non-event code lands in `events.ts`. Agreed 2026-10-13.
- **Milestone 4 = statement import and the home dashboard**, completing the first release. The per-account register stays deferred (the filtered list covers it); the analytics drilldown and debts stay after the first release. Agreed 2026-10-13.
- **Home is a hub of sections**: the opening checklist (while open), then Finances; later non-finance sections (shared todos) join as more sections. A plain ordered list of section components in the home route, no registry until a second non-finance section exists. Agreed 2026-10-13.
- **The Finances section is the current month's overview**: money in, money out, left; account balances; budget status counts (close at 80% or more of the budget spent, over above 100%); the last 5 entries; each block links to its full screen. Transfers excluded. No month picker, no charts (those belong to Categories and the later analytics). Agreed 2026-10-13.
- **Household / Mine toggle on Finances**, remembered per device, never one blended total. Why: an allowance is household spending and what's spent from it is personal spending; blending double-counts. Agreed 2026-10-13.
- **Import starts with two formats: BDO credit card PDF and UnionBank credit card XLSX.** Each format is a `StatementParser` (`file + password → StatementLine[]`); other banks and e-wallets are later issues, one per format. Agreed 2026-10-13.
- **Parsing runs in the browser, in a lazy-loaded Web Worker**, precached so it works offline. Dependencies: `pdfjs-dist` and `cfb` only; XLSX decryption by WebCrypto, unzipping by `DecompressionStream`, and a small XML reader (Workers have no `DOMParser`). Rejected: a Cloudflare Worker (statements and passwords leave the device; 10 ms CPU) and importing the skills' CSV (breaks "the format the bank sends"). Catch: the PWA precache glob is `**/*.js`, so pdf.js's `.mjs` worker must be bundled through Vite or the glob must add `mjs`. Agreed 2026-10-13.
- **The import chunk gets its own size budget**: its first measured size plus 10%, enforced by `npm run size`. Agreed 2026-10-13.
- **Statement passwords are typed per file and never synced.** A format with a fixed password (BDO) offers an opt-in "Remember password on this device" per card, in device storage, wiped on sign-out and household switch; a per-file format (UnionBank) never offers it. Agreed 2026-10-13.
- **Drafts are device-local** (ADR 0008): a Dexie table outside the event log, grouped by Import (file name, account, imported-at). Saving creates transactions in one `appendTogether`, single or bulk; saved and discarded drafts are deleted, and an Import disappears once empty. Drafts are wiped with household data on switch; the sign-out warning counts unsaved drafts beside Waiting changes. Agreed 2026-10-13.
- **One statement is one account**: the card is picked once per file from the cards, preselected from the last one used with that format on this device. Agreed 2026-10-13.
- **Import keys** (ADR 0008): `transaction.created` v3 carries `importKey` (v1 and v2 upcast to `null`), a hash of format, account, line date, raw description, amount and position among identical lines. Exact match on a non-removed transaction: "Already imported", discarded by default. Against transactions without a key, same account, direction and amount within ±3 days: "Might already be recorded", shown with the match, never auto-discarded. Agreed 2026-10-13.
- **Card-payment lines** on a card statement are detected, matched against transfers into that card and discarded by default; with no match the draft offers "Record as card payment" (the pay-card flow). Never saved as income. Agreed 2026-10-13.
- **Draft defaults:** the purchase date (not the posting date), cleared, and a category suggested from the most recent saved transaction with the same normalized description (uppercased, digits and extra spaces stripped); otherwise "Needs a category". Agreed 2026-10-13.
- **LLM-ready seams:** `StatementParser` and `DraftSuggester` (`(drafts, context) → Promise<Suggestion[]>`, a suggestion being `{draftId, description?, categoryId?, source: "history" | "llm"}`), run async in order and never blocking; the review UI marks suggested values. M4 ships only the history suggester. Deferred: an LLM suggester or parser. Why: needs a provider choice (free tier first, e.g. Cloudflare Workers AI) and a privacy call on sending descriptions off the device. Revisit: after the first release. Agreed 2026-10-13.
- **Import lives on `/import`**: open Imports and their drafts, detail pane on wide screens and sheet on phones, reached from "Import statement" on Transactions and the nav. Files come from the file picker. Deferred: Web Share Target. Why: iOS PWAs don't support it. Revisit: if Android-only sharing is worth it. Agreed 2026-10-13.
- **Statement fixtures:** synthetic encrypted fixtures (generated by a committed script) cover the parsers in CI; real statements, supplied by the user during the build, go in git-ignored `tests/fixtures/statements/private/`, with passwords in `.env.local`, and their tests skip when absent. Agreed 2026-10-13.
- **M4 seams:** Vitest for each parser, import-key generation, the duplicate matcher, card-payment detection, the history suggester, the save-drafts command (all or nothing), `transaction.created` v3 upcasts with a permutation test, and `readFinanceOverview()` for Household and Mine. Playwright chromium: import the synthetic BDO PDF offline, save in bulk, see it in Transactions, re-import shows "Already imported"; home layout baselines refreshed. No server migration, no pgTAP. Agreed 2026-10-13.
- **M4 splits into four sub-issues**, built in rounds: {home sections and Finances, statement parsing foundation with the BDO parser}, then {drafts and review, UnionBank parser}. Agreed 2026-10-13.

## Milestone 4

Spec: #95. Scoped 2026-10-13 (decisions above). ADR 0008. Build rounds: {#96, #97}, then {#99, #98}. Each sub-issue fills in its own subsection below.

- [x] File the spec issue and the four sub-issues (`ready-for-agent`, blocked-by edges)
- [x] #96 Home sections and the Finances overview (Household / Mine); PR #101
- [x] #97 Statement parsing foundation: Web Worker, `StatementParser`, BDO PDF parser, offline precache, import chunk budget, remembered password; PR #103
- [ ] #99 Drafts and review (blocked by #97): drafts table, `/import`, import keys, duplicate and card-payment flags, `DraftSuggester` with history, save and discard, wipe and sign-out warning
- [x] #98 UnionBank XLSX parser (blocked by #97); PR #105
- [ ] Close #95

### #96 decisions

- **Seams:** `readFinanceOverview()` (`lib/finances/overview.ts`), Vitest seeded through commands; a `FinancesSection` component test for the links, the remembered Household / Mine choice and blocked storage. Home's layout baselines refreshed, with the month label masked so they don't drift monthly.
- **Home's sections are plain JSX in order:** the opening checklist, Finances, then the household cards (name and code, join requests, members, accounts) as one household section. Why: the plan said no registry until a second non-finance section exists; review found an array of sections was one.
- **Mine is Personal and owned by the member**, matched on each record's own visibility and owner, so another member's Personal records never count even if this device holds them.
- **The latest 5 span all months**, newest first, transfers included; in, out and left cover only the current month. Agreed 2026-10-13.
- **Budget status counts categories in use with a budget this month.** Close is 80% to 100% spent (compared without dividing cents), over is above 100%; a ₱0 budget is over with any spending.
- **Balances link per account** to Transactions filtered by that account. Why: accounts have no screen of their own; they are managed on home. An Accounts screen and how the nav groups finance pages are filed as #102 (`needs-triage`). Revisit: at #102's triage. Agreed 2026-10-13.
- **The toggle's name is "view" (`FinanceView`)**, not "scope", and the list reads "Latest transactions", not "entries" (both on GLOSSARY's avoid lists).
- **Deferred: sharing row display with `TransactionList`.** The latest list repeats a small part of its label and amount logic. Why: that logic is a closure inside `TransactionList`; extracting it is a refactor of a busy component. Revisit: if a third list needs it.
- **Deferred: the month at midnight.** An open home keeps last month's figures until it re-renders after the 1st. Revisit: if it confuses anyone. Agreed 2026-10-13.

### #97 Statement parsing foundation

- [x] `StatementParser`, `StatementLine` and `StatementParseError` (`src/lib/import/statement.ts`); formats in `formats.ts`
- [x] BDO PDF parser (`bdo-pdf.ts`) on pdf.js text lines (`pdf-text.ts`); synthetic fixture test, wrong password, no password, not a statement, not a PDF
- [x] Real-statement test: previous balance plus every line equals the printed TOTAL; passes on the user's four statements (May to Aug 2026: 79, 71, 22 and 9 lines), and counts and nets match the `bdo-statement-parser` skill exactly
- [x] Web Worker plumbing (`parse.worker.ts`, `parseStatement`), precached; e2e reads the synthetic PDF offline after install
- [x] Import worker budget in `npm run size` (535.9 KB gz first measured, budget 590); initial budget unchanged at 378
- [x] Remembered password per card, opt-in, wiped on sign-out (database reset), session expiry and household switch
- [x] Minimal `/import` entry point (format, card, file, password, parsed lines)
- [x] PR #103

#### #97 decisions

- **pdf.js legacy build.** Why: the modern pdf.js 6 build calls `Math.sumPrecise`, missing from Node 26 and from Safari before 26. Revisit: when iOS Safari 26 is the oldest a member uses.
- **pdf.js runs inside our worker, not in a nested one**: `globalThis.pdfjsWorker` makes it use its worker code in-thread, so the whole import is one precached `.js` chunk and the `.mjs` precache catch never arises. pdf.js's worker module starts itself on any worker's global port, so requests carry a `MessagePort` of their own for the reply.
- **The import budget measures the worker chunk** (`parse.worker-*.js`); the `/import` route chunk is ~2 KB and grows with #99.
- **Remembered passwords live in the Dexie `meta` table** (`statementPassword:<accountId>`), in plain text like the rest of the local finance data, so sign-out's database reset deletes them and `switchHousehold` forgets them in its transaction. A session expiry keeps the local database (unsynced changes) but forgets them too, since the next person to sign in may be someone else. No Dexie version bump.
- **Every card section on a statement goes to the one picked card** (supplementary cards included), per "one statement is one account". Zero-amount lines are skipped.
- **`/import` has no nav link yet.** Why: #99 adds "Import statement" on Transactions and the nav. Revisit: #99.
- **The synthetic fixture is regenerated with `node scripts/make-statement-fixtures.mjs`**, which needs `qpdf` (Homebrew); CI reads the committed PDF.
- **The real-statement result stays in this doc, not on #97 or the PR.** Why: the user's call (2026-10-13). Revisit: never.
- **A recognised statement with no lines shows "0 lines read" with no explanation.** Why: the review screen that explains it is #99's. Revisit: #99.

### #98 UnionBank XLSX parser

- [x] Office agile decryption (`office-encryption.ts`): `cfb` opens the container, a synchronous SHA-512/384 (`sha512.ts`) derives the key, WebCrypto AES-CBC decrypts; wrong password caught by the verifier hash
- [x] Zip reader on `DecompressionStream` (`zip.ts`) and a regex SpreadsheetML reader for shared and inline strings (`xlsx.ts`)
- [x] UnionBank parser (`unionbank-xlsx.ts`), registered as a per-file-password format; synthetic fixture test (purchases, a refund, a fee reversal, a card payment), wrong password, no password, a workbook that isn't a statement, a file that isn't a workbook
- [x] Code review (standards and spec): card-payment rule tightened, date cells read as text, AES key imported once
- [x] Real-statement test: every line adds up to the statement's PURCHASES & ADVANCES, PAYMENTS & CREDITS and TOTAL AMOUNT DUE; passes on the user's three statements (Jul to Sep 2026: 29, 68 and 92 lines; Jul and Aug match the `unionbank-statement-parser` skill's counts), one card payment each in Aug and Sep
- [x] e2e: the synthetic UnionBank XLSX reads offline, with no "Remember password" (chromium and Mobile Chrome)
- [x] Import worker 552.7 KB gz (was 535.9; `cfb` is most of it), inside the 590 budget, unchanged
- [x] PR #105

#### #98 decisions

- **The 100,000-round password hash runs in a synchronous SHA-512/384, not `crypto.subtle.digest`.** Why: each round awaits the previous one, so WebCrypto took 4.9 s in Node; in-thread it takes 0.3 s. WebCrypto still does the AES. Only AES-CBC with SHA-384 or SHA-512 is accepted (Excel's default and UnionBank's); anything else is a reported "failed". Revisit: if a bank sends another cipher.
- **A card payment is a credit whose description has the word PAYMENT but not FEE, CHARGE or REVERSAL.** UnionBank's are "BDO BILLS PAYMENT -CASH"; refunds (Shopee, GSM) and fee reversals ("LATE PAYMENT FEE REVERSAL") aren't flagged. Looser than BDO's `^PAYMENT RECEIVED` because UnionBank names the paying channel. Revisit: when a payment shows up unflagged or a refund flagged.
- **UnionBank prints one date per line; it is both purchase and posting date.**
- **The CURRENCY column is ignored**: PHP on every line of all three statements. Revisit: if a non-PHP line appears.
- **The parser doesn't reconcile against the statement's totals; the real-statement test does**, as for BDO. Why: the review screen (#99) is where a mismatch would be shown. Revisit: #99.
- **Dates are read only as `MM/DD/YYYY` text**, as on all three statements; date-typed cells and two-digit years aren't. Why: no statement uses them. Revisit: if a statement reads with lines missing.
- **An unencrypted .xlsx is "not a statement in this format".** Why: UnionBank always encrypts. Revisit: if someone re-saves a statement without its password.
- **The synthetic XLSX is encrypted by `msoffcrypto-tool`** (via `uvx`), an implementation independent of ours. Its worksheet is stored uncompressed so the package passes 4 KB: msoffcrypto writes smaller packages (the compound file's mini stream) corruptly.
- **Real UnionBank passwords live in `.env.local` as `UB_STATEMENT_PASSWORD_<yymm>`**, matched to the statement file name's leading `yymm`, since each file has its own.
- **`/import`'s Format and Card selects are keyed by their value.** Why: Radix Select returns to its first value on form reset, which React 19 does after every action, so a second read silently switched back to BDO (and to the first card). Other action forms that stay open after an error may have the same bug: #104.

## Milestone 3

Spec: #70. Scoped 2026-10-12 (decisions above, agreed 2026-10-12). ADRs 0006 and 0007. Build rounds follow the blocking edges: {#71, #73}, then {#72, #74, #75, #76}, then #77. Each sub-issue fills in its own subsection below (checkboxes and a decisions list), so parallel PRs don't conflict here.

- **Round 2 runs all four in parallel**, after `appendTogether` (`src/lib/events/log.ts`) lands on main: #72 and #75 each write several records in one command, and building the helper twice would conflict. Merge order: #74 (it changes the Categories layout most), #76, #72, #75; each later branch merges main before its PR merges. Why: #72, #74 and #75 all edit `CategoriesView.tsx`. Agreed 2026-10-12.
- **`appendTogether(fn)` makes several commands one change**: commands called inside it join one Dexie transaction over the log tables, so a later refusal keeps none of the earlier events, and later commands see what earlier ones projected. Lint-fenced to commands like `appendEvent`. Agreed 2026-10-12.

- [x] #71 Transfers
- [x] #72 Pay a credit card (blocked by #71), PR #86
- [x] #73 Budgets and the month view
- [x] #74 Category ledger
- [x] #75 Distribute money (blocked by #71, #73), PR #87
- [x] #76 Export (blocked by #71)
- [x] #77 Opening checklist (blocked by #75), PR #89
- [x] Close #70 (closed 2026-10-13)

## Issue #77: opening checklist

Seams (from #70's Testing Decisions and the issue's acceptance criteria): step completion derived from the projections (Vitest).

- [x] Step completion (starting balances, distribute, budgets) from the projections
- [x] Checklist on home with links; Distribute opens in opening mode
- [x] Per-device dismissal in localStorage, wrapped in try/catch
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #77 decisions

- **Seams:** `readOpeningSteps()` (`lib/opening/steps.ts`), Vitest seeded through commands; an `OpeningChecklist` component test for dismissal and blocked storage; `tests/e2e/opening-checklist.spec.ts` on chromium. Home's layout baselines refreshed for the new card.
- **"Distributed" counts allocations out of Unassigned only**, not transfers. Why: every Distribute line writes an allocation, while a transfer of Unassigned only moves it to another account's Unassigned. Revisit: if a household distributes by transfers alone.
- **Starting balances count only active accounts with more than ₱0**, cards included; Distribute opens on the first such account that isn't a card.
- **Budgets count any version with an amount**; a budget cleared in its only month doesn't.
- **The checklist hides once all three steps are done**, as well as on dismissal. Dismissal is keyed by household, so joining another household shows its checklist.
- **"Add an account" links to `/#add-account`**, the form on home; the router scrolls it into view.
- **Review fixes:** step 2 reads "Distribute them into categories" (GLOSSARY avoids "envelope"); "Opening Checklist" added to GLOSSARY.md; each step's button stacks under its text below a 480px container, so phones don't squeeze the copy.
- **Review deferrals:** an `allDone` field on `OpeningSteps`, a shared constant for the `add-account` anchor, and a glossary entry for Distribute. Why: low value for one caller each. Revisit: if a second caller appears.

## Issue #76: export

Seams: the CSV and JSON builders (Vitest).

- [x] Transactions CSV: transfers included and marked, removed records left out, values escaped
- [x] Event-log JSON of the local log
- [x] Settings section with two downloads (no zip library)
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #76 decisions

- **Seams:** `toCsv` escaping, `readTransactionsCsv`, `readEventLogExport` (Vitest, seeded through commands); one Playwright spec downloads both offline. Agreed 2026-10-12.
- **Amount is a plain positive decimal** ("1500.50"); the Type column says Expense, Income or Transfer. Why: spreadsheets sum it as a number. Agreed 2026-10-12.
- **Text that starts like a formula** (`= + - @`, tab, CR) gets a leading apostrophe. Why: another member's description must not run as a formula. Agreed 2026-10-12.
- **A transfer is one row**: Account is where the money leaves, To account where it goes, Category its envelope. Rows run oldest first (date, then recorded order).
- **The CSV starts with a UTF-8 byte-order mark** so Excel keeps ₱, ñ and the Card Payment "·". Agreed 2026-10-12.
- **No Visibility column in the CSV** for now. Why: the issue doesn't ask for one. Revisit with export modes (#69). Agreed 2026-10-12.
- **Moving `envelopeLabel` out of `allocations/events.ts`** is deferred to #83. Why: a display label doesn't belong with the decoders, but it is a separate refactor. Agreed 2026-10-12.
- **`categoryNames(list)` and `readCategoryNames()` both stay.** Why: low value. Revisit when either changes. Agreed 2026-10-12.

## Issue #75: Distribute money

Seams (from #70's Testing Decisions): the Distribute command and its prefill (Vitest, including a twice-monthly payday); Playwright chromium for a payroll distribution leaving the account at ₱0.

- [x] Prefill: remaining budget this month in any account, floored at 0
- [x] Command: one transfer per other destination account plus allocations; source lines as allocations; excess stays; shortfall warns
- [x] Retired categories skipped; retired funding account falls back to the source with "Funding account retired"
- [x] Unbudgeted categories added by hand
- [x] Entry points: income toast action (prefilled); opening-allocation mode
- [x] Playwright (chromium): payroll distribution leaves Unassigned at ₱0
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #75 decisions

- **Seams:** `readDistributeLines(source, month, mode)` (`lib/budgets/distribute.ts`) and `distributeMoney` (`lib/commands/distribute.ts`), Vitest seeded through commands; `tests/e2e/distribute.spec.ts` on chromium.
- **Distribute is a route, `/distribute?account&amount&date&mode=opening`**, not a dialog. Why: the toast, the Categories header and #77's checklist all link to it, and a list of lines needs a page on phones. #77 opens it with `mode=opening` (and `account` when it knows one).
- **The month is the distribution date's month**, prefilled with the income's date. Allocations and transfers carry that date, so the next payday's prefill counts them.
- **Opening mode lists every category in use the source can hold**, blank, kept in the source, with each budget shown for reference. Why: #77's checklist puts distribute before set budgets, so budget-only lines would be empty. Revisit: if the list is too long for a big household. Agreed 2026-10-12.
- **Lines are only categories the source can hold** (same visibility and owner); a Personal budget doesn't show when distributing a Household account.
- **A funding account that can't take the money** (retired, a card, another visibility, or not on this device) falls back to the source; only a retired one shows "Funding account retired".
- **The Income field caps the warning**; left blank, the source's Unassigned does ("₱X more than BPI's Unassigned"). Opening mode has no Income field.
- **The Distribute toast action shows only for income into Unassigned**: a categorized income (a refund) is already in an envelope. Agreed 2026-10-12.
- **Each transfer is described "Distribute money"**, so it explains itself in the transaction list.
- **A Distribute button sits in the Categories header**, so a payday is reachable after the toast is gone.
- **"Allocated this month" is net**: Move money out of a category this month raises its next prefill by that much. It reuses the month view's figure, so Distribute and Categories agree. Agreed 2026-10-12.
- **The shortfall line adds a hint** ("You can still distribute it; trim a line or Unassigned shows in red") after the spec's "₱X more than this income".
- **Known limit: two devices distributing the same payday before syncing both fund the budgets.** Every record is new, so nothing is overwritten; the source's Unassigned goes negative and shows red. Revisit: if it happens in practice (a guard would need the server). Agreed 2026-10-12.
- **Review fixes:** the top card's grid sits inside its `@container` (an element can't query itself); `categoriesHeldBy` shared by the reader and the add-a-category picker; `distributeMoney` is async and throws like the other commands.
- **Review deferrals:** a `todayLocal()` helper for the repeated `format(new Date(), "yyyy-MM-dd")`, and using `categoriesHeldBy`-style flattening in `CategoriesView` and `envelopes.ts`. Why: they touch files other round-2 branches edit. Revisit: after round 2 merges. Agreed 2026-10-12.

## Issue #74: category ledger

Seams: the ledger read function (Vitest: rows, opening and closing money, running balance, with a transfer and a card purchase).

- [x] Ledger read function for a category and month
- [x] Budget history list (versions with month, amount, funding account)
- [x] Detail pane on wide screens, sheet on phones; rows open their record
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit
- [x] This month's ledger shows money dated later
- [x] Retiring a category with money moves it into a chosen category first; the retired-with-money list goes
- [x] "Ledger" in GLOSSARY.md
- [x] PR (#85)

### #74 decisions

- **A ledger row's change is `sumAccountMoney` run on that record alone**, so the ledger can't disagree with the month view. Agreed 2026-10-12.
- **"End of month" is strict (records dated in the month); this month adds a muted "Dated later" line** when future-dated records make the category's money differ. Why: the month view counts them for this month. Agreed 2026-10-12.
- **Ledger rows open their record by ID, looked up live**, so a removal on another device closes the edit (as the transaction list does). Agreed 2026-10-12.
- **Retiring a category that holds money asks which category to move it into**; the move (one allocation per account, negative money moved back in) and the retire are one change. Retired categories no longer show money on Categories. A retired category left holding money by a sync race can still be emptied from Move money's Retired choices. Agreed 2026-10-12. Revisit: if such races happen in practice.
- **Shared detail pane for Categories and Transactions is deferred** to its own refactor PR. Why: keeps #74's diff on the ledger. Revisit: after round 2 merges.
- **The list-row helpers stay in `transactions/filter.ts`.** Why: the ledger uses its own `LedgerRecord` union and didn't need them. Revisit: if another screen lists mixed records.

## Issue #73: budgets and the month view

Seams (from #70's Testing Decisions): the budget projection through `receiveEvents` (Vitest; permutations and duplicates), the budget in force for a month and the month figures (Vitest), the commands (Vitest).

- [x] Budget events, decoder and projection; ID from category and month; registered; Dexie table
- [x] Budget in force for a month; 0 or null clears it
- [x] Commands: funding account visibility and owner, not a card, not retired
- [x] Month figures: spent, allocated this month, end-of-month money; group sums
- [x] Month picker on Categories; Set budget dialog
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #73 decisions

- **One event type, `budget.set {categoryId, fromMonth, amountCents, accountId}`**; an amount of 0 or null decodes to a clear (`amountCents: null, accountId: null`), and a clear is kept as a row, since it ends the earlier version from its month.
- **The ID is UUIDv5 of the category ID and `budget:yyyy-MM`**; `uuidV5` moved from `categories/defaults.ts` to `lib/utils/uuid.ts` to share it. The earliest set fixes the category, month, visibility and owner; a later set naming another category or month under the same ID is ignored. Why: the fold is synchronous, so it can't re-derive the ID to check it.
- **A budget set is never a creation** (`isCreation` is false): no set depends on another, so discarding one refused set leaves the rest.
- **The budget in force is resolved at read time** (`budgetInForce`, `budgetsInForce` in `lib/budgets/inForce.ts`): the version with the latest `fromMonth` at or before the month, null when that version cleared it.
- **`setBudget` appends nothing when the month's own version already says the same**, or a clear meets no budget in force. Why: a re-sent set carries a later HLC and would undo another device's change (the #49 rule). Setting December to what October already says is recorded, so December stays pinned if October changes later (review fix: "every set is a version").
- **The command refuses a retired category for sets and clears alike**, and checks the funding account (same visibility and owner, not a card, not retired) only when setting an amount. Revisit: if a retired category's budget needs clearing (Distribute skips retired categories anyway).
- **Allocated this month = allocations dated in the month into the category, less those out of it, in any account**, removed ones left out. Moves between two categories count on both (out of one, into the other).
- **Spent = expenses minus refunds (income) in the category dated in the month**, removed ones left out, on any account (card purchases by their own date). Uncategorized transactions count nowhere.
- **End-of-month money is `sumAccountMoney` over transactions and allocations dated up to the month's end**, pivoted by category; for this month it is the current money (future-dated records included), as on the Categories screen before. A month comparison is on the "yyyy-MM" prefix, never a `Date`.
- **The month lives in the URL (`/categories?month=yyyy-MM`)**, left out for this month, so a bookmark follows the calendar; a bad value falls back to this month. The picker is previous/next buttons plus "This month".
- **Each category row shows its month money on the right** (end of month, or now) and a Budget · Spent · Allocated line beneath; the Budget figure is the Set budget button ("Set" when none) with the funding account's name under it. Groups show the same three sums plus the money sum in their header.
- **Unassigned and "Retired, still holding money" stay current**, whatever month is picked. Why: the month view is about categories; Unassigned feeds Move money, which acts now.
- **The Set budget dialog** takes the amount (0 clears it), the from month (the chosen month by default, 12 either side) and the funding account (accounts in use that `canFundBudget`: the category's visibility and owner via `canHoldMoneyIn`, not cards). Amount and account prefill from the budget in force for the chosen From month and follow it when From changes; a funding account that is retired or no longer fits is named in a warning, not switched silently.
- **Dexie `budgets` is version 9** (`id` only), after #71's transfers at version 8, which merged first.
- **Merging #71: the month-end money includes transfers dated by the month's end**, so `moneyByAccount` splits a category's money between accounts as transfers moved it; a transfer never counts as spent or allocated. Covered by a month test (BPI → GCash Groceries transfers in October and November).
- **Past months show current Unassigned.** Unassigned and "Retired, still holding money" ignore the month picker. Why: they are what can be allocated now. Pending: asked the user 2026-10-12.
- **Clearing a retired category's budget is refused**, like setting one; Distribute skips retired categories anyway. Agreed 2026-10-12.
- **Set budget's From month offers 12 months either side** of the chosen month. Revisit: if someone asks for more. Agreed 2026-10-12.
- **A 10,000-transaction timing guard covers the month figures** (under 50 ms, like the money guard).
- **A group's sums include its retired categories** (review fix), so a month's spending doesn't drop out of the group when a category is retired later.
- **Review fixes:** `requireCategory` shared in `commands/records.ts`; `canFundBudget` beside the budget projection, used by the command and the dialog; a negative amount says "more than zero"; `findCategoryInUse` instead of a fake `Editing`; the category row takes one optional `budgeting` prop (month figures plus the Set handler); `useBudgets` holds both budget hooks.
- **Review: kept the earliest set fixing a budget's visibility and owner.** Category visibility is fixed at creation (ADR 0005), so a later set never legitimately carries another.
- **Review deferral: `budgetsInForce` filters the versions once per category** (O(versions × categories)). Revisit: if a household's budget history grows into thousands of versions.
- **No layout baseline covers Categories**, so the screen was checked by a throwaway chromium spec with desktop and 390 px screenshots; `categories.spec.ts` and `allocations.spec.ts` still pass.

## Issue #72: pay a credit card

Seams: the pay-card command (Vitest), the invariant after every permutation of a payment from a non-default account.

- [x] Command: from the Paying Account one transfer; from another account the reservation moves there (up to what the Paying Account holds), then the transfer
- [x] Refusals: non-card destination, visibility or owner mismatch, card or retired payer
- [x] Partial payments leave the rest reserved; invariant after every permutation of a payment from another account
- [x] Pay card action on the card row and the Card Payment line
- [x] build, lint, vitest (55 files / 5618), both tsc, knip, size (301.3 KB gz); related chromium specs 9/9
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #72 decisions

- **`payCard` lives in `commands/cards.ts`** and runs inside `appendTogether`: it checks the card and payer first (with payment wording), then writes the allocations and calls `addTransfer`, so any later refusal keeps nothing. Retired accounts are refused by `addTransfer` itself (same message).
- **Paying from another account frees only what the Paying Account holds for the card, up to the payment** (`reservationFreed` in `transactions/money.ts`, shared with the dialog), and writes no allocation there when it holds nothing, so that case is one allocation plus the transfer, not two. The payer's Unassigned reserves the whole payment. Why: freeing more than is held would turn the Paying Account's Card Payment red and overstate its Unassigned. The cap reads this device's projections, so two offline payments can still draw it below zero (shown red, like any envelope). Agreed 2026-10-12; #72's acceptance criterion reworded to match. Revisit: if members expect the whole payment moved regardless.
- **The payer's allocation into the Card Payment skips `refusePaidElsewhere`** through `reserveToPayFrom` in `commands/allocations.ts`, called only by `payCard` right before the transfer drains it. `addAllocation` keeps refusing a Card Payment outside the Paying Account. Revisit: never; a lone Card Payment outside the Paying Account still comes only from the #71 transfer rule.
- **A lone pay-card transfer from a non-paying account stays allowed** (the #71 review question): `payCard` always moves the reservation first, and the Add transfer UI offers no card destinations, so only a crafted call skips it. Revisit: if such transfers show up in synced data.
- **Paying from another account doesn't change the card's Paying Account**; it's a choice for this payment only.
- **The Pay action shows on a card's Accounts row and on its Card Payment line in its Paying Account**, for cards in use. A Card Payment left behind in an earlier Paying Account has no Pay action; Move money frees it (agreed 2026-10-12). The dialog prefills what the Paying Account holds (blank when nothing), today and the Paying Account, notes how much of the reservation goes back when another payer is chosen, and warns (doesn't block) when the payer's Unassigned, or the Paying Account's Card Payment, would go negative.
- **The Categories dialog state lives in `UnassignedCard`**, which resolves the card by ID each render, so a card retired on another device closes it. Keeps the `CategoriesView` diff small (#75 also edits it).
- **Review fixes:** `cardPaymentEnvelope(cardId)` beside `UNASSIGNED_ENVELOPE`; `reserveToPayFrom` takes a `PaymentReservation` object; `checkPayer` keeps only the card-specific checks; `UnassignedCard` drops a card retired mid-payment; the reservation move no longer depends on the card having a Paying Account.
- **Review: a card with no Paying Account can't reach `payCard`.** `checkAccountDetails` refuses a card without one, so a v1 card event (upcast to null) never projects. Kept the null-safe branch anyway.
- **Review deferral: a card whose Paying Account was retired on another device can't be paid from elsewhere** (`addAllocation` refuses the retired Paying Account). Retiring an account that pays a card is refused locally, so only a concurrent offline retire and repoint reaches it; editing the card's Paying Account fixes it. Revisit: if seen in synced data.
- **Review: kept the duplicated Pay button and dialog state** in `AccountsCard` and `UnassignedCard` rather than a `PayCardButton`: the dialogs mount in different places.
- **Screens checked by a throwaway chromium spec** (the issue's demo, desktop and 390 px): Visa owes ₱0, BPI ₱17,000 all Unassigned, GCash ₱6,000. Resizing across the layout breakpoint closes any open dialog (the layout remounts); not new.

## Issue #71: transfers

Seams (from #70's Testing Decisions): the transfer projection and read-time sums through `receiveEvents` (Vitest; permutations, duplicates, the balance = Unassigned + category money + Card Payments invariant after every permutation), the commands (Vitest), Playwright chromium for an offline transfer reaching a second device.

- [x] Transfer events, decoder and projection (details, status, removal resolve apart); registered; Dexie table
- [x] Read-time sums apply transfers to both accounts; invariant after every permutation
- [x] Commands: add, edit, set status, remove, restore; the transfer rules
- [x] List: one row per transfer, signed under an account filter, out of income and expense totals; type filter gains Transfer
- [x] Edit, remove with Undo, swipe and bulk status and remove on transfers
- [x] Playwright (chromium, two browsers): offline transfer reaches B
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #71 decisions

- **Six event types**: `transfer.created` (details plus status), `transfer.edited` (details: date, amount, from and to accounts, envelope, description, notes), `transfer.marked_cleared` / `transfer.marked_pending`, `transfer.removed` / `transfer.restored`; details, status and removal each resolve by their own latest HLC, like transactions. Dexie v8 `transfers`. The decoder refuses the same account on both sides, so such an event never projects.
- **The envelope reuses the allocation's tagged `Envelope`** (`unassigned`, `category`, `card_payment`), so the sums, labels and select keys are shared.
- **`sumAccountMoney` takes transfers as a required fourth argument.** Each leg moves the balance (in the transfer's status bucket) and the envelope; a card holds no envelopes, so money into a card lowers what it owes (paying it) and money out raises it. The sums handle a transfer out of a card or to an account not on this device (only the known side moves), though the command refuses the first. Why required: a caller that forgets transfers would show wrong balances. Revisit: never.
- **Envelope fit:** a category in use of the accounts' visibility, Unassigned, or a Card Payment going into the card's current Paying Account (moving a reservation there). Into a card, the only envelope is that card's own Card Payment (paying it), from any account of its visibility. Money out of a Card Payment is allowed from any account, like allocations. Why: #72 pays from a non-default account after moving the reservation there, and the reservation-move transfer (2026-10-11 decision) lands where the bill is paid from. Revisit: #72, if paying needs another shape.
- **The Add transfer UI offers no card destinations and no Card Payment envelopes**; #72 adds the Pay card action on top of `addTransfer`. Editing a transfer #72 made keeps its card and Card Payment as choices.
- **An edit re-checks only what changed**, like transactions: changed accounts must be in use, of the transfer's visibility and not a card on the from side; a changed envelope (or accounts) must fit. An unchanged edit appends nothing. A retired account or category the transfer already has stays editable.
- **Transfer is a third direction in the Add transaction dialog** (Expense, Income, Transfer), swapping to the transfer form and back; the amount typed so far follows the switch. On wide dialogs the amount and the three choices each take a full row.
- **A new entry focuses its amount itself** (`useFocusNewEntry`). Why: the dialog's own first-field focus ran before the form had loaded its choices, so it landed on Close; `transactions.spec.ts`'s `toBeFocused` failed on main too in this environment, and the form switch needs it anyway.
- **List rows:** a transfer shows "BPI → GCash" (or its description, with the path beneath), the envelope, a transfer icon, and an unsigned muted amount; under an account filter it's minus (from) or plus (to). The category filter matches its envelope (Unassigned or a category; a Card Payment transfer matches no category). Search covers its description, notes and amount. The count line reads "N transactions, M transfers (not in the totals)".
- **Bulk status and Remove split the selection** into transactions and transfers and run each kind's commands (`changeEach` moved to `commands/bulk.ts`, generic over the record); Change category acts on the transactions only and is disabled when only transfers are selected. Toasts name the kinds ("2 transactions and 1 transfer").
- **Shared helpers:** `isAmount` / `AMOUNT_PROBLEM` / `optionalText` in `transactions/events.ts` (the amount check was copied in transactions and allocations); `requireCardFor` and `refusePaidElsewhere` moved to `commands/records.ts`; `decodeEnvelope` exported.
- **Review fixes:** the entry form's direction reuses `ListType` / `isListType` (no second `Direction` type); `isAmount` / `AMOUNT_PROBLEM` live in `currency.ts` beside `MAX_AMOUNT_CENTS`; the list names mixed rows `rows` / `openRow`; account names are mapped once per render; the transfer form's direction choice is built once; a new From starts To over, so an earlier To doesn't come back unseen; the money tests gain a duplicate transfer and the per-account Groceries split.
- **Review: a transfer into a card, or a Card Payment between accounts, may come from any account of its visibility**, not only one holding the reservation, so the from side's Card Payment can go negative (shown red, like an overspent envelope). Kept: #72's pay-from-another-account flow writes its allocations first, two offline devices can't be stopped from both drawing a reservation, and allocations already allow drawing any Card Payment. Revisit: #72, if a lone pay-card transfer from a non-paying account should be refused.
- **Review deferral: list rows are told apart by a field (`"fromAccountId" in row`)**, not a `kind` tag. Revisit: if a transaction ever gains a from account, or a third row kind joins the list.
- **Review deferral: the list-row helpers (`ListRow`, `isTransfer`, `newestFirst`, `transferDirection`) sit in `transactions/filter.ts`.** Revisit: #74 (the ledger lists transactions, transfers and allocations), move them to their own module then.
- **Known, not mine:** `transactions.spec.ts` fails on Mobile Chrome (on main it fails earlier, at the focus check; past that it clicks the row's Remove icon, which #53 hides on phones). Logged in CLAUDE.md. Chromium passes.

## Milestone 2

Spec: #46. Scoped 2026-10-12 (decisions above, dated 2026-10-11 and 2026-10-12). Order follows the blocking edges.

- [x] #47 Projection registry
- [x] #48 Categories and groups
- [x] #49 Transactions core
- [x] #50 Card Payment reservation
- [x] #51 Allocations and the Categories screen
- [x] #52 Transaction list: virtualized, filters, totals, search
- [x] #53 Transaction list actions: bulk, swipe, detail pane (blocked by #52)
- [x] Close #46

## Issue #53: transaction list actions

Seams (from #46's Testing Decisions): the bulk commands (Vitest), one Playwright bulk mark-cleared flow on chromium. Swipe is checked by hand on Mobile Chrome (throwaway spec), not a new seam.

- [x] Bulk commands: status, category, remove, restore; one event per changed transaction through the existing commands; unchanged ones append nothing; per-transaction failures reported, not thrown
- [x] Multi-select: row checkboxes, select all shown, a toolbar with Mark cleared, Mark pending, Change category, Remove (one Undo restores all)
- [x] Swipe on phones: right toggles cleared, left removes with Undo; keyboard and screen-reader equivalents
- [x] Filters collapse behind a button on phones (#52 deferral)
- [x] Detail pane from `@[1100px]` (PageShell `rail`), editing in place; below it the dialog; the list keeps its scroll position
- [x] Playwright (chromium): bulk mark cleared, and the pane keeps the list's place at 1600 px
- [x] Layout baselines (chromium, Mobile Chrome): `/transactions` desktop and ultrawide regenerated (empty state now in the `rail` shell, header aligned with it); laptop, home and settings unchanged
- [x] build, lint, vitest (42 files / 3849), both tsc, knip, size (297.2 KB gz); chromium smoke + list + card-payment 17/17 (one `household.spec.ts` flake in the first run, passed alone and on re-run)
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #53 decisions

- **A bulk action skips transactions already in the target state.** Why: re-sending a status or category carries a later HLC and would undo another device's change (the #49 unchanged-edit rule).
- **A bulk action acts on the selected transactions still shown**; the selection is component state, cleared after an action.
- **Change category offers only categories that fit every selected transaction's account** (plus Unassigned); a transaction the command still refuses is reported in the toast and the rest are changed.
- **The pane's open transaction lives in component state, not the URL.** Why: a router navigation resets scroll, and the list uses the window scroller.
- **Pane vs dialog is decided by whether the pane is laid out** (ResizeObserver on the aside), so the `@[1100px]` breakpoint lives only in CSS.
- **Phones hide the row's remove icon**; swipe left, the dialog's Remove and bulk Remove replace it. The status button stays at every width as the keyboard and screen-reader equivalent of swipe right.
- **Swipe is touch and pen only**; a mouse drag stays a click or text selection.
- **Gotcha: Sonner toasts sit over the bottom rows on a phone and swipe themselves**, so a swipe spec must wait for toasts to clear first.
- **Transactions uses `rail`, not the layout design's `triple`.** Why: the filters stay above the list (#52), so there is one aside, the pane. Revisit: if the filters move into a side column.
- **The pane shows the edit form only**: no history, and a hint when nothing is open, not the design's filter summary (the totals are already above the list). Revisit: when event history gets a screen.
- **Review fixes:** PageShell back in the route, with the list returning its slots and the page header aligned with the rail; a filter change clears the selection; swipe waits for an in-flight toggle; a bulk action that changes nothing says so, and one where every row fails keeps the selection; the four bulk commands share `changeEach`; `countOf` moved to `lib/utils`.
- **Review deferral: each bulk item reads its transaction twice** (once to skip unchanged ones, once inside the single command). Revisit: if bulk actions on thousands of rows feel slow.
- **No layout baseline shows the pane, toolbar or swipe row**, since the seeded user has no transactions; the pane is covered by the 1600 px e2e test instead. Revisit: with #52's empty-state deferral, if the seed gains transactions. Agreed 2026-10-12.
- **Swipe has no unit seam**; it's checked by hand on Mobile Chrome. Why: the M2 seams were agreed without it, and the ticket runs unattended. Revisit: if swipe regresses.

## Issue #51: allocations and the Categories screen

Seams (from #46's Testing Decisions and the issue's acceptance criteria): the allocation projection and the read-time envelope sums through `receiveEvents` (Vitest; permutations, duplicates, the balance = Unassigned + category money + Card Payments invariant after every permutation), the commands (Vitest). A Playwright demo flow on chromium to see the screen.

- [x] Shared `permutations` test helper (resolves the #49 review deferral)
- [x] Allocation events, decoder and projection (details and removal resolve apart); registered; Dexie v7 table
- [x] Read-time sums apply allocations; category money summed across accounts with a per-account breakdown; invariant after every permutation; 10,000-transaction timing guard covers the screen's sums
- [x] Commands: add, edit, remove, restore; refuse retired accounts, retired destinations, envelopes of another visibility or owner; overspending doesn't block
- [x] Categories screen: money per group and category (expandable per account), each account's Unassigned and Card Payments, negatives in red with a label, "Retired, still holding money"
- [x] Move money dialog with an overspend warning; allocations list with edit and remove (Undo)
- [x] Playwright: the issue's demo (chromium)
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #51 decisions

- **Four event types**: `allocation.created` / `allocation.edited` (details: date, account, from, to, amount) and `allocation.removed` / `allocation.restored`; details and removal resolve by their own latest HLC, like transactions.
- **From and to are a tagged envelope** (`unassigned`, `category` with an ID, `card_payment` with a card ID); a move between the same envelope is refused by the decoder, so it never projects.
- **Money can move out of a retired category or card, never into one** (as the destination; an allocation already naming it stays editable). Why: emptying a retired envelope needs a move out of it.
- **Allocations happen only in accounts with envelopes**: a card account is refused by the command and ignored by the sums. Money goes into a Card Payment only in the card's current Paying Account (the issue's "its cards' Card Payments"); it comes out of any Card Payment of the account's visibility, so a reservation left behind when the card's default changed can be moved out.
- **A negative category shows red with "Spent more than it holds"**; negative Unassigned uses the agreed "Allocated more than this account has". The label sits on its own line beneath the row, so names don't truncate on phones. Card Payments and group totals show red without a label. The issue's single label didn't fit an overspent category. Agreed 2026-10-12.
- **The overspend warning is live in the dialog** whenever the source envelope (Unassigned or any other) would go negative, discounting the edited allocation's own earlier move. It never blocks.
- **"Retired, still holding money" lists retired categories with non-zero money** in any account, beside the existing Retired toggle (which still offers Unretire).
- **The Unassigned card lists accounts in use, plus retired accounts still holding Unassigned or Card Payment money** (badged Retired), like "Retired, still holding money" for categories.
- **Allocations are listed in an "Allocations" card** on the Categories screen, all of them, newest first, each editable (Remove with Undo in the dialog). Revisit: paginate if the list grows long.
- **Account and category checks shared by transactions and allocations** moved to `src/lib/commands/records.ts`; the `permutations`/`orders` test helper to `src/test/permutations.ts` (resolves the #49 deferral).
- **Review fixes:** the record is called an allocation in every label ("move" is the glossary's avoided word for Transfer; "Move money" stays as the action); an edit can't put more money into a retired destination (only lower the amount); a removed allocation can't be edited; `moneyIn` lives beside `Envelopes` in `lib/transactions/money.ts`; the money permutation test permutes the creates and a restore under the invariant.
- **Review: restoring an allocation re-checks nothing**, so Undo after its destination was retired puts the money back there. Kept: a restore undoes a removal, like transactions, and "existing ones stay editable and removable" (2026-10-11). Agreed 2026-10-12.
- **Review: the timing guard measures the sums, not the Dexie reads.** Kept: fake-indexeddb read time doesn't represent a browser, and the agreed guard is on summing at read time (2026-10-12).
- **Review deferral: `envelope.kind` is switched on in four places** (`moneyIn`, `addToAllocated`, `envelopeLabel`, `envelopeKey`). Revisit: if a fourth envelope kind is added.
- **The 10,000-transaction timing guard now covers the screen**: 10,000 transactions plus 500 allocations, summed and pivoted by category (about 3 ms locally; one run under parallel load failed the 50 ms limit once and passed on every rerun).

## Issue #52: transaction list

Seams (from the issue's acceptance criteria): filtering, search and totals as a pure module (`src/lib/transactions/filter.ts`, Vitest), one Playwright filter-totals flow on chromium.

- [x] Pure filter: month, account, category (or Unassigned), type, status, Needs a category; combined
- [x] Search: description and notes, plus the exact amount for a numeric query; 10,000-row timing guard (under 50 ms)
- [x] Totals (income, expenses, net) via `sumCents` / `diffCents`
- [x] Filters in the URL (`validateSearch`); the uncategorized-expense count links to its filter
- [x] TanStack Virtual reinstalled; window virtualizer
- [x] Playwright (chromium): filter totals, search 250, the Needs a category link
- [x] 10,000 rows checked by hand (throwaway spec, chromium and Mobile Chrome): 10 to 20 rows in the DOM, scroll frames median 16.7 ms, p95 under 18 ms
- [x] Layout baselines: `/transactions` added (chromium, Mobile Chrome); home and settings unchanged
- [x] build, lint, vitest, both tsc, knip, size (297.0 KB gz)
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #52 decisions

- **Filters live in the URL search params**, read by `readTransactionFilter`, which drops anything unusable (a stale link shows everything). Why: the uncategorized count is a plain link to its filter, and a reload or Back keeps the view. Filter changes replace the history entry.
- **Month defaults to all months**; its choices are this month plus the months holding transactions, newest first.
- **A numeric search matches the amount or the text** (OR), so "250" also finds "Room 250". Only a whole number-like query counts as an amount ("₱1,250.50" yes, "250abc" no).
- **The Needs a category count covers every transaction**, not just the filtered ones, and its link replaces the other filters.
- **Deferral: on phones the filters fill the first screen** before any row. Revisit: #53 (it reworks the phone row with swipe actions); collapse the filters behind a button then.
- **Deferral: the transactions layout baseline shows the empty state**, since the shared seeded user has no transactions. Revisit: if the seed gains transactions.
- **Review fixes:** the search box keeps its own text and only resets when the URL's query is cleared (it had snapped back to the lagging URL after each keystroke; the e2e now types key by key); a stable `getItemKey`, so the virtualizer keeps its measured offsets; this month is always a choice; "₱ 250" and "250." count as amounts; a `countOf` label helper; accounts passed as one list; clearer predicate names; rows render `TransactionItem` directly.
- **Review: kept the 50 ms filter timing guard**, matching the money test's budget. Revisit: if CI flakes on it.

## Issue #50: Card Payment reservation

Seams (from #46's Testing Decisions and the issue's acceptance criteria): the read-time sums through `receiveEvents` (Vitest; the balance = Unassigned + category money + Card Payments invariant after every permutation, with purchases, refunds, an uncategorized purchase, a moved transaction and a removed one), the commands (Vitest), one two-browser Playwright demo on chromium.

- [x] `transaction.created` / `transaction.edited` v2 carry the Paying Account; v1 upcaster in `TRANSACTION_VERSIONS`; projection stores it
- [x] Commands record the card's current Paying Account on add, and re-record it when an edit moves the transaction onto or off a card; an unchanged edit still appends nothing
- [x] Read-time sums: card transactions move category money (or Unassigned) into the card's Card Payment in the recorded Paying Account; a card's starting amount owed reserves nothing; invariant after every permutation
- [x] Changing a card's default Paying Account leaves existing reservations in place (Vitest)
- [x] Accounts card shows each Card Payment under its Paying Account
- [x] Playwright (chromium, two browsers): A records a ₱1,200 Restaurants card purchase offline and reconnects; B shows the amount owed, the unchanged balance and the Card Payment
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #50 decisions

- **Device B shows the Card Payment on the Accounts card** ("Card Payment · Visa ₱1,200.00" under the Paying Account). The category's drop is checked in Vitest, not on screen. Revisit: #51 (the Categories screen shows category money per account). Agreed 2026-10-12.
- **`payingAccountId` is part of the transaction's details**, so it resolves with them by latest HLC. The command fills it in, never the form: from the card on add, and from the new account when an edit changes the account; otherwise the edit keeps the recorded one.
- **v1 transaction events upcast to no Paying Account**, so they reserve nothing. There is no production data, so no v1 card transactions exist.
- **A card transaction reserves nothing when its recorded Paying Account isn't on this device or is itself a card**; the card's amount owed still moves.
- **The Accounts card hides a Card Payment of ₱0.00** and shows a negative one in red.
- **A card not yet on this device is named "A card"** in its Card Payment line.
- **Review deferral: each account row runs its own money and name live queries** (`useAccountMoney`, `useAccountNames`), the #49 idiom. Revisit: if the Accounts card slows with many accounts (hoist both to `AccountsCard`).
- **Review fixes:** `isOptionalId` shared by the category and Paying Account checks; `chooseOption` moved to the e2e helpers; the permutation adds uncategorized card income and a move off a card; a v1 card transaction is tested to reserve nothing.
- **Review deferral: `editTransaction` sets the new Paying Account after the unchanged-details check**; safe, since a changed account never matches. Revisit: if the edit path grows.

## Issue #49: transactions core

Seams (from #46's Testing Decisions and the issue's acceptance criteria): the transaction projection and the read-time account sums through `receiveEvents` (Vitest; permutations, duplicates, the balance = Unassigned + category money invariant after every permutation), the commands (Vitest), one Playwright demo flow on chromium.

- [x] `formatPHPInput` currency helper for prefilled amounts; the account form uses it
- [x] Transaction events, decoder and projection (details, status, removal resolve apart); registered; Dexie v6 table
- [x] Read-time account money: balance, Cleared and Pending, Unassigned and category money per account; invariant after every permutation; 10,000-transaction timing guard
- [x] Commands: add, edit, set status, remove, restore; refuse retired account/category and visibility or owner mismatch
- [x] Quick entry: Add transaction button (floating on phones, header on wide screens), `n`, prefilled with today, last-used account and category, cleared
- [x] `/transactions` basic list in the sidebar, tab bar and drawer; edit, toggle status, remove with Undo
- [x] Accounts card shows balance, Cleared · Pending and Unassigned
- [x] Playwright: offline expense and income move balance, Groceries and Unassigned (chromium)
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #49 decisions

- **Six event types**: `transaction.created` (details plus status), `transaction.edited` (details), `transaction.marked_cleared` / `transaction.marked_pending`, `transaction.removed` / `transaction.restored`. Details, status and removal each resolve by their own latest HLC, like accounts' details vs retirement.
- **The direction field is `type: "income" | "expense"`**, as CLAUDE.md's money rule names it; the UI says Expense and Income.
- **A removed transaction stays in the projection with `removed: true`**, so a restore brings back its latest details and status; reads leave it out.
- **Unassigned is summed directly** (starting balance plus uncategorized transactions), not as balance minus category money, so the invariant test checks two independent sums. Allocations (#51) add to both sides.
- **Card transactions change only the card's amount owed** in #49; a card has no Unassigned or category money of its own. #50 adds the Paying Account to the event.
- **Within a day, the newest recorded transaction lists first** (date descending, then create HLC descending), matching newest-first. Revisit: if members expect entry order within a day. Agreed 2026-10-12.
- **Last-used account and category come from a small persisted Zustand store**, written when a transaction is added; a stale ID (retired or gone) falls back to the first choice.
- **Choosing Income in a new transaction resets the category to Unassigned** (income lands in Unassigned unless named, 2026-10-11), overriding the last-used category. Revisit: if refunds are common enough that members want the last category kept. Agreed 2026-10-12.
- **The wide-screen header now shows at every wide width**, holding the Add transaction button; the sidebar trigger and page title stay hidden from `lg`. Desktop layout baselines were regenerated (they were already stale from #48's Categories nav item). Agreed 2026-10-12 (the issue asks for a header button).
- **`g t` goes to Transactions**, like `g c` for Categories.
- **Review fix: an edit with unchanged details appends nothing.** Why: the dialog sends the details with every save, so marking a transaction pending would re-stamp stale details with a later HLC and undo another device's amount edit. Covered by a command test.
- **Review fixes:** `sameOwnership` lives beside `Ownership` in `lib/events/log` and `canHoldMoneyIn` beside `canHold`, shared by the command and the dialog; `editTransaction` reads the account once; the list maps status and type to their display once; edit-path tests for a retired category and a category of another visibility.
- **Review deferral: a category's money per account isn't shown yet**, so the demo's "Groceries goes to −₱250" is checked by the Vitest sums, not on screen. Revisit: #51 (the Categories screen shows money per account). Agreed 2026-10-12.
- **Review deferral: the edit dialog saves details and status as two events**; if the second append fails, the details are kept and the form shows the error. Revisit: if it happens in use.
- **Review deferral: four test files carry their own `permutations` helper.** Revisit: at the next entity (#51 allocations), extract a shared test helper.

## Issue #48: categories and groups

Seams (from #46's Testing Decisions and the issue's acceptance criteria): category and group projections through `receiveEvents` and the read functions (Vitest; permutations and duplicates), the commands (Vitest), one Playwright demo flow on chromium.

- [x] Version lookup bound to each entity's own table (resolves the #47 review deferral)
- [x] Group and category events, decoders and projections; registered; Dexie v5 tables
- [x] Deterministic default IDs; seeding on two devices gives one set (permutation and duplicate tests)
- [x] Commands: add, rename, move, retire and unretire; group retires only once its categories are; seed defaults
- [x] `/categories` route in the sidebar, tab bar and drawer; empty state offers the defaults; Retired section
- [x] Playwright: seed defaults, add a Personal group and category (chromium)
- [x] build, lint, vitest, both tsc, knip
- [x] Code review (standards + spec), fixes applied
- [x] Commit

### #48 decisions

- **Rename and move are separate events**, so a rename on one device and a move on another both survive; each resolves by latest HLC, like accounts' details vs retirement.
- **A category takes its group's visibility and owner**: choosing the group is choosing Household or Personal, so a mismatch can't be created. Moves stay within the same visibility and owner. A group's visibility is chosen when it is added (Household by default).
- **The earliest create fixes a category or group, and later creates of the same ID are ignored** (accounts let a later create act as an edit). Why: seeded defaults share IDs across devices, so a second device's seed must not undo a rename or move made after the first.
- **Seeded IDs are UUIDv5 of the household ID and a fixed key** (`default-group:food`, `default-category:groceries`); event IDs stay random. The server's duplicate-ignoring insert is per event ID, so the two seeds' events both land and the projection collapses them.
- **A category's group resolves at read time**, like a card's Paying Account: a category whose group isn't on this device yet, or doesn't share its visibility and owner, is listed as Ungrouped.
- **Retire blocks are local**, like accounts': a group retires only once its categories are retired; a category can't be added to, moved into or unretired in a retired group. Two offline devices can still leave an active category in a retired group; the group stays listed, marked retired.
- **Groups and categories list by name**, like accounts. The default order in the plan isn't kept. Revisit: if members ask to reorder.
- **The defaults are offered while this device holds no Household group**, retired ones included.
- **Commands stamp events through `appenderFor(entityType, versions)`** (`src/lib/commands/append.ts`), and `currentVersion` takes only its table's own event types, so pairing an event with another entity's table no longer compiles. Accounts moved onto it. Resolves the #47 review deferral.
- **The Household/Personal radio is one `VisibilityField`**, shared by the account and group forms.
- **The drawer lists Categories above Settings**; the tab bar has Home, Categories, Settings.
- **Deferred: "Retired, still holding money"**. A retired category is listed under Retired with no amount, since categories hold no money until transactions and allocations land. Revisit: #51 (allocations and the Categories screen).
- **Review: the default group "Personal" (a Household group) sits beside "Personal" visibility badges.** Kept: the default list was agreed 2026-10-12. Revisit: if members confuse the two.
- **Review: a new member's device offers the defaults until its first pull brings the household's groups**, so seeding then adds defaults the household never chose (deterministic IDs keep it to one set). Kept: gating on a first pull would hide the button forever in a new household with no events. Revisit: if it happens in use.
- **Review fixes:** `g c` navigates and the tablet header names the page; `Ownership` moved beside `Visibility` in `lib/events/log`; the appender takes the record (ID plus ownership) as one argument; the glossary's Retired covers groups and categories; the ownership test is a permutation test.
- **Review deferral: the try/toast transition shape repeats** in the retire, unretire and seed actions. Revisit: at a fourth copy.
- **Worktrees need `.env.local` copied from the main checkout** (gitignored): without it the build has no Supabase URL and every E2E test sees a blank page.

## Issue #47: projection registry

- [x] Version table type, `currentVersion` and `upcast` in `src/lib/events/versions.ts`
- [x] Registry in `src/lib/events/projector.ts`: table, versions, creation check, fold, description; it upcasts, sorts by HLC, folds, and puts or deletes the row
- [x] Accounts register through it; `log.ts` takes its transaction tables and household-switch wipe from it
- [x] Fake second entity test (`projector.test.ts`): projects, upcasts, skips unknown versions, describes, discards, wipes on switch

### #47 decisions

- **Seams were taken from the issue's acceptance criteria** (a fake entity driven through `log.ts`, plus the existing account tests), as in #19, #23 and #24.
- **The registry upcasts before the fold and the description**, so an entity's decoders only see current-version payloads and can't forget to upcast. An unknown version is left out of the fold and described from its type and the current row. The version tables stay with their entity (`ACCOUNT_VERSIONS`); the type and `upcast` live in `lib/events`.
- **The household-switch wipe is generic**: every registered row carries `householdId` and `visibility`, so the registry deletes other households' Household rows from each table. Revisit: an entity whose rows don't carry visibility. Agreed 2026-10-12.
- **Entities are registered in `projector.ts`** (one line each), not by side effect on import, so the registry is never empty when the log receives events. Tests can register more.
- **Review deferral: commands pair a version table with an event type by hand** (`currentVersion(ACCOUNT_VERSIONS, eventType)`), so a new entity could pass the wrong table. Revisit: #48, when the second real entity lands (bind the lookup to the entity). Agreed 2026-10-12.
- **Each entity keeps its version table in its own `events.ts`** (`ACCOUNT_VERSIONS`); only the type and `upcast` live in `lib/events`. Why: upcasters are payload knowledge, which CLAUDE.md and the lint config place in `src/lib/*/events.ts`; a central table would mean editing `lib/events` for every entity and import cycles with each entity's constants. The #47 acceptance line was reworded to match. Agreed 2026-10-12.
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
- Milestone 2 scoped 2026-10-12: spec #46, sub-issues #47-#53 (`ready-for-agent`), ADR 0005.
- #47 merged (PR #56, ca6bba3). #48 merged (PR #57, 22a23d5). #49 merged (PR #58, 0593a29). #50 merged (PR #60, dcf7044). #52 merged (PR #62, efc7c46). #51 merged (PR #64, 791b302). #53 merged (PR #66, 2c28b78). Their worktrees and local branches are removed.
- #46 closed 2026-10-12. The `household.spec.ts` Owner-badge flake fixed (PR #68).
- Milestone 3 scoped 2026-10-12: spec #70, sub-issues #71-#77 (`ready-for-agent`, native blocked-by edges), ADRs 0006 and 0007, glossary Transfer, Budget and Funding Account. Export modes deferred to #69 (`needs-triage`).
- #71 merged (PR #79, 734017b). #73 merged (PR #80, 0becd82); merging it after #71 needed transfers in the month-end money (a type error caught it). Their worktrees and local branches are removed. Follow-up #81 (`transactions.spec.ts` on Mobile Chrome).
- Pending with the user: whether Unassigned and "Retired, still holding money" should follow the month picker (default: keep current money; see the #73 decisions).
- Round 2 merged: #74 (PR #85), #76 (PR #84), #72 (PR #86), #75 (PR #87). #77 merged (PR #89, f1eb4c2). Their worktrees and local branches are removed.
- #70 closed 2026-10-13: Milestone 3 is complete. Follow-ups: #83 (move `envelopeLabel`; merged), #88 (Distribute empty state when the source holds no categories, both modes; #92 folded in and closed; built, PR #94), #69 (export modes, after the first release; `needs-triage`).
- #83 merged (PR #93, bc59094): `envelopeLabel` now lives in `src/lib/allocations/envelope.ts`.
- Milestone 4 scoped 2026-10-13: spec #95, sub-issues #96-#99 (`ready-for-agent`, native blocked-by edges), ADR 0008, glossary Import and Import Key.
- Next: build round 1 (#96, #97). Real statements for #97 and #98 come from the user during the build. Still owed: #40's dashboard checks (human).
- Gotchas found in #71 and #73:
  - `sumAccountMoney(accounts, transactions, allocations, transfers)` takes transfers as a required fourth argument; any month or ledger sum must pass the transfers dated in range.
  - List rows are `ListRow = TransactionRow | TransferRow` (`isTransfer`, `newestFirst`, `transferDirection` in `transactions/filter.ts`); `useTransactionListRows()` replaced `useTransactions()`.
  - `addTransfer` with `envelope: { kind: "card_payment", id: card }` into the card already pays a card; the command refuses any other envelope into a card and any transfer out of one.
  - Budgets: `budgetInForce` / `budgetsInForce` (`budgets/inForce.ts`), `readMonthView` / `categoryMonth` / `sumMonthFigures` (`budgets/month.ts`); the month is the Categories route's `?month=yyyy-MM`. Distribute's prefill is `budget - allocated`, floored at 0, from the month view.
  - Dexie is at version 9 (8 transfers, 9 budgets).
  - Bulk actions: generic `changeEach(ids, read, isAlready, change)` in `commands/bulk.ts`.
- Gotchas found in #53:
  - Sonner toasts sit over the bottom rows on a phone and handle swipes themselves; a swipe check must wait for toasts to clear.
  - `/transactions` is `rail`: `TransactionList` returns `PageShell.Main` and `PageShell.RightAside` slots, and the page header shares the shell's `@[1100px]` breakpoint so the two stay aligned.
  - The layout baselines use the seeded user's empty state, so the 2% pixel tolerance hides small shell changes; regenerate with `--update-snapshots=all` and look at the image.
  - Bulk commands (`setTransactionsStatus`, `changeTransactionsCategory`, `removeTransactions`, `restoreTransactions`) skip rows already as asked and return `{ changed, failed }`; reuse `changeEach` for future bulk actions.
- Gotchas found in #51:
  - Sub-issues built in parallel each add a section under Milestone 2 here, so the second PR to merge conflicts in this file; keep both sections, newest first.
  - Move money's selects name each option with its amount ("Groceries · ₱0.00"), so e2e picks options by that full name.
  - `sumAccountMoney` takes allocations as a third argument; `sumCategoryMoney` pivots its result per category, and `moneyIn` reads one envelope.
- Gotchas found in #52:
  - Filters live in the route's search params (`readTransactionFilter`); #53's selection and detail pane can add params the same way.
  - The search box keeps its own text and resyncs only when the URL query is cleared; don't drive it from `useSearch` directly (the URL lags a render).
  - #53 owes: collapsing the filters on phones (they fill the first screen), alongside the swipe row.
- Gotchas found in #50:
  - A device that logs in right after another device writes may pull before the push lands; two-browser specs reconnect it until the item shows (`pullUntil` in `tests/e2e/card-payment.spec.ts`).
  - A card's row on the Accounts card names its Paying Account, so match account rows by their leading name, not `hasText: name`.
  - `chooseOption(page, field, option)` lives in `tests/e2e/fixtures/helpers.ts`.
  - #51 owes: category money per account on screen (the #50 demo's Restaurants drop), and the shared `permutations` test helper (#49 deferral). Allocations add to the Card Payment envelopes in `sumAccountMoney` (`cardPayments`).
- Gotchas found in #49:
  - A new route fails `tsc -b` until the route tree is regenerated: run `npx vite build` (the router plugin rewrites `src/routeTree.gen.ts`), then type-check.
  - Shell changes move the laptop/desktop layout baselines; open the `*-diff.png` before `--update-snapshots`. There is no phone baseline, so check phone layout with a screenshot.
  - #50 adds the Paying Account to `transaction.created` and `transaction.edited` as v2 with a v1 upcaster (`src/lib/transactions/events.ts`); `sumAccountMoney` (`src/lib/transactions/money.ts`) gives cards `envelopes: null` today.
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
