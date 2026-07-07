# Mobile UX Remediation — Execution Plan

Source review: `docs/reviews/2026-07-07-mobile-ux-review.md`
(R1–R42 = numbered findings, C1–C7 = completeness-critic gaps, L = low one-liners.)
Branch: `mobile-ux-remediation`. Commit per verified phase.

## Decisions & Deferrals

- **SummaryCards → container-query grid** (not compact formatter). Why: keeps full peso precision; `@container` wrapper already exists. Revisit: if single-column amounts still overflow at 320px.
- **FAB → single-action quick-add only** (drop speed-dial/menu). Why: both menu paths are broken on iOS; account/category creation lives in MobileNav and their pages. Revisit: if a real speed-dial need appears.
- **Bottom tab bar (R42) sequenced LAST** (Phase 8). Why: interacts with FAB position (R1) and main bottom padding (R13); fold padding tokens together there.
- **Filtered totals + count via Supabase RPC** (not PostgREST aggregates). Why: aggregates are disabled by default on Supabase; the count label needs a server answer anyway.
- **Dead chart components: DELETE** (CategoryInsightsDashboard + orphan charts + BudgetProgressCard). Why: duplicate live charts; git history preserves them.
- **window.confirm: all five sites → AlertDialog**, authStore's confirm lifted into the component layer (`signOut({ exportFirst })`-style split).
- **DEFERRED: swipe actions + haptics (C6).** Optional polish. Revisit: after Phase 8.
- **DEFERRED: Supabase email-confirmation deep-link audit.** Depends on Supabase dashboard config outside the repo.

## Phase 1 — Sync trust (R3, R9, R26, R17, L)

- [x] 1.1 `failedCount` liveQuery in `useSyncStatus` + wire `hasFailures` in `GlobalSyncStatus` (red badge, aria-label) (R3)
- [x] 1.2 `processor.handleError` → `syncIssuesManager.logSyncFailure` on terminal failure (R3)
- [x] 1.3 One-time "changes failed to sync" toast on `result.failed` transition in autoSync (R3)
- [x] 1.4 `TransactionList` row badge: failed items show failed, not "pending" (R3)
- [x] 1.5 Overlay unsynced Dexie rows in `useTransactions` queryFn after Supabase fetch (R9)
- [x] 1.6 Post-submit outbox drain + query invalidation; QueryClient → `src/lib/queryClient.ts`; post-sync invalidation covers transactions/accounts/dashboard (R9)
- [x] 1.7 SyncQueueViewer → Dexie `useLiveQuery`, wire `useSyncProcessor` as "Sync now", remove placebo Refresh (R26)
- [x] 1.8 MobileNav sync row → `GlobalSyncStatus variant="detailed"`; remove stale `SyncIndicator` usages incl. AppSidebar (L)
- [x] 1.9 GlobalSyncStatus compact header button → proper Button, ≥44px target (R17)

## Phase 2 — FAB & New Transaction flow (R1, R5, R27, R30, C5)

- [x] 2.1 FAB = plain Button → `navStore.setQuickAddOpen(true)`; delete dropdown, onContextMenu, "coming soon" placeholders, duplicate dialog (R1)
- [x] 2.2 DialogContent primitive: `max-h-[calc(100dvh-2rem)] overflow-y-auto`; delete per-dialog `max-h-[90vh]` copies (R27)
- [x] 2.3 TransactionFormDialog renders as bottom Sheet on mobile; Amount→Type→Description→Category→Account order; "More options" disclosure; sticky safe-area footer (R5)
- [x] 2.4 Real `/transactions/new` route (opens quick-add, redirects) + styled root `notFoundComponent` (R30, C5)

## Phase 3 — Quick wins sweep (small items)

- [x] 3.1 `replace: true` in `updateFilters` navigate (R12)
- [x] 3.2 Mobile `<main>` bottom inset for FAB (R13)
- [x] 3.3 TransferForm UTC date → `format(new Date(), "yyyy-MM-dd")` + README + unit test (R21)
- [x] 3.4 Sonner `mobileOffset`/position fix (R7 partial)
- [x] 3.5 `min-h-11` MobileNav rows + SettingsNav anchors (L)
- [x] 3.6 Coarse-pointer CSS: select-item/dropdown-item min-height; checkbox/radio `::after` hit expansion; select-trigger (R15, R23, L)
- [x] 3.7 `w-full` on all form SelectTriggers (R23)
- [x] 3.8 `prefers-reduced-motion` block in index.css (R34)
- [x] 3.9 `active:` variants in buttonVariants + MobileNav rows (R16)
- [x] 3.10 aria-labels on icon-only buttons (~10 sites) (R35)
- [x] 3.11 Paired theme-color metas + ThemeColorSync + manifest colors (R31)
- [x] 3.12 StorageWarning top calc + shared stacking container with OfflineBanner (R29)
- [x] 3.13 MonthSelector "Current" visible on phones (L)
- [x] 3.14 Account detail onEdit wiring (R25)
- [x] 3.15 Draft discard: Undo toast (status flip + counter decrement) + gap-2 + destructive styling + aria-labels (R2)
- [x] 3.16 SummaryCards container-query grid, remove truncate (R4, decision 1)
- [x] 3.17 Empty-state CTAs (accounts, transactions no-data) (L)
- [x] 3.18 CurrencyInput commits on change (R22)
- [x] 3.19 AccountFormDialog + BudgetForm → CurrencyInput + zod cents (R19)
- [x] 3.20 DatePicker → direct `<Input type="date">`, fix UTC-midnight parse (R20)
- [x] 3.21 Search input `type="search"` + `enterKeyHint` (C7)
- [x] 3.22 Offline create toast says "saved on this device, will sync" (L)

