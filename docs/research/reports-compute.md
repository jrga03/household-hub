# Reports: compute on read or keep a monthly projection

Research for [#269](https://github.com/jrga03/household-hub/issues/269) (map [#256](https://github.com/jrga03/household-hub/issues/256)). Date: 2026-10-29.

## Question

Can Reports compute net spending per category per month on read from the local Dexie transactions, as `src/lib/budgets/month.ts` does for one month, within the performance budget for 10,000 transactions over a Year period (12 months, the previous 12 for a change figure, and a sparkline per category)? Or does it need a monthly projection kept by `src/lib/events/projector.ts`?

## Recommendation

Compute on read. Read the transactions once, fold them in one pass into a month-by-category grid, and derive every period, the change figure and the sparklines from that grid in memory.

The fold is not the cost: it takes 0.6 ms for 10,000 transactions in Chromium unthrottled and 4 ms at 6x CPU throttling. The Dexie read is the cost (40 ms median unthrottled, 89 ms median and 145 ms p95 at 6x), and a projection would not remove it, because the detail pane lists the transactions behind a category, so Reports reads them anyway. Budget, Home and Transactions already read the whole transactions table in a `useLiveQuery` on every write (`readMoneyRecords`, `listTransactions`), so Reports pays no more than screens that ship today.

A monthly projection would add a Dexie version, a delta-maintained table with a drift risk on every write path, and a permutation test, to save part of a read that stays. Not worth it at 10,000.

Revisit when a household holds about 30,000 local transactions or more, or when a real phone shows the Reports read over 100 ms p95. The first step then is an index range read of only the months shown (it only helps once history runs past the 24 months a Year needs), not a projection.

## What exists today

- **Month figures.** `summarizeMonth` in `src/lib/budgets/month.ts` loops every transaction, skips `removed`, Unassigned (`categoryId === null`) and other months, and adds expenses and subtracts income per category. It is pure; `readMonthView` feeds it `readMoneyRecords()` (`src/lib/transactions/money.ts`), which `toArray()`s five whole tables: accounts, transactions, allocations, transfers, balance corrections.
- **Who reads this way already.** `useMonthView` (`src/hooks/useBudgets.ts`), `useFinanceOverview` (Home, `src/lib/finances/overview.ts`), `readAccountMoney` and `listTransactions` (`src/hooks/useTransactions.ts`) all read whole tables in `useLiveQuery`, so they rerun on every local write or synced event.
- **What Reports must leave out comes free.** Transfers live in `db.transfers` and Balance Corrections in `db.balanceCorrections`, not in `db.transactions`, so a fold over transactions never sees them. A card purchase is a transaction dated on its own date (`TransactionDetails.date`, `src/lib/transactions/events.ts`); paying the card is a transfer.
- **Household / Mine.** `shownIn` in `src/lib/finances/overview.ts`: Household is `visibility === "household"`; Mine is `visibility === "personal" && ownerUserId === me`.
- **Dexie indexes** (`src/lib/dexie/db.ts`, version 12): `transactions: "id, [date+recordedHlc]"`, the same compound index on allocations, transfers and balance corrections, `events: "id, [pushState+hlc], entityId"`. No index on `categoryId` or month.
- **Projector** (`src/lib/events/projector.ts`): one row per entity, rebuilt from that entity's whole event history sorted by HLC (`project(entityId, history)`), then `put` or `delete`. There is no hook for derived tables; nothing aggregates across entities.

## Method

Two throwaway benchmarks, both on this branch only, both seeding the same shape of data: 10,000 transaction rows over 24 months (2024-11 to 2026-10), 40 categories, 90% expenses and 10% income, 5% Unassigned, 3% removed, 70% Household and 30% Personal split between two members, descriptions about 50 characters, 20% with notes. Rows are seeded straight into the projection table (`bulkPut`), as the projector would leave them. 5 warm-up runs, then 40 timed runs; median, p95 and max from the sorted samples.

1. **Chromium on real IndexedDB** (`scripts/reports-compute-bench.mjs`). Headless Chromium from Playwright 1.64.1, Dexie 4 loaded from `node_modules/dexie/dist/dexie.js`, CPU throttled through the DevTools protocol (`Emulation.setCPUThrottlingRate`) at 1x, 4x and 6x. This is the closer to reality: real IndexedDB, real structured-clone cost, the browser's own scheduler. 4x and 6x stand in for a mid-range and a low-end phone; throttling slows the page's main thread, not the browser's storage process, so it models a phone only roughly.
2. **Vitest with fake-indexeddb** (`src/lib/reports/compute.research.test.ts`, node project). It runs the repo's own `db`, `readMoneyRecords` and `[date+recordedHlc]` index, which the browser script redefines. fake-indexeddb is a JavaScript IndexedDB, so its read times say little about a browser; the compute times are the useful part.

Machine: Apple M2 Max, 12 cores, Node 26.12.1.

The fold is `summarizeReport` in both files: one pass that keys each kept transaction by category (Unassigned apart) and month index into a 24-slot array, then totals the last 12 slots (the period) and the first 12 (the previous period), and keeps the last 12 as the sparkline, ranked by spending.

## Results

Chromium, real IndexedDB, milliseconds:

| Step                                  | 1x median | 1x p95   | 4x median | 4x p95   | 6x median | 6x p95    |
| ------------------------------------- | --------- | -------- | --------- | -------- | --------- | --------- |
| `transactions.toArray()` (10,000)     | 39.4      | 42.7     | 66.3      | 137.2    | 84.5      | 196.2     |
| Index range, 24 months                | 46.8      | 50.0     | 72.8      | 140.0    | 92.3      | 146.7     |
| Fold only (Household, Year)           | 0.6       | 0.8      | 2.6       | 3.3      | 4.0       | 4.9       |
| **Year end to end: `toArray` + fold** | **40.1**  | **42.9** | **68.4**  | **97.7** | **88.8**  | **145.0** |
| Year end to end: index range + fold   | 48.1      | 51.3     | 76.1      | 96.1     | 96.2      | 146.5     |
| Month end to end: index range + fold  | 4.2       | 5.2      | 7.2       | 16.0     | 9.4       | 10.4      |

Vitest, fake-indexeddb, milliseconds (no throttling):

| Step                                                                        | Median | p95  |
| --------------------------------------------------------------------------- | ------ | ---- |
| `transactions.toArray()` (10,000)                                           | 21.8   | 23.7 |
| Index range, 24 months                                                      | 37.0   | 40.1 |
| `readMoneyRecords()` (5 tables, plus 2,000 allocations and 1,000 transfers) | 29.3   | 33.1 |
| Fold, Household                                                             | 0.78   | 0.85 |
| Fold, Mine                                                                  | 0.35   | 0.40 |
| The `month.ts` pattern repeated: one pass per month, 24 passes              | 4.89   | 5.15 |
| Year end to end: `toArray` + fold                                           | 23.8   | 26.2 |

What the numbers say:

- **The read is over 95% of the cost; the fold is noise.** Even 24 separate passes in the `month.ts` style cost 5 ms, so reusing that shape would work, but one pass is simpler and cheaper.
- **Against the budget.** `docs/initial plan/PERFORMANCE-BUDGET.md` sets responsiveness targets (input delay under 100 ms, good under 50 ms) and no data-read target. The read is asynchronous, so most of it does not block input; the fold, the only certain main-thread work, stays under 5 ms even at 6x. End-to-end latency is 40 ms on a desktop, about 68 ms median and 98 ms p95 at 4x, and 89 ms median with a 145 ms p95 at 6x. That is a figure appearing a little later after a write on a slow phone, not a frozen screen.
- **An index range read does not help a Year at this size.** With 24 months seeded, the range covers every row and walks the index, so it is slower than `getAll`. It pays off only when history is longer than the period plus the previous period; Month already shows it: 4 ms against 40.
- **Mine is cheaper than Household**, since fewer rows pass the filter.

## What a monthly projection would cost

A table such as `monthlySpending`, one row per month, category (or Unassigned) and ownership (`visibility`, `ownerUserId`, `householdId`), holding net cents.

- **Dexie version 13.** A new store with a compound key, say `"[month+categoryId+visibility+ownerUserId]"`, plus an upgrade that builds it from the existing transactions table, and an upgrade test beside `src/lib/dexie/db.upgrade.test.ts`.
- **Projector change.** The registry rebuilds one entity and `put`s it; it has no notion of a table derived from another. A delta needs the transaction's row before and after, so either `EntityProjection` grows an `afterProject(before, after)` hook, or the transaction projection reads the old row itself inside `project`. Then: subtract the old row's contribution, add the new one's. The new table must also join `projectionTableNames()` so it is in every log transaction, and `wipeProjections` (a household switch) and `resetLocalDatabase` must clear or adjust it.
- **Order independence and duplicates.** The delta is computed from transaction rows, which are already order-independent, inside the same Dexie transaction, so a late event refolds the transaction's history and the aggregate moves by the difference. A duplicate event is skipped by `receiveEvents` before projecting; if it were projected, old and new rows would be equal and the delta zero. So the design can be made order-independent, but it has to be proved: a permutation test (`src/test/permutations.ts`) over a create, an edit that moves the transaction to another month, an edit that changes its category, a removal and a restore, asserting the same aggregate rows as a fresh fold for every order, plus a duplicate-delivery case.
- **Edits that move a transaction.** A date edit moves its amount from one month's cell to another; a category edit from one category's cell to another; a type flip changes the sign; a removal takes it out and a restore puts it back. Ownership never moves (the earliest create fixes it), which keeps the key stable.
- **Ongoing risk.** A delta-maintained sum is only right if every path that writes `db.transactions` also adjusts it. A missed path drifts silently and never heals, unless a "rebuild from transactions" exists, and once it does, it is the on-read fold anyway. Any later change to what counts as spending (splits, a new type) has to change both.
- **Size estimate.** Roughly 150 to 250 lines of production code (store, upgrade, hook, delta, wipe) and 250 to 400 lines of tests (permutations, upgrade, wipe, duplicate), in a schema-touching PR. That is several times the on-read fold, which is about 40 lines plus its tests.
- **What it buys.** A Year read of at most 24 months × 41 categories × a few ownerships, so a few hundred to a few thousand small rows instead of 10,000 large ones: perhaps a 3 to 5x faster aggregate read (not measured). But the detail pane still reads the open category's transactions, so the saving is only on the list's first figures.

## Suggested shape for the on-read version

One read (say `readReportRecords`) of the transactions and categories in a `useLiveQuery`, folded into a month-by-category grid for the 24 months ending at the chosen month, with Household and Mine kept apart in the same pass. Period (Month, 3, 6, Year), change figure and sparklines are slices of that grid, computed with `useMemo`, so switching period or scope does not read again. Sum with `sumCents` / `diffCents` as `month.ts` does. Test it as `month.test.ts` tests `summarizeMonth`: it is a pure function of projection rows, so it is order-independent by construction and needs no permutation test.

## Not verified

- No real phone was measured. The 4x and 6x rows are DevTools CPU throttling on an M2 Max, which does not slow the browser's storage process, so a real low-end Android may read slower than shown.
- Safari / WebKit IndexedDB was not measured, only Chromium.
- The benchmark seeds projection rows directly and does not run the event log, so it does not time how often `useLiveQuery` reruns during a large sync pull, or Dexie's liveQuery overhead.
- The projection's read speed-up and line counts are estimates; no projection was built.
- Seed data is synthetic (uniform dates, 40 evenly used categories); a real household's skew was not modelled.
- Rendering the list and 40 sparklines was not measured; that belongs to the chart work in [the chart approach research](https://github.com/jrga03/household-hub/blob/research/reports-chart-approach/docs/research/reports-chart-approach.md).

## Decisions needed

1. Compute Reports on read with one pass over the transactions, no monthly projection. **Recommended default: yes.**
2. Read the whole transactions table (as Budget and Home do) rather than an index range for now. **Recommended default: whole table**; switch to a range read of the months shown once history passes about two years.
3. Revisit trigger for a projection: 30,000 local transactions, or a measured Reports read over 100 ms p95 on a real phone. **Recommended default: as stated.**

## Sources

- `src/lib/budgets/month.ts`, `src/lib/transactions/money.ts`, `src/lib/transactions/projection.ts`, `src/lib/transactions/events.ts`
- `src/lib/events/projector.ts`, `src/lib/events/log.ts` (`appendEvent`, `receiveEvents`, `switchHousehold`)
- `src/lib/dexie/db.ts` (version 12 stores)
- `src/lib/finances/overview.ts` (`shownIn`), `src/hooks/useBudgets.ts`, `src/hooks/useTransactions.ts`, `src/hooks/useFinanceOverview.ts`
- `src/test/permutations.ts`, `src/lib/accounts/projection.test.ts`
- `docs/initial plan/PERFORMANCE-BUDGET.md`, `GLOSSARY.md` (Spending, Reports)
- Chrome DevTools Protocol, `Emulation.setCPUThrottlingRate`: https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate
