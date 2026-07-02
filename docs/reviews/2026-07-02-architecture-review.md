# Household Hub: Architecture and Code Quality Review

**Date**: 2026-07-02
**Scope**: Full repository (295 TypeScript files, ~34,000 LOC, 15 Supabase migrations, 2 Cloudflare workers, build/test/CI configuration)
**Method**: Five parallel subsystem audits (sync engine, data layer, debts + imports, UI layer, infra + backend), each reading the relevant files in full and verifying duplication/dead-code claims via import graphs. Every High-severity finding was then independently re-verified against the source before inclusion; verified findings are marked ✓. Several key findings were discovered independently by two or three separate audits, which is noted where it applies.

---

## 1. Executive Summary

The codebase has strong bones: the schema design is careful, the currency module is genuinely excellent, transfer-exclusion discipline is consistently applied in live queries, and pockets like the PDF import pipeline are close to reference quality. The architecture documents (DATABASE.md, SYNC-ENGINE.md, DECISIONS.md) are good enough to build on.

The problem is that **the implementation and the architecture have quietly forked, and nobody has reconciled which one is real**. The most important sentence in this report is this: _Household Hub is offline-first in documentation and online-only in behavior._ Specifically:

1. **The "offline" sync queue is a network call.** `addToSyncQueue()` INSERTs into the Supabase `sync_queue` table. When the device is actually offline, the insert fails and the mutation paths **roll back the local IndexedDB write**, losing the user's transaction. The local Dexie `syncQueue` table is read by four consumers (including the logout "unsynced data" guard) but written by nothing, so those reads always see zero. Three separate audits found this independently. (SYNC-01, SYNC-02)

2. **Reads never consult Dexie.** Every list and detail view reads from Supabase via TanStack Query. All six `useOffline*` read hooks and the cache manager are dead code. A transaction created offline (if it could survive, see point 1) would never render. (DATA-01)

3. **The service worker cannot boot the app offline.** Navigations are handled by a raw network-only fetch listener, and the offline fallback lookup misses the cache because workbox stores `offline.html` under a revision-parameterized key. Reloading the PWA offline yields a network error page. (INFRA-01)

4. **The event-sourcing and conflict machinery is disconnected.** Event generation is commented out in all four core entity modules; vector clocks are minted into a local meta table that no sync payload ever reads; conflict detection compares `{}` against `{}` and always concludes "no conflict"; and the LWW tie-break compares Lamport clocks as strings, so clock 9 beats clock 10. (SYNC-05, SYNC-06, SYNC-07)

5. **Security does not yet match the privacy mission.** Transactions RLS has no household scoping and no `WITH CHECK` (authorship spoofing is possible); budgets RLS is literally `USING (true)`; a `SECURITY DEFINER` RPC that dumps all households' budget/spend data is callable with the public anon key; and a tracked file at the repo root contains the family's real bank and category reference data. (SEC-01..04, SEC-08)

6. **User-visible correctness bugs exist on the core screens.** Bulk "Mark Cleared" _toggles_ rather than sets (corrupting reconciliation state on mixed selections); deleting one leg of a transfer converts the survivor into real income/expense that pollutes every budget and analytics number; balance and analytics queries fetch unbounded row sets that PostgREST silently caps at 1,000 rows; the debt dropdown in the transaction form crashes on open (Radix `SelectItem value=""`); and the sidebar "Add Transaction" button sets state that no component reads. (DATA-02..04, UI-01, UI-02)

7. **Performance budgets are blown ~3x.** The entry chunk is 1,134 KB raw / 337 KB gzip against a stated <200 KB budget, with recharts, debug pages, and all routes eagerly bundled, while the purpose-built lazy-loading helper (`src/lib/lazy.tsx`) has zero importers. Production sourcemaps ship the full source publicly. (UI-03)

None of this is unsalvageable, and much of the fix is _deletion_: the audits identified on the order of several thousand lines of dead, duplicated, or actively harmful code (three Lamport clock implementations, two vector clock modules, two idempotency generators, two device-ID providers, three sync trigger managers, four offline banners, two install prompts, two CurrencyInputs, two CategorySelectors, two dashboards hooks, two import pipelines, two transaction CRUD stacks). Section 7 lays out a four-phase remediation plan; the first phase is roughly a week of high-leverage work.

---

## 2. Findings Index

Severity: **H** = correctness/security/data-loss risk, **M** = significant quality/perf/maintainability issue, **L** = cleanup/polish. ✓ = independently re-verified against source during synthesis.

| ID       | Sev | ✓   | Finding                                                                                                                                                                                                                          |
| -------- | --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYNC-01  | H   | ✓   | "Offline" sync queue lives in Supabase; offline mutations fail and roll back local writes                                                                                                                                        |
| SYNC-02  | H   | ✓   | Local Dexie `syncQueue` read by 4 consumers, written by none; logout wipes unsynced data                                                                                                                                         |
| SYNC-03  | H   | ✓   | Temp-ID pipeline broken end-to-end (creates ship `temp-` IDs to UUID columns; `entity_id` never remapped; mappings cleared per session)                                                                                          |
| SYNC-04  | H   | ✓   | 3 Lamport clock implementations, 2 vector clock modules, 2 idempotency generators, 2 device-ID providers, all live, all keyed differently                                                                                        |
| SYNC-05  | H   |     | Conflict detection unreachable: vector clocks never leave the device; ConflictIndicator never mounted                                                                                                                            |
| SYNC-06  | H   | ✓   | LWW tie-break compares Lamport clocks lexicographically (clock 9 beats clock 10)                                                                                                                                                 |
| SYNC-07  | H   | ✓   | Event sourcing not wired: generator imports commented out in all 4 core entity modules; compactor deletes the only copy of events                                                                                                |
| SYNC-08  | H   |     | Crash mid-sync strands queue items in `syncing` status forever                                                                                                                                                                   |
| SYNC-09  | M   |     | Retry backoff sleeps inline without retrying; MAX_RETRIES off by one vs docs                                                                                                                                                     |
| SYNC-10  | M   |     | Three overlapping sync-trigger systems on the same browser events; listener leak on auth changes                                                                                                                                 |
| SYNC-11  | M   |     | `lastSyncTime` is in-memory with a 24h fallback; second copy in localStorage; silent divergence after long offline periods                                                                                                       |
| SYNC-12  | M   |     | 3+ Supabase round trips per queue item; sync badge polls a network COUNT every 10s per mounted component                                                                                                                         |
| SYNC-13  | M   |     | `isSyncing` is a per-hook mutation flag; background syncs show "All synced"                                                                                                                                                      |
| SYNC-14  | M   |     | Clock increments are non-atomic read-modify-write despite comments claiming atomicity                                                                                                                                            |
| SYNC-15  | M   |     | Realtime `device_id=neq` filter drops NULL rows; filter uses a different device-ID module than writes (echo-loop risk)                                                                                                           |
| SYNC-16  | M   |     | SyncIssuesManager "Retry" deletes the issue and reports success; state triplicated across memory/Dexie/Zustand                                                                                                                   |
| SYNC-17  | M   |     | Event compaction non-atomic despite "CRITICAL: atomicity" comment; TOCTOU sync guard; scheduling duplicated                                                                                                                      |
| SYNC-18  | L   |     | `processQueue` swallows all errors into `{synced:0, failed:0}`; timeout doesn't cancel work                                                                                                                                      |
| SYNC-19  | L   |     | Dead files (`vector-clock-debug.ts`, `ConflictIndicator.tsx`) and JSDoc asserting properties the code doesn't have                                                                                                               |
| SYNC-20  | L   |     | `idMapping.replaceIds` only rewrites top-level string values                                                                                                                                                                     |
| DATA-01  | H   | ✓   | Split-brain: writes go to Dexie, reads come from Supabase; all 6 `useOffline*` hooks + cacheManager are dead code                                                                                                                |
| DATA-02  | H   | ✓   | Balance/analytics aggregations fetch unbounded rows; PostgREST silently caps at 1,000; dashboard runs 7 serial queries                                                                                                           |
| DATA-03  | H   | ✓   | Deleting one transfer leg converts the survivor into real income/expense (DB trigger institutionalizes it); transfer creation is non-atomic and online-only                                                                      |
| DATA-04  | H   | ✓   | Bulk "Mark Cleared/Pending" toggles instead of sets, flipping already-correct rows; 2 round trips per row (found independently by 2 audits)                                                                                      |
| DATA-05  | M   |     | Dead duplicate `useDashboardData` in `src/hooks/` queries a nonexistent `balance_cents` column                                                                                                                                   |
| DATA-06  | M   |     | Query-key hygiene: `?selected=` in the list key (full refetch per row click); prefetch poisons `["accounts"]`/`["categories"]` with a different queryFn; edit dialog fetches the whole table for one row                         |
| DATA-07  | M   |     | Float peso round-trips in charts feed non-integer cents into `formatPHP`, producing malformed strings like `"₱12,345.66.99999999998"`                                                                                            |
| DATA-08  | M   |     | Multi-step local writes lack Dexie transactions; failed-create rollback leaks an already-queued server-side create                                                                                                               |
| DATA-09  | M   |     | `database.types.ts` covers 2 of ~10 tables; Supabase client untyped; hand-rolled duplicate types and casts everywhere                                                                                                            |
| DATA-10  | M   |     | Dexie versioning repeats the full ~14-table schema in all 8 versions based on a false "Dexie requirement" comment                                                                                                                |
| DATA-11  | L   |     | Four placeholder CRUD modules that only throw; `currency.examples.ts` (379 lines) unused; branded `AmountCents` type dead                                                                                                        |
| DATA-12  | L   |     | Balance tests exercise a hand-copied function, not the shipped hook logic                                                                                                                                                        |
| DATA-13  | L   |     | `DEFAULT_HOUSEHOLD_ID` UUID literal copy-pasted in 4 modules                                                                                                                                                                     |
| DATA-14  | L   |     | Ad-hoc `(cents/100).toFixed(2)` float formatting in CSV export and debt logging                                                                                                                                                  |
| DEBT-01  | H   | ✓   | `getCurrentUserId()` returns literal `"user-placeholder"` (2 files); every debt queue insert fails; audit trail authorship is fiction                                                                                            |
| DEBT-02  | H   |     | Reversing a reversal is non-idempotent (retry/double-click credits the debt twice) and breaks the audit chain                                                                                                                    |
| DEBT-03  | H   |     | `handleTransactionDelete` picks an arbitrary payment to reverse after prior edits (order-dependent balance corruption)                                                                                                           |
| DEBT-04  | H   |     | Debt status transitions, hard deletes, and unarchive writes bypass event emission entirely                                                                                                                                       |
| DEBT-05  | H   |     | Two parallel transaction CRUD stacks; `TransactionList` deletes via Supabase-only mutation while debt reversal writes only to Dexie (split-brain by construction)                                                                |
| DEBT-06  | M   |     | Dead idempotency check does a full-table scan per debt mutation; global clock increment not atomic                                                                                                                               |
| DEBT-07  | M   |     | Payment flow recalculates the balance 3x; `getDebtsWithBalances` is N+1 while a batch function exists in the same package                                                                                                        |
| DEBT-08  | M   |     | Each DebtCard polls Supabase every 5 seconds; sync status reports "synced" on any error, including offline                                                                                                                       |
| DEBT-09  | M   |     | Validation triplicated with contradictory maxima (₱9,999,999.99 vs ₱999,999,999.00) and two entity vocabularies bridged by inline casts                                                                                          |
| DEBT-10  | M   |     | Second `CurrencyInput` in debts forms with different parsing rules than the shared UI component                                                                                                                                  |
| DEBT-11  | L   |     | Auto-generated IOU names collide with the active-name uniqueness rule (second IOU between the same pair fails)                                                                                                                   |
| DEBT-12  | L   |     | `closed_at` cleared inconsistently as `null` vs `undefined`; `calculateDelta` misses removed keys                                                                                                                                |
| DEBT-13  | L   |     | Different approach: exclusion-based reversal math should be a signed ledger; stored `status` should be derived at read time                                                                                                      |
| DEBT-14  | L   |     | `listDebts` loads all rows and filters in JS, ignoring its purpose-built compound index                                                                                                                                          |
| IMP-01   | H   | ✓   | CSV import bypasses the offline/event layer and its insert path cannot succeed (bulkAdd without `id`; self-admitted TODO), while a working batch API exists and is used by the PDF path                                          |
| IMP-02   | H   | ✓   | "Replace" duplicates are both updated AND inserted as new rows                                                                                                                                                                   |
| IMP-03   | H   | ✓   | CSV-injection guard applied on import (corrupting `-500.00` to ₱0.00 silently) while the exporter, where injection matters, has no guard                                                                                         |
| IMP-04   | M   |     | 32-bit hash `import_key` invites silent collisions (~1% at 10k rows); default resolution is "skip" (silent data loss)                                                                                                            |
| IMP-05   | M   |     | Date fragility: BDO regex accepts `13/45/25` → `"2025-13-45"`; freeform date edits unvalidated; one bad amount aborts the whole import session                                                                                   |
| IMP-06   | M   |     | Whole-file CSV parsing (50 MB target will die on low-end phones); PDF worker posts every page twice                                                                                                                              |
| IMP-07   | M   |     | Worker conflates "needs password" with "wrong password"; concurrent extractions interleave on one cancel flag                                                                                                                    |
| IMP-08   | L   |     | PDF wizard orchestrated by `useEffect` chains; two of eight steps exist only to host side effects                                                                                                                                |
| IMP-09   | L   |     | `confirmDrafts` updates rows one-by-one inside a transaction; batch queue inserts are N sequential Supabase calls                                                                                                                |
| IMP-10   | L   |     | Exporter writes raw UUIDs under `category`/`account` headers; `toISOString()` can shift calendar dates                                                                                                                           |
| IMP-11   | L   |     | Different approach: converge CSV onto the (strictly better) PDF draft pipeline                                                                                                                                                   |
| UI-01    | H   | ✓   | `<SelectItem value="">` in the debt selector crashes the transaction form subtree when opened (Radix throws on empty-string values)                                                                                              |
| UI-02    | H   | ✓   | Sidebar and mobile-drawer "Add Transaction" CTAs set `quickAddOpen`, which zero components read; the primary CTA does nothing                                                                                                    |
| UI-03    | H   | ✓   | Entry bundle 1,134 KB raw / 337 KB gzip vs <200 KB budget; no route code-splitting; recharts + debug pages in entry chunk; `src/lib/lazy.tsx` has zero importers; production sourcemaps public (found independently by 2 audits) |
| UI-04    | H   |     | Three offline banners render simultaneously with separate dismissal state; a fourth (`OfflineIndicator`) and a second install-prompt stack are dead code                                                                         |
| UI-05    | H   |     | Row-click behavior decided by viewport width but detail-pane visibility by container width: in ~1500-1760px viewports with sidebar open, clicking a row visibly does nothing                                                     |
| UI-06    | M   | ✓   | `/test-device` (with a clear-device-ID button) and `/debts/demo` ship in the production route tree; `debts-forms-demo.tsx` emits a build warning; `lib/debts/browser-test.ts` mutates real data if ever imported                 |
| UI-07    | M   |     | Auth guarding hand-rolled in per-route effects (3 copies + sessionStorage smuggling) instead of a `_authed` layout route with `beforeLoad` redirect                                                                              |
| UI-08    | M   |     | Virtualized table uses absolutely positioned `<tr>` (column misalignment), fixed 73px row estimate, and a hardcoded 600px height cap                                                                                             |
| UI-09    | M   |     | Sidebar advertises ⌘D/⌘T/⌘A/⌘B/⌘C/⌘S shortcuts that are not implemented; ⌘N fires a CustomEvent before its listener mounts; success-toast spam                                                                                   |
| UI-10    | M   |     | `navStore`: `activeRoute` written but never read; `sidebarCollapsed` shadowed by shadcn's own persisted state; consumers subscribe without selectors                                                                             |
| UI-11    | M   |     | Duplicates: 2× `useIsMobile`, 2× `CategorySelector`, dead `ExportButton` re-implemented inline in settings, `currency-input.example.tsx` in prod source, `useDebounce` stranded outside `src/hooks/`                             |
| UI-12    | M   |     | Auth initializes twice (AuthProvider + App), stacking permanent Supabase auth listeners with no unsubscribe                                                                                                                      |
| UI-13    | M   |     | AppLayout renders two entire JSX trees with separate `<Outlet/>`s; crossing the mobile breakpoint remounts the active route and loses form state                                                                                 |
| UI-14    | L   |     | `useOnlineStatus` polls `supabase.auth.getSession()` every 30s per instance, a local call that cannot detect connectivity                                                                                                        |
| UI-15    | L   |     | `window.confirm`/`alert` for destructive flows; sign-out dialog logic lives inside the Zustand store                                                                                                                             |
| UI-16    | L   |     | Icon-only buttons lack `aria-label`s; QuickActionButton renders fake placeholder modals although the real dialogs exist one import away; dead `SpeedDialFAB`                                                                     |
| UI-17    | L   |     | PageShell used by only 5 of 15 content routes despite CLAUDE.md's "every route" convention; dashboard month not in URL; `householdId` hardcoded in transfers route                                                               |
| UI-18    | L   |     | Every row shows a hardcoded `SyncBadge status="synced"`; `useMediaQuery` resubscribes on every match flip                                                                                                                        |
| SEC-01   | H   | ✓   | Transactions RLS: no household scoping (cross-household reads of `visibility='household'` rows) and no `WITH CHECK` on UPDATE (authorship spoofing, ownership theft)                                                             |
| SEC-02   | H   | ✓   | Budgets RLS is `USING (true) WITH CHECK (true)`: zero isolation for any authenticated user                                                                                                                                       |
| SEC-03   | H   | ✓   | `check_budget_thresholds()` is SECURITY DEFINER with default PUBLIC execute: anon-key callers can dump all households' budget/spend data; `cleanup_old_sync_queue()` similarly over-granted                                      |
| SEC-04   | H   |     | Push worker accepts the public anon key as valid auth (role/aud unchecked), has `Access-Control-Allow-Origin: *`, and cannot run on Workers anyway (Node `web-push` without `nodejs_compat`; placeholder production URL)         |
| SEC-05   | M   |     | "Immutable" event log is deletable via `ON DELETE CASCADE` through devices/profiles (users may delete own devices) and `actor_user_id`/`device_id` are client-asserted on insert                                                 |
| SEC-06   | M   |     | `debt_payments` RLS is `FOR ALL` (household members can UPDATE/DELETE "immutable" payment history)                                                                                                                               |
| SEC-07   | M   |     | Service worker caches authenticated Supabase REST responses in Cache Storage, keyed by URL only, surviving logout                                                                                                                |
| SEC-08   | M   | ✓   | Tracked root file `json` (12 KB) contains real family financial reference data (bank accounts, member names, budget categories) in git history                                                                                   |
| INFRA-01 | H   | ✓   | Offline navigation broken: network-only fetch listener + `caches.match("/offline.html")` that can never hit (workbox revision-parameterized key); precache entry duplicated                                                      |
| INFRA-02 | H   |     | Budget threshold month matching off by one day: `DATE AT TIME ZONE 'Asia/Manila'` on an already-local DATE shifts 1st-of-month transactions into the previous month                                                              |
| INFRA-03 | M   |     | Transfer integrity trigger is race-prone under concurrent inserts (the expected case for multi-device sync); a partial unique index would enforce the invariant for free; migration duplicated verbatim                          |
| INFRA-04 | M   |     | Sentry split-brain: sync/conflict/Dexie errors report via a `window.Sentry` guard that is never true; replay integration registered with 0% sampling; CSP `connect-src` blocks Sentry and the push worker anyway                 |
| INFRA-05 | M   |     | Dev health check polls port 54321 while the project's Supabase API is on 54331: every cold `npm run dev` burns the 60s timeout                                                                                                   |
| INFRA-06 | M   |     | Type-check blind spots: only `src/` in tsconfig (configs, scripts, e2e unchecked); ESLint block for edge functions points at a nonexistent directory; CI double-typechecks                                                       |
| INFRA-07 | M   |     | Pre-push runs `lint:fix` (mutating the tree after the push contents are fixed) and bare `vitest` (watch mode, TTY-fragile); pre-commit runs no ESLint                                                                            |
| INFRA-08 | L   |     | `.lighthouserc.json` asserts the removed `categories:pwa`; no `startServerCommand`; security workflow duplicates LHCI and swallows failures                                                                                      |
| INFRA-09 | L   |     | Schema nits: `amount_cents >= 0` allows zero-amount rows; budget `month` not normalized to the 1st (duplicate month budgets possible); 2-level category depth unenforced                                                         |
| INFRA-10 | L   |     | Migration hygiene: applied migration edited in place; verbatim function re-declaration caused the RLS-recursion regression; noisy DO-block self-verification                                                                     |
| INFRA-11 | L   |     | Dependency placement: `@tanstack/router-devtools` and `workbox-*` in `dependencies`; `baseline-browser-mapping` unused; dead Google Fonts SW route                                                                               |
| INFRA-12 | L   |     | Repo hygiene: stale `REMAINING-TYPESCRIPT-FIXES.md` / `SYNC-QUEUE-TESTS-SUMMARY.md` at root; DEPLOYMENT.md describes a different deploy mechanism than `wrangler.jsonc`                                                          |
| TEST-01  | M   |     | E2E suite: 17× `waitForTimeout`, ~20 self-skipping tests (broken selectors render suites green), per-test UI login, 5 browsers × 1 worker, runs only on push (PRs merge unverified)                                              |

---

## 3. Cross-Cutting Themes

These are the consultant-level patterns behind the individual findings. Fixing themes, not just findings, is what prevents recurrence.

### Theme 1: The offline-first architecture is inverted

Every layer contradicts the stated architecture in the same direction. The outbox lives in the cloud (SYNC-01); reads come from the cloud (DATA-01); the service worker requires the network to boot (INFRA-01); and offline mutations are rolled back rather than queued. The actual runtime behavior is a conventional online CRUD app with realtime echo and timestamp LWW, wearing an offline-first costume. The costume is expensive: clocks, idempotency keys, rollback choreography, and dual writes all execute on the hot path while buying nothing.

**The fix is directional, not incremental**: one local Dexie outbox written in the same IndexedDB transaction as the entity write; client-generated UUIDs (`crypto.randomUUID()`) so local ID == server ID, which deletes the entire temp-ID/idMapping subsystem; reads served from Dexie via `useLiveQuery` with background reconciliation. Most of SYNC-01/02/03/08/12, DATA-01/08, and DEBT-08 collapse into this one change.

### Theme 2: Parallel implementations were built and never reconciled

The single most pervasive pattern in the codebase. The full map is in Appendix B, but the headline: three Lamport clocks, two vector-clock modules, two idempotency generators, two device-ID providers, three sync-trigger managers, two `lastSyncTime` sources, four offline banners, two install prompts, two CurrencyInputs, two CategorySelectors, two `useIsMobile` hooks, two `useDashboardData` hooks, two import pipelines, and two complete transaction CRUD stacks. In nearly every pair, the two copies are keyed, scoped, or parsed differently, so they don't just waste lines, they produce _incompatible data_ (a debt mutation and a transaction mutation get clocks from different counters and identities from different device-ID modules; SYNC-04, DEBT-06).

This is the signature of features built as isolated work chunks (each chunk bringing its own utilities) without an integration pass. The remedy is a standing rule: **before writing a utility, grep for it; after merging a feature, delete what it superseded.** A periodic dead-code sweep (knip or ts-prune in CI) would have caught most of Appendix A automatically.

### Theme 3: The documentation is more optimistic than the code

Comments and docs repeatedly assert properties the code does not have: "IndexedDB transactions are atomic (safe for concurrent calls)" above a non-atomic read-modify-write (SYNC-14); "CRITICAL: atomicity" above a two-transaction compaction (SYNC-17); "Immutable payment history" above a `FOR ALL` RLS policy (SEC-06); "multi-household ready" above policies with no household predicate (SEC-01); an offline queue module whose own docstring admits "Network offline: Returns error". The spec's `draft → queued → syncing → acked → confirmed` state machine doesn't match the implemented `queued/syncing/completed/failed`. This is worse than missing documentation because reviewers, new contributors, and AI agents will trust the comments. Trim JSDoc to contracts that are true, and treat any comment that claims atomicity, immutability, or offline behavior as a test obligation.

### Theme 4: Phase B machinery runs dead inside Phase A

Vector clocks, conflict detection/resolution, the conflicts store, compaction guards, and the ConflictIndicator are all unreachable or ineffective at runtime (clocks never leave the device; `compareVectorClocks({}, {})` is always "equal"; the component is never mounted). The half-state costs complexity and misleads (SYNC-05/07/17). Either wire the pipeline end-to-end (columns on entity tables, clocks in payloads, resolution on receipt) or excise it cleanly and reintroduce it when Phase B starts. The current middle ground is the worst of both options.