## Phase 4 — Lists & tables on mobile (R6, R14+R38, R36, R24)

- [ ] 4.1 TransactionList card list below container breakpoint (shared virtualizer, RecentTransactions row pattern) (R6)
- [ ] 4.2 Row tap → read-only bottom Sheet with Edit button (narrow) / detail pane (wide); export TransactionDetailContent; filtered In/Out totals on narrow (R14, R38)
- [ ] 4.3 Drafts: stacked card list below container breakpoint + bottom Sheet edit; fix read-mode category "-" (R36)
- [ ] 4.4 ColumnMapper/DuplicateResolver/PreviewStep stack at phone width (R24)

## Phase 5 — Overlays & feedback (R7, R28, R37, R39, R41)

- [ ] 5.1 UpdatePrompt → persistent sonner toast with Reload action; suppress install prompt while update pending (R7)
- [ ] 5.2 SyncIssuesPanel width clamp + badge position + shadcn buttons (R28)
- [ ] 5.3 `useHistoryBackClose` in sheet/dialog wrappers via router.history; TransactionFilterSheet → controlled; `useBlocker` on dirty transaction form (R37)
- [ ] 5.4 AlertDialog component + swap 5 window.confirm sites; authStore confirm lifted to component layer (R39, decision 6)
- [ ] 5.5 LoadingSpinner: `role="status"` + sr-only, used everywhere incl. AuthProvider; layout Skeletons for dashboard/transactions/accounts (R41)

## Phase 6 — Analytics & charts (R8, R18, R32, R33, R40, L)

- [ ] 6.1 Analytics FilterPanel → Sheet below @[1100px]; `placeholderData: keepPreviousData` (R8)
- [ ] 6.2 CategoryChart: gate slice onClick to hover-capable; real category IDs from processCategoryBreakdown; full legend on mobile (R18)
- [ ] 6.3 Remove Card-in-Card double wrapping in AnalyticsDashboard (R32)
- [ ] 6.4 Analytics tabs: text labels on phones + tabs-list height fix (R33)
- [ ] 6.5 Semantic income/expense/warning color tokens + sweep ~73 usages (R40)
- [ ] 6.6 Chart polish: shared cents-based axis tick formatter, structural chart skeletons, fix CategoryChart viewport `md:` → container query (L)
- [ ] 6.7 DELETE dead chart components (decision 5); fix `/analytics/categories` missing `<Outlet>` + Total Spending flex-wrap (L)
- [ ] 6.8 Category picker → Command combobox with search + Recents from Dexie (L)

## Phase 7 — Data layer & lifecycle (R10, R11, C1–C4)

- [ ] 7.1 `useInfiniteQuery` pagination + Dexie fallback paging; RPC for filter totals + exact count (R10, decision 4)
- [ ] 7.2 Offline coverage phase 1: `networkMode: 'always'` + typed OfflineError + explicit offline states (R11)
- [ ] 7.3 Offline coverage phase 2: dashboard aggregates from Dexie; add Dexie `budgets` store; TransferList offline path (R11)
- [ ] 7.4 Router `scrollRestoration: true` + verify virtualizer behavior (C1)
- [ ] 7.5 Session-expiry UX: SIGNED_OUT → navigate, toast, purge query cache (C2)
- [ ] 7.6 Landscape: pointer/orientation-aware isMobile or FAB in both branches (C3)
- [ ] 7.7 In-app refresh affordance + error-boundary reload (C4)

## Phase 8 — Bottom tab bar & PWA polish (R42, L)

- [ ] 8.1 Fixed bottom tab bar (Dashboard/Transactions/Budgets/Accounts), prefix-matched active state, safe-area padding; consolidate main bottom padding; reposition FAB (R42)
- [ ] 8.2 iOS splash screens via pwa-asset-generator `--dark-mode` (L)
- [ ] 8.3 PWA install prompt: iPad detection + FxiOS copy + timer cleanup (L)