### Theme 5: Failures are silent where a finance app needs them loud

A consistent preference for swallowing over surfacing: queue failures return `null` and are ignored (DEBT-01 path); `processQueue` converts every error into `{synced:0, failed:0}` (SYNC-18); unparseable amounts become ₱0.00 (IMP-03); duplicate-hash collisions default to "skip" (IMP-04); the "Retry" button deletes the failed item and reports success (SYNC-16); every row wears a hardcoded "synced" badge (UI-18); e2e tests skip themselves when selectors break (TEST-01); sync status reports "synced" on any error including offline (DEBT-08). For household financial data, the correct posture is the opposite: fail loudly, coerce nothing, and never show a green state you didn't verify.

### Theme 6: Security posture lags the privacy mission

The app's stated identity is "privacy-focused," but: two tables have effectively no row isolation (SEC-01/02), an anon-callable RPC dumps cross-household financial summaries (SEC-03), the audit log is cascade-deletable and spoofable (SEC-05), authenticated API responses persist in Cache Storage across logout (SEC-07), full sourcemaps ship publicly (UI-03), and real family financial data sits in git history (SEC-08). One hardening migration plus three config changes address almost all of it (see Phase 1 below).

### Theme 7: Performance budgets are aspirational, not enforced

337 KB gzip entry vs a 200 KB budget, no route code splitting, 7 serial dashboard queries, 2 round trips per bulk-status row, network COUNT polling every 10s per component, 5s polling per debt card, and unbounded aggregation fetches that silently truncate at 1,000 rows. The budgets exist in CLAUDE.md but nothing measures them; `.lighthouserc.json` can't run unattended and asserts a category Lighthouse removed. Put a bundle-size check and Lighthouse CI in the pipeline, or delete the budgets from the docs.

---

## 4. Selected Findings in Detail

The index above is complete; this section expands the findings most likely to be misunderstood or that carry the largest blast radius. File references are from the audits and were re-verified where marked ✓.

### 4.1 SYNC-01/02 ✓: The outbox inversion

`src/lib/offline/syncQueue.ts:238` inserts queue items via `supabase.from("sync_queue").insert(...)`. Every offline CRUD function treats queue failure as fatal, e.g. `src/lib/offline/transactions.ts:132-134`:

```ts
if (!queueResult.success) {
  await db.transactions.delete(transaction.id);   // rolls back the local write
  return { success: false, ... };
}
```

Meanwhile the local `db.syncQueue` table (schema at `src/lib/dexie/db.ts`) has zero writers but four readers, including `authStore.checkUnsyncedData()`, which therefore always returns `false`, after which logout calls `clearIndexedDB()` and wipes any data that never synced. The debt path (`src/lib/debts/sync.ts`) swallows the queue failure instead, so offline debt events are written locally and _never sync, permanently_.

**Fix**: enqueue into `db.syncQueue` inside the same `db.transaction("rw", ...)` as the entity write; drain it from the sync processor when online. The server-side `sync_queue` table becomes unnecessary. This also makes pending-count badges free, truthful, and reactive (`useLiveQuery` count) instead of a polled network COUNT.

### 4.2 SYNC-03 ✓: Temp IDs cannot survive the pipeline

Creates ship the whole record including `id: "temp-<nanoid>"` to a Postgres UUID column; the insert fails with a non-retryable classification, permanently failing the item. Updates/deletes pass `item.entity_id` raw (`src/lib/sync/processor.ts:299-302`, verified) without consulting `idMapping`. Even when mappings exist, `idMapping.clear()` runs at session end, destroying mappings that retried items would need. **Fix**: client-generated `crypto.randomUUID()` at creation time makes local ID == server ID and deletes the temp-ID subsystem (~150 lines) outright. This is strictly simpler and eliminates the local-duplicate bug where the synced server copy re-enters via realtime alongside the temp-ID original.

### 4.3 SYNC-06 ✓: String-compared clocks

`src/lib/conflict-resolver.ts:145-149` (duplicated at :202-205):

```ts
const localOrder = `${localEvent.lamportClock}-${localEvent.deviceId}`;
const winner = localOrder > remoteOrder ? localEvent : remoteEvent; // "10-..." < "9-..."
```

Deterministic but wrong once clocks pass 9: the older edit wins roughly half the time. Unit tests pass because fixtures use single-digit clocks. Compare numerically, tie-break on deviceId.

### 4.4 DATA-02 ✓: The 1,000-row cliff

`useAccountBalance`, `useAccountBalances`, `useDashboardData`, and `useAnalytics` all fetch every matching transaction row with no `.limit()` or pagination and aggregate client-side. PostgREST's default max-rows setting truncates at 1,000 **without an error**. The project targets 10k+ transactions; past 1,000, balances and analytics silently become wrong, which is the worst failure mode a finance app can have. **Fix**: server-side aggregation (a view or RPC with `SUM(CASE WHEN ...)` grouped by account), or aggregate locally from Dexie once reads are local. Run the dashboard's 7 independent queries via `Promise.all`/`useQueries` regardless.

### 4.5 DATA-03 ✓: Transfer legs

The DB trigger `handle_transfer_deletion` (`supabase/migrations/20251027075023:96-115`, verified) responds to deleting one transfer leg by setting the survivor's `transfer_group_id = NULL`, explicitly converting it into a regular transaction. Since all analytics filter `transfer_group_id IS NULL`, the surviving leg **starts counting as real income or expense** from that moment. The UI exposes legs to single and bulk delete whenever the user unchecks "exclude transfers". Creation is two sequential inserts with no atomicity and no offline path. **Fix**: delete by `transfer_group_id` (both legs) in the UI; change the trigger to cascade-delete the sibling; create both legs in one `insert([...])` (PostgREST wraps it in one transaction); and add `CREATE UNIQUE INDEX ON transactions(transfer_group_id, type) WHERE transfer_group_id IS NOT NULL` so the pair invariant is enforced by storage rather than a race-prone counting trigger (INFRA-03).

### 4.6 DATA-04 ✓: Bulk toggle

`handleBulkStatusUpdate(status)` maps every selected id to `toggleStatus.mutateAsync(id)`, and the mutation flips whatever it finds (fetch-then-write, 2 round trips each). Selecting a mixed batch and clicking "Mark Cleared" marks the already-cleared rows pending while toasting success. One `UPDATE ... WHERE id IN (...)` with an explicit target status fixes correctness and turns 100 requests into 1.

### 4.7 SEC-01/02/03 ✓: The RLS gaps

Transactions policies (`20251024001500:245-289`, verified) filter only on `visibility`/`created_by_user_id`, never `household_id`, and UPDATE has no `WITH CHECK`. Consequences: cross-household visibility of all `visibility='household'` rows the moment a second household exists; and any member can UPDATE a household transaction and rewrite `created_by_user_id` (ledger authorship spoofing) or flip it to personal under their own name and then delete it. Budgets are `USING (true) WITH CHECK (true)` (verified). `check_budget_thresholds()` is `SECURITY DEFINER` with no `REVOKE`, callable via `POST /rest/v1/rpc/...` with the public anon key, returning all households' budget/spend/user data (verified: no GRANT/REVOKE statements exist in the migration). One hardening migration fixes all three; the pattern to copy is already in the codebase (`get_user_household_id()` + the anon revoke done in the 20251122 hotfix).

### 4.8 INFRA-01 ✓: Offline boot

`src/sw.ts:277-286` (verified) intercepts navigations with `fetch(request).catch(() => caches.match("/offline.html"))`. Two problems: navigations never use the precached app shell (network-only), and the fallback lookup misses because workbox precaches `offline.html?__WB_REVISION__=<hash>` while `caches.match` defaults to exact-query matching. Offline reload = `Response.error()`. **Fix**: `registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")))` plus `setCatchHandler` with `matchPrecache("/offline.html")`. About 30 lines, and it is the difference between the PWA working offline or not at all.

### 4.9 UI-03 ✓: Bundle reality vs budget

Measured from `dist/`: `index-*.js` 1,133,813 B raw / 336,719 B gz, plus a 191 KB gz eager chunk. recharts, d3, lucide, dexie, fingerprintjs, papaparse, the debug pages, and all routes are in the entry graph. `src/lib/lazy.tsx` (120 lines of lazy-loading helpers) has zero importers, while `routes/import/pdf.tsx` proves the correct pattern (pdf.worker is its own 403 KB chunk). `sourcemap: true` publishes complete source. **Fix**: `TanStackRouterVite({ autoCodeSplitting: true })`, `React.lazy` the chart components, `sourcemap: "hidden"` with upload to Sentry, drop the custom `chunkFileNames`.

### 4.10 DEBT-02/03: The reversal model's two bugs

Both stem from exclusion-based balance math (balance = original − Σ(payments that are neither reversals nor reversed)). Reversing a reversal creates a positive payment deliberately stripped of its `reverses_payment_id` link so the sums work, which makes it invisible to the idempotency check: retrying the operation credits the debt twice. And `handleTransactionDelete` selects the payment to reverse with `.first()` on a set that contains multiple non-reversal payments after any prior edit, so which payment gets reversed is effectively random. The durable fix is the signed-ledger model (DEBT-13): balance = original − Σ(_all_ rows), reversals are just linked negative rows, reversal-of-reversal a linked positive row; idempotency then works uniformly on `reverses_payment_id`, and most of `status.ts`'s repair machinery becomes deletable because status derives from balance at read time.

---

## 5. What's Done Well

Credit where due; these are worth protecting during remediation.

- **`src/lib/currency.ts`** is a genuinely solid integer-cents module: split-and-pad formatting instead of float `toFixed`, a safe `parsePHPSafe` result type, explicit maxima, and 400+ lines of edge-case tests.
- **Transfer-exclusion discipline holds in every live analytics path** (`useCategoryTotals`, `useBudgets`, `useDashboardData`, `useAnalytics`), each with an explanatory comment, and balances correctly _include_ transfers.
- **Schema and index design match the documented query map**: BIGINT cents with checks, compound `(account_id, date DESC)`/`(category_id, date DESC)`, GIN on `tagged_user_ids`, generated `month_key`, partial indexes on hot statuses, and DB-level transfer integrity triggers.
- **The PDF import pipeline is close to reference quality**: pdfjs isolated in a Web Worker with a typed message protocol and transferable buffers, route-level lazy loading keeping ~400 KB out of the main bundle, an extensible bank-parser registry with confidence scoring, and a clean draft/session layer with atomic Dexie transactions.
- **The RLS-recursion fix was textbook** (SECURITY DEFINER STABLE helper with `SET search_path` and anon revoke), with honest post-mortem comments.
- **`retry.ts`** is a clean, correct, well-tested backoff utility; the promise-dedupe in `SyncProcessor.processQueue` is the right single-tab concurrency pattern.
- **Vector-clock math is correct where it exists**, with 19 good test cases; the problem is wiring, not algorithms.
- **Filters live in the URL** on the core routes with typed `validateSearch` and a hard default of `excludeTransfers: true`; auth forms use React 19 `useActionState` properly.
- **E2E test-data management** (`[E2E]`-prefixed rows, service-role cleanup fixtures) is a sound pattern, whatever the suite's other issues.
- **The SW update flow** (`registerType: "prompt"`, SKIP_WAITING via message) is a mistake-prone area done right, and the `vite-plugin-pwa` injectManifest + hand-written workbox pairing is the correct combination, not a duplication.

---

## 6. Prioritized Remediation Roadmap

Ordered by risk reduction per unit of effort. Phases 1 and 2 are each roughly a focused week.

### Phase 1: Stop the bleeding (security + user-visible correctness)

1. **One RLS hardening migration** (SEC-01/02/03/05/06): household predicate + `WITH CHECK` on transactions; real policies on budgets; `REVOKE` on the two SECURITY DEFINER functions (grant `service_role` only, add `SET search_path`); events INSERT pinned to `auth.uid()` and own devices; `debt_payments` reduced to SELECT+INSERT; FKs on `transaction_events` to `RESTRICT`.
2. **Purge the `json` file** (SEC-08): move the data out, `git rm`, and scrub history (git-filter-repo) if this repo could ever be shared. Delete the two stale root status docs while at it.
3. **Fix bulk status update** (DATA-04): a set-status mutation with `IN (...)`.
4. **Fix the transfer delete/create paths** (DATA-03, INFRA-03): both-leg delete, cascade trigger, single-statement create, partial unique index.
5. **Fix the Radix crash** (UI-01): sentinel value, mirroring the `value="all"` pattern already used in TransactionFilters.
6. **Wire or hide the primary CTA** (UI-02): render one `TransactionFormDialog` in AppLayout driven by `quickAddOpen`.
7. **Disable or fix CSV import** (IMP-01/02/03): it cannot currently succeed and corrupts negative amounts; the honest short-term move is hiding the route until Phase 3's convergence.
8. **Fix `"user-placeholder"`** (DEBT-01): the real implementation is in the adjacent comment.
9. **Bound the aggregation queries** (DATA-02): server-side RPC/view for balances, `Promise.all` the dashboard.
10. **Restore offline boot** (INFRA-01): NavigationRoute + catch handler, ~30 lines. Drop SW caching of authenticated REST (SEC-07).

### Phase 2: Make offline-first real (the directional fix)

1. Local Dexie outbox written atomically with entity mutations (SYNC-01/02, DATA-08); delete the manual rollback choreography.
2. Client-generated UUIDs; delete temp IDs, `idMapping`, and the remap lifecycle (SYNC-03).
3. Reads from Dexie via `useLiveQuery` with background reconciliation, or at minimum an explicit Dexie fallback; wire or delete the six `useOffline*` read hooks (DATA-01).
4. One sync trigger manager (keep `autoSyncManager`, delete the other two; fix listener cleanup) (SYNC-10).
5. Persist the sync high-water mark in `db.meta`; delete the second `lastSyncTime` (SYNC-11).
6. Reset stale `syncing` rows on startup or drop the pre-flight status write (SYNC-08); `next_retry_at` instead of inline sleeps (SYNC-09).
7. Publish sync state through the existing `syncStore` so every badge/banner reads one source (SYNC-13, UI-18, DEBT-08).

### Phase 3: Consolidation and deletion

1. One clock module, one idempotency generator, one device-ID provider (SYNC-04, DEBT-06); atomic increments via `db.transaction`.
2. Decide Phase B honestly: wire vector clocks end-to-end or remove the conflict stack until then (SYNC-05/07, Theme 4). Fix the string compare either way (SYNC-06).
3. Execute the Appendix A deletion list (dead hooks, components, placeholder modules, demo routes, example files).
4. One offline banner, one install prompt, one CurrencyInput, one CategorySelector, one `useIsMobile` (UI-04/11, DEBT-10).
5. Auth: single initialization with unsubscribe (UI-12); `_authed` layout route with `beforeLoad` (UI-07).
6. Converge CSV import onto the draft pipeline (IMP-11); fix hash keys, date parsing, and password UX (IMP-04/05/07).
7. Signed-ledger reversal model and derived debt status (DEBT-13, resolving DEBT-02/03/04).
8. Generated Supabase types in CI, typed client, delete hand-rolled mirrors (DATA-09). Dexie version deltas instead of full-schema repeats (DATA-10).

### Phase 4: Performance and guardrails

1. `autoCodeSplitting: true`, lazy charts, hidden sourcemaps, verify recharts leaves the entry chunk (UI-03).
2. Batch/liveQuery all polling (SYNC-12, DEBT-08); query-key hygiene with shared `queryOptions` (DATA-06).
3. Virtualized table rework (grid rows + `measureElement`, container-driven height) and the container-vs-viewport fix (UI-05/08).
4. CI: bundle-size budget check, working Lighthouse CI, `knip`/`ts-prune` dead-code gate, e2e on PRs (chromium-only) with `storageState` login and no `waitForTimeout` (TEST-01, INFRA-06/07/08).
5. Align comments/docs with reality as each subsystem is touched (Theme 3); reconcile the sync state-machine naming with the spec.

---

## Appendix A: Dead Code Deletion List (import-graph verified by the audits)

| Path                                                                                                                                                                   | Why                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/hooks/useOfflineTransactions.ts`, `useOfflineAccounts.ts`, `useOfflineCategories.ts`, `useOfflineTransaction.ts`, `useOfflineAccount.ts`, `useOfflineCategory.ts` | Zero UI importers (wire up in Phase 2 or delete)                                       |
| `src/lib/offline/cacheManager.ts`                                                                                                                                      | Imported only by the dead hooks above                                                  |
| `src/hooks/useDashboardData.ts`                                                                                                                                        | Dead duplicate; queries nonexistent `balance_cents` column                             |
| `src/lib/transactions.ts`, `src/lib/accounts.ts`, `src/lib/categories.ts`, `src/lib/budgets.ts`                                                                        | Placeholder CRUD that only throws; shadows real implementations with conflicting types |
| `src/lib/lazy.tsx`                                                                                                                                                     | Zero importers (or finally use it for chart splitting)                                 |
| `src/lib/vector-clock-debug.ts`                                                                                                                                        | Zero importers                                                                         |
| `src/components/ConflictIndicator.tsx`                                                                                                                                 | Never mounted                                                                          |
| `src/components/OfflineIndicator.tsx`, `src/components/OfflineBanner.tsx` or `src/components/sync/OfflineBanner.tsx` (keep one), `src/components/NetworkStatus.tsx`    | Offline banner consolidation (UI-04)                                                   |
| `src/components/InstallPrompt.tsx`, `src/hooks/useInstallPrompt.ts`                                                                                                    | Dead second install-prompt stack                                                       |
| `src/components/CategorySelector.tsx`                                                                                                                                  | Zero importers; diverged from `ui/category-selector.tsx`                               |
| `src/components/ExportButton.tsx`                                                                                                                                      | Zero importers; logic re-implemented inline in settings                                |
| `src/components/ui/currency-input.example.tsx`, `src/lib/currency.examples.ts`                                                                                         | Example files in production source                                                     |
| `src/components/debts/forms/CurrencyInput.tsx`                                                                                                                         | Duplicate of `ui/currency-input.tsx` with divergent parsing                            |
| `src/hooks/use-mobile.ts`                                                                                                                                              | Duplicate `useIsMobile`; point `ui/sidebar.tsx` at `useMediaQuery`                     |
| `src/routes/debts-forms-demo.tsx`                                                                                                                                      | No route export; emits a build warning                                                 |
| `src/routes/test-device.tsx`, `src/routes/debts/demo.tsx`                                                                                                              | Shipped debug/demo routes (delete or DEV-gate)                                         |
| `src/lib/debts/browser-test.ts`                                                                                                                                        | Unimported; mutates real data via `window` if ever imported                            |
| `src/lib/background-sync.ts` (after trigger consolidation)                                                                                                             | Redundant with autoSyncManager; leaks listeners                                        |
| `src/lib/device.ts` (after routing through deviceManager)                                                                                                              | Second device-ID implementation                                                        |
| One of `src/lib/sync/{lamportClock,vectorClock,idempotency}.ts` vs `src/lib/{vector-clock,idempotency}.ts` + `src/lib/dexie/lamport-clock.ts`                          | Keep exactly one per concept (SYNC-04)                                                 |
| Root: `json`, `REMAINING-TYPESCRIPT-FIXES.md`, `SYNC-QUEUE-TESTS-SUMMARY.md`                                                                                           | Personal data / stale status docs                                                      |
| `src/components/layout/QuickActionButton.tsx`: `SpeedDialFAB` export                                                                                                   | Never used                                                                             |
| `package.json`: `baseline-browser-mapping`                                                                                                                             | No imports found                                                                       |

## Appendix B: Duplicate Implementations Map

| Concept           | Implementations                                                                                                                        | Divergence                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Lamport clock     | `lib/sync/lamportClock.ts`, `lib/vector-clock.ts` (LamportClockManager), `lib/dexie/lamport-clock.ts`                                  | Per-entity `lamport-${id}` vs per-entity `clock:${id}` vs one global key; values not comparable across paths |
| Vector clock      | `lib/vector-clock.ts`, `lib/sync/vectorClock.ts`                                                                                       | Same algorithm, incompatible result vocabularies (`local-ahead` vs `v1-ahead`)                               |
| Idempotency key   | `lib/idempotency.ts` (class + checksum), `lib/sync/idempotency.ts` (function)                                                          | Same mutation can yield two different keys                                                                   |
| Device ID         | `lib/dexie/deviceManager.ts` (IndexedDB→localStorage→FingerprintJS), `lib/device.ts` (localStorage only)                               | One physical device can carry two identities; realtime filter uses the weak one                              |
| Sync triggers     | `lib/sync/autoSync.ts`, `lib/background-sync.ts`, inline handlers in `App.tsx`                                                         | Same events trigger 2-3 sync runs; background-sync leaks listeners                                           |
| Last sync time    | `stores/syncStore.ts` (in-memory), `hooks/useSyncStatus.ts` (localStorage)                                                             | UI shows conflicting values; catch-up cursor resets per reload                                               |
| Transaction CRUD  | `lib/offline/transactions.ts` (Dexie + queue + events), `lib/supabaseQueries.ts` mutations (direct Supabase)                           | UI uses both; deletes bypass queue/events while debt hooks write only locally                                |
| Dashboard data    | `lib/supabaseQueries.ts:useDashboardData` (live), `hooks/useDashboardData.ts` (dead, broken)                                           | Same name, one crashes at runtime                                                                            |
| Offline banner    | `components/OfflineBanner.tsx`, `components/sync/OfflineBanner.tsx`, `components/NetworkStatus.tsx`, `components/OfflineIndicator.tsx` | Three render simultaneously; separate detection + dismissal state                                            |
| Install prompt    | `components/PWAInstallPrompt.tsx` (inline logic), `components/InstallPrompt.tsx` + `hooks/useInstallPrompt.ts`                         | Second stack dead                                                                                            |
| Currency input    | `components/ui/currency-input.tsx`, `components/debts/forms/CurrencyInput.tsx`                                                         | Different parsers, different min/max behavior                                                                |
| Category selector | `components/ui/category-selector.tsx` (used), `components/CategorySelector.tsx` (dead)                                                 | Diverged grouping logic and props                                                                            |
| `useIsMobile`     | `hooks/useMediaQuery.ts`, `hooks/use-mobile.ts`                                                                                        | Same breakpoint, two files                                                                                   |
| Import pipeline   | CSV (`routes/import.tsx` + `importStore`) vs PDF (`PDFImportPage` + `pdfImportStore` + drafts)                                         | PDF path is correct; CSV path bypasses offline layer and is broken                                           |
| Amount validation | `lib/currency.ts` (₱9,999,999.99), `lib/debts/validation.ts` runtime (same), debts zod schemas (₱999,999,999.00)                       | 100× discrepancy between form and runtime limits                                                             |
| Auth user lookup  | Real auth store vs `"user-placeholder"` literals in `lib/debts/{events,sync}.ts`                                                       | Debt audit trail attributes everything to a fake user                                                        |

---

_Full per-subsystem audit narratives (including per-finding evidence quotes) were produced by five parallel reviews on 2026-07-02; this document is the deduplicated synthesis. Questions about any finding can be answered by reading the cited file/lines, all of which were current as of commit `c294e70`._
