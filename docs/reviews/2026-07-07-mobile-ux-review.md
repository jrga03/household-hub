# Household Hub — Mobile UI/UX Review: Final Recommendations

> Date: 2026-07-07. Method: multi-agent review (9 dimensions: navigation, touch ergonomics,
> forms, tables/lists, overlays, viewport/PWA, charts, offline/sync UX, a11y/visual), every
> finding adversarially verified against the code by an independent agent that had to quote
> the cited lines. 81 raw findings → 60 after dedup → 58 confirmed, 2 refuted.

## Executive summary

The codebase has real mobile intent (safe-area CSS vars, a coarse-pointer 44px rule, container-query layout law in PageShell) but the phone experience currently breaks on its own core promises: the FAB's documented single-tap add is dead code, a transaction created while online vanishes from the list for minutes, failed syncs show a green "All synced" header, and an offline cold start renders a blank dashboard in an app whose pitch is "works offline". The transactions table, the busiest screen, has no mobile presentation at all: the amount column is pushed off-screen at 375px and the list silently caps at 100 rows. The good news is that nearly every fix reuses primitives already in-tree (Sheet, `useContainerNarrow`, the RecentTransactions card pattern, CurrencyInput, navStore's quick-add flag), and over half the confirmed findings are under an hour each. Priority order: restore trust in the sync/offline story and the add-transaction flow first, then the table/list presentation, then ergonomics and polish.

## Top recommendations

### High severity

**1. FAB primary tap path is hijacked; two of its three menu items are dead placeholders** — `small`
The FAB is the only add-transaction affordance on phones (the header button is `hidden md:flex`, `src/routes/transactions.tsx:107`), and its documented 1-tap path never fires: Radix's DropdownMenuTrigger toggles open on pointerdown before the Button's onClick guard runs (`src/components/layout/QuickActionButton.tsx:54-58, 79-104`). The long-press menu relies on `onContextMenu`, which iOS never fires on touch, and "Add Account"/"Add Category" open fake "coming soon" overlays (lines 135-159) with no role=dialog, focus trap, or Escape, despite working `AccountFormDialog`/`CategoryFormDialog` existing.
Fix: make the FAB a plain Button whose onClick calls `navStore.setQuickAddOpen(true)` (the same path as MobileNav's CTA, and the flag `AppLayout`'s `QuickAddTransactionDialog` already consumes). If shortcuts are kept, wire the real dialogs via controlled state as `accounts.tsx`/`categories.tsx` do, exposed through an explicit speed-dial, not onContextMenu. Delete the placeholder divs and the duplicate always-mounted `TransactionFormDialog` (line 130). Note: adding a transaction is currently possible in 2 taps, so the 1-tap contract is what's broken, not the capability.

**2. Draft Discard is unconfirmed, un-undoable in UI, and 4px from Edit/Confirm** — `small`
`handleDiscard` (`src/routes/drafts.tsx:93-101`) fires with no confirm and no Undo, with the Trash2 in a `gap-1` cluster next to the two most-used row buttons (lines 388-415); bulk "Discard Selected" (204-207) is equally unguarded next to bulk Confirm. Recovery means re-importing the whole PDF and losing per-row edits.
Fix: discard is already a soft status flip (`import-drafts.ts:108-124`), so Undo is nearly free: restore = set `draft_status` back to `"pending"` and decrement `importSessions.discarded_count`, surfaced via a Sonner action toast (`toast.success("Draft discarded", { action: { label: "Undo", ... } })`; sonner is already imported here). Alternatively `window.confirm` matches codebase precedent (`budgets/index.tsx:65`). Also: `gap-2`, `text-destructive` on Trash2, and replace `title` with `aria-label` on all three icon buttons (title tooltips never show on touch).

**3. Failed syncs are invisible: header asserts green "All synced" while data never reached the cloud** — `small`
`GlobalSyncStatus` hardcodes `hasFailures = false // TODO` (`src/components/sync/GlobalSyncStatus.tsx:47`) and `useSyncStatus` counts only `queued` items (`src/hooks/useSyncStatus.ts:35-39`), so an expense that hit an RLS/constraint error disappears from every surface. This is a false-positive integrity signal in a multi-device finance app.
Fix: add a `failedCount` liveQuery to `useSyncStatus` (`db.syncQueue.where("status").equals("failed")`, keeping the same `user_id` filter as pendingCount) and drive the red compact badge from it. Critically, the processor-side fix is mandatory: `processor.handleError` (`src/lib/sync/processor.ts:295-330`) must call `syncIssuesManager.logSyncFailure` on terminal failure, because item-level failures resolve `processQueue` normally and would never hit `useSyncProcessor`'s onError even if that hook were mounted. Also fix `TransactionList.tsx:311`, which maps failed items to a "pending" badge, and fire the one-time "1 change failed to sync" toast from `autoSync.triggerSync` when `result.failed` transitions above 0 to avoid per-item toast spam. The compact button's aria-label corrects itself for free.

**4. Dashboard SummaryCards truncate the headline peso amounts on phones** — `small`
`grid-cols-2` + `text-lg font-mono truncate` (`src/components/dashboard/SummaryCards.tsx:35, 44-46, 107-112`) leaves ~97px per amount at 390px (~82px at 360px, where even ₱1,234.56 truncates), so a normal month renders as "₱12,34…" with no recovery path on touch (no title/tooltip works there).
Fix: change the grid to `grid-cols-1 @[480px]:grid-cols-2 @[900px]:grid-cols-4` (the `@container` wrapper already exists at line 34, and container queries are project law per CLAUDE.md). If compact formatting (`formatPHPCompact` in `src/lib/currency.ts`) is preferred instead, the full value must go on a visible secondary line, not a `title` attribute. Either way, remove `truncate` from financial headlines.

**5. New Transaction is a tall centered modal that fights the soft keyboard, with Save below the fold** — `medium`
The FAB's primary action opens a 9-section (10 with debt preview) centered Radix dialog with `max-h-[90vh]` (`src/components/TransactionFormDialog.tsx:239`; `src/components/ui/dialog.tsx:55`): `vh` is the large-viewport unit on iOS so the bottom clips under the toolbar, the keyboard covers the lower half of a vertically-centered dialog, and Create sits ~8 field groups down with no sticky footer.
Fix: render as a bottom sheet on small screens using the existing `Sheet side="bottom"` (`src/components/ui/sheet.tsx:60`) keyed off `useIsMobile`, with `max-h-[85dvh] overflow-y-auto` added (SheetContent bottom is `h-auto`). Reorder to Amount → Type → Description → Category → Account, collapse Debt/Status/Visibility/Notes behind a "More options" disclosure, and make Cancel/Create a sticky footer inside the scroll container with opaque `bg-background` and `pb-[var(--safe-area-bottom)]`. Note: Radix auto-focuses the first focusable anyway, so removing `autoFocus` (line 285) alone won't stop the keyboard; the layout must change. At minimum swap 90vh → 90dvh here and in `CategoryFormDialog.tsx:134`.

**6. Transactions table has no mobile presentation; the amount is pushed off-screen** — `medium`
The same 8-column table renders at every width (`src/components/TransactionList.tsx:230-380`); fixed columns plus 44px-inflated action buttons consume ~350px of a 343px content area, `whitespace-nowrap` cells (`ui/table.tsx:72`) prevent wrapping, and Category/Account/Status are viewport-hidden below md/lg/sm, so the most important field in an expense tracker needs a horizontal scroll per glance.
Fix: conditionally render a card list below a container breakpoint using `useContainerNarrow` (`src/hooks/useContainerWidth.ts`, already used in `routes/transactions.tsx:56`), reusing the `RecentTransactions.tsx:35-80` row pattern, sharing the single `useVirtualizer` across both branches. Do NOT do CSS-only `@[700px]` hiding with one virtualizer: `measureElement` on `display:none` rows returns 0 heights and corrupts the virtualizer. Whole card tappable to `onEdit` matches the existing `handleRowClick` contract.

**7. Five uncoordinated fixed overlays fight for the bottom edge; toasts sit in the iOS home-indicator zone** — `medium`
Sonner mounts with defaults (`src/App.tsx:107`; sonner ≤600px CSS puts full-width toasts at 16px bottom, z-index 999999999, zero safe-area handling), so every "Transaction created" toast covers the FAB and sits in the home-gesture zone; UpdatePrompt and PWAInstallPrompt render at the identical fixed position (`UpdatePrompt.tsx:22`, `PWAInstallPrompt.tsx:118/173`) and overlap 100% when both pending; the SyncIssuesPanel badge (`SyncIssuesPanel.tsx:64`) paints over the FAB exactly in the offline-with-queued-changes scenario.
Fix: in `src/components/ui/sonner.tsx` pass `position="top-center"` or `mobileOffset={{ bottom: "calc(6.5rem + var(--safe-area-bottom))" }}` (mobileOffset confirmed in sonner 2.0.7 types; wrapper already spreads props). Convert UpdatePrompt to a persistent sonner toast with a Reload action; suppress the install prompt while an update is pending. For the SyncIssuesPanel badge, prefer the single bottom-overlay slot container over the bottom-left move (its expanded panel is `w-96` and would overflow ≤400px viewports when left-anchored; cap with `max-w-[calc(100vw-2rem)]` regardless). On iOS the prompt appears unconditionally after 3s and re-appears every 7 days, so that path matters most.

**8. Analytics filters render below 4-6 screens of dashboard on phones** — `medium`
Below the `@[1100px]` container grid (`src/routes/analytics.tsx:94-107`) the FilterPanel lands after 10 cards; applying filters swaps the dashboard to a full-height spinner and dumps results back at the top, out of view.
Fix: below `@[1100px]`, hide the inline panel (`hidden @[1100px]:block`) and expose it via a shadcn Sheet triggered next to the TabsList (`@[1100px]:hidden`), mirroring `TransactionFilterSheet` (that one is `side="left"`; `side="bottom"` is a fine deliberate deviation for thumb reach). Also add `placeholderData: keepPreviousData` to `useAnalytics.ts:96` so applying filters keeps the previous dashboard visible instead of collapsing to the spinner; that helps desktop too.

**9. Transaction created while ONLINE never appears in the list (local-write / server-read race)** — `medium`
Quick-add writes only to Dexie + outbox, then invalidates `["transactions"]` (`TransactionFormDialog.tsx:224`); online, `useTransactions` fetches Supabase (`supabaseQueries.ts:456-516`) before the outbox drains (drain only happens on focus/online events or a 5-min timer, `autoSync.ts:233-245`), and nothing invalidates queries after sync. The user sees "Transaction created", opens the list, and it isn't there, possibly for minutes. Perceived (not actual) data loss, but on the core flow.
Fix, two parts: (1) the load-bearing one, overlay unsynced Dexie rows in `useTransactions`' queryFn after the Supabase fetch, reusing the filter-mirroring logic already in `lib/offline/reads.ts` (`getLocalTransactionsWithRelations`); (2) in the submit handler (which already has `useQueryClient`) fire-and-forget `syncProcessor.processQueue(user.id).then(() => queryClient.invalidateQueries({ queryKey: ["transactions"] }))`, or move the QueryClient to `src/lib/queryClient.ts` for processor-side invalidation. The same gap affects `["accounts"]`/`["dashboard"]` after sync; fix in the same pass. Note `AutoSyncManager.triggerSync` is private; a public `requestSync()` would be new API.

**10. Hard 100-row cap with no pagination: list and counts silently wrong past 100 transactions** — `large`
`query.limit(100)` (`src/lib/supabaseQueries.ts:513`) with no next-page, no indicator; the "N transactions" count under-reports and select-all covers only the loaded 100. The Dexie fallback has the identical cap (`offline/reads.ts:78`). Silently missing financial records in a finance app.
Fix: convert to `useInfiniteQuery` with `.range()` pages, trigger `fetchNextPage` when the last virtual index approaches `rows.length`, and mirror paging in the Dexie fallback. Caveats from verification: PostgREST aggregate functions are disabled by default on Supabase, so the filter-summary totals almost certainly need an RPC, and the count label needs its own `count: 'exact', head: true` query (or the same RPC); paging alone fixes neither number.

**11. Offline cold start: blank Dashboard, false-empty Budgets (paused queries, no Dexie fallback)** — `large`
Only accounts/categories/transactions have the fallback + `networkMode: 'always'`; everything else pauses at `pending/paused` with data undefined (`main.tsx:22-31`), so the PWA start screen hits `if (!data) return null` (`routes/index.tsx:57-59`) and renders blank, and Budgets renders a false "no budgets" empty state (`budgets/index.tsx:138`). The OfflineBanner does show, but its "all data is saved locally" copy contradicts the blank page. Correction from verification: the transfers-page gap is `TransferList`/`useTransfers` (`src/components/transfers/TransferList.tsx:7`), not the route's accounts query, which works offline.
Fix, phase 1 (cheap): `networkMode: 'always'` + a typed OfflineError via `isLikelyNetworkError` + explicit offline states per route, matching the existing pattern. Phase 2: compute dashboard aggregates from Dexie (all inputs exist in `db.transactions`/`accounts`/`categories`); budgets need a Dexie `budgets` store added first, since targets are not mirrored locally today (only actuals are computable).

### Medium severity

**12. Per-keystroke history pushes make back-gesture replay filter states** — `small`
Typing "grocery" in the filter sheet creates 7 history entries (`TransactionFilters.tsx:77-80`; `transactions.tsx:80-82` navigates without replace). Fix: `replace: true` in `updateFilters`' navigate (transactions.tsx:81). Skip the `useSelectedItem` changes: that path is desktop-only and its `replace: false` is documented intent.

**13. No bottom inset for the FAB; last rows' amounts permanently covered** — `small`
Mobile `<main>` has no bottom padding (`AppLayout.tsx:115-117`) under an ~80px FAB footprint (~21% of a 375px row's right side). Fix: `pb-[calc(5.5rem+var(--safe-area-bottom))]` on the mobile `<main>`, in the layout so non-PageShell routes (budgets/, categories, drafts, transfers) are covered too.

**14. Transaction rows are not tappable; the documented row-click contract is unwired** — `small`
`handleRowClick` exists (`transactions.tsx:84-91`) but `TableRow` has no onClick (`TransactionList.tsx:274-287`); on phones the only way into a transaction (and its hidden Category/Account/Status) is the pencil icon. Fix: `onClick={() => onEdit(transaction.id)}` on TableRow with `stopPropagation` on the checkbox, the status-toggle button (lines 342-353), and both action buttons; add `cursor-pointer` and keyboard access (it's a `tr`). This also restores the intended wide-layout detail-pane behavior; the second consumer (`accounts/$accountId.tsx`) passes a no-op onEdit so it's harmless there.

**15. 16px checkboxes are the sole selection target; coarse-pointer rule covers only buttons** — `small`
The real target is exactly 16x16 (cell padding isn't clickable) in `TransactionList.tsx:288-296` and `drafts.tsx:243-248`, and status-toggling on <sm phones is gated behind selection. Fix: extend the `index.css` coarse-pointer block with a `::after { inset: -14px }` hit-area expansion on `[data-slot="checkbox"]`/`[data-slot="radio-group-item"]` (min-height would distort the visual); add aria-labels to the drafts checkboxes while there. DuplicateResolver radios are partially mitigated by their htmlFor Labels.

**16. Zero touch press feedback anywhere** — `small`
Tap highlight is disabled (`index.css:133-134`), Tailwind v4 gates `hover:` off touch, and only the FAB defines `active:`. Fix: add `active:` variants to `buttonVariants` (`ui/button.tsx:12-19`) and MobileNav rows, mirroring the repo's own sidebar pattern (`active:bg-sidebar-accent`). Do not un-gate hover; that reintroduces the sticky-hover problem `index.css:150-155` deliberately suppresses. Form double-submit is already guarded (`TransactionFormDialog.tsx:503`), so this is app-wide perceived responsiveness, not data risk.

**17. Mobile header sync button is ~28x32px and is the ONLY way to open SyncQueueViewer on a phone** — `small`
Raw `<button>` in `GlobalSyncStatus.tsx:111-128` misses the data-slot rule. Fix: `variant="ghost" size="sm"` plus `min-h-11 min-w-11` (not `size="icon"`, which forces a square and breaks the pending-count badge case). The default variant at line 179 is unmounted; converting it is cleanup only.

**18. Pie slice tap navigates instead of showing the tooltip; analytics mount navigates to an empty list** — `small`
First touch fires onClick (`CategoryChart.tsx:82-93`), and worse, `AnalyticsDashboard.tsx:60-61` synthesizes fake IDs (`category-${index}`) so analytics-page taps land on `/transactions?categoryId=category-0` with zero results. Fix: gate slice onClick behind `useMediaQuery("(hover: hover)")` (the existing hook takes arbitrary queries; no new hook needed), keep navigation on legend rows, render all categories in the legend on mobile (currently top 5 of up to 10), and thread real category IDs through `processCategoryBreakdown`.

**19. Account initial balance and Budget amount open the full QWERTY keyboard** — `small`
Bare `type="text"` with no inputMode (`AccountFormDialog.tsx:195-200`, `BudgetForm.tsx:116-119`) while every other money field uses CurrencyInput. Fix: CurrencyInput via Controller as `TransferForm.tsx:136-145` does; this also requires changing the zod field from string-refine to numeric cents (e.g. `z.number().int().min(0).max(999999999)`) and updating defaults; CurrencyInput's own ₱ prefix and error rendering make BudgetForm's manual prefix span redundant. Fallback: `inputMode="decimal"`.

**20. DatePicker is a three-layer overlay around an unstyled native date input** — `small`
Button → Popover → tiny UA-styled input → OS wheel, and the popover never auto-closes (`ui/date-picker.tsx:45-72`). Fix: render the shared `<Input type="date" max={...}>` directly as TransferForm:151 does, preserving `handleDateChange`'s future-date guard and Date|undefined Controller contract. Fix the adjacent `new Date("yyyy-MM-dd")` UTC-midnight parse in the same pass. (The iOS-zoom sub-claim was overstated; the taps and stuck popover are the real cost.)

**21. TransferForm defaults the date to the UTC day: wrong before 8am for a UTC+8 user base** — `small`
`new Date().toISOString().split("T")[0]` at `TransferForm.tsx:48, 74`. Fix: `format(new Date(), "yyyy-MM-dd")` (date-fns, the established pattern at `TransactionFormDialog.tsx:150`), plus update `src/components/transfers/README.md:365`, which documents the buggy snippet as the reference. Add a unit test. (`authStore.ts:168` has the same expression but only for a CSV filename; ignore.)

**22. CurrencyInput commits only on blur: Enter-submit validates a stale ₱0, debt preview lags** — `small`
`handleChange` never calls onChange (`ui/currency-input.tsx:53-74`). Fix: try `parsePHP` on change with a silent catch and call `onChange(cents)` when it parses (verified safe: parsePHP handles partials, and the format-on-blur effect is gated on `!isFocused`, so it won't clobber typing). One-component fix repairs four forms (TransactionFormDialog, TransferForm, both debt forms); the Enter bug hits desktop too.

**23. Form Select triggers render as content-width chips; 32px color swatches** — `small`
`w-fit` in `select.tsx:32` with no width passed anywhere on the money path. Fix: `className="w-full"` on every form SelectTrigger (also TransferForm, CreateInternalDebtForm, TransactionFilters, ColumnMapper, CategoryFormDialog, which the original finding undercounted), extend the coarse-pointer rule to `[data-slot="select-trigger"]` (this will also inflate drafts.tsx's compact h-8 triggers on touch; acceptable but eyeball that screen after), bump swatches to `size-11`/44px hit areas, and have AccountFormDialog reuse the shared ColorPicker.

**24. CSV import mapper and duplicate resolver don't stack at phone width** — `small`
`grid-cols-[200px_1fr]` (`ColumnMapper.tsx:75`) leaves ~127px per Select at 375px; `grid-cols-2` (`DuplicateResolver.tsx:65`) cramps comparison. Fix: `grid-cols-1 gap-1 sm:grid-cols-[200px_1fr]` and `grid-cols-1 gap-2 sm:grid-cols-2` (import.tsx doesn't use PageShell, so viewport `sm:` is acceptable here). PreviewStep (`pdf-import/steps/PreviewStep.tsx:57-122`) needs card-stacked labeled inputs on narrow, since all its columns are editable and can't be hidden. (The radio tap-target sub-claim was mostly mitigated by htmlFor Labels.)

**25. Account detail page: transaction Edit is a silent no-op** — `small`
`onEdit={(_id) => { /* TODO */ }}` (`accounts/$accountId.tsx:102-105`); on phones Edit and Delete are the only visible row actions, and Delete works while Edit doesn't. Fix: `editingId`/`isFormOpen` state + `<TransactionFormDialog>` exactly like `routes/transactions.tsx`, but unconditional (no isNarrow split needed here); existing mutation hooks already handle account-scoped invalidation.

**26. SyncQueueViewer's Refresh is a literal placebo; no wired "Sync now"** — `small`
Refresh invalidates `["sync-queue","pending"]` while the query key is `["sync-queue","outstanding"]` (`SyncQueueViewer.tsx:56, 145-155`), so it does nothing but toast; `useSyncProcessor` (the ready-made Sync Now) is mounted by zero components. Corrections: Retry/Retry All are NOT placebos (they call `processQueue`, draining the whole queue), and focus/visibility/5-min triggers exist but are undiscoverable. Fix: wire `useSyncProcessor` into the viewer footer as "Sync now", and prefer converting the viewer's list to Dexie `useLiveQuery` (pattern in `TransactionList.tsx:50`, `useSyncStatus.ts:33`) over fixing invalidation keys; that kills the Refresh button and the 10s poll entirely. If keeping useQuery, invalidate the `["sync-queue"]` prefix.

**27. DialogContent has no max-height/scroll; AccountFormDialog and BudgetForm can clip their submit buttons** — `small`
`dialog.tsx:55` sets no max-h; AccountFormDialog (~480-530px) clips in landscape or with keyboard/errors, BudgetForm in landscape. Fix once in the primitive: `max-h-[calc(100dvh-2rem)] overflow-y-auto` on DialogContent, then delete the per-dialog `max-h-[90vh]` copies. Portal-rendered Select/Popover children are unaffected; note the absolute close button will scroll with content (acceptable, or use an inner scroll wrapper).

**28. SyncIssuesPanel is wider than small phones, contests the FAB corner, has ~20-24px raw buttons** — `small`
`w-96` right-anchored clips the LEFT ~25px (status icons, Clear All) at 375px (`SyncIssuesPanel.tsx:64, 82`). Fix: `w-[min(24rem,calc(100vw-2rem))]` (ideally minus `--safe-area-right`) or a full-width Sheet like SyncQueueViewer (which is a right-side sheet with `w-full sm:max-w-lg`, not bottom); lift the collapsed badge above the FAB; rebuild header/row controls with shadcn `Button size="icon"` so they inherit the 44px floor. (Dark mode works; the gray-\* classes are a consistency nit only.)

**29. StorageWarning renders under the mobile header and collides with OfflineBanner** — `small`
`fixed top-16` with no safe-area term (`App.tsx:100`); the collision is not notch-specific: at 64px OfflineBanner fully paints over StorageWarning on any phone when offline + storage ≥80%. Fix: `top-[calc(4rem+var(--safe-area-top))]` matching OfflineBanner, and put both banners in one shared fixed container (`flex flex-col gap-2`) so they stack; note OfflineBanner is itself position:fixed, so "move into flow below it" doesn't work as originally stated. z-50 is unnecessary once the calc fix lands.

**30. Manifest "Add Transaction" shortcut points at a nonexistent route** — `small` (adjusted high → medium)
`/transactions/new` doesn't exist (`vite.config.ts:65`); the not-found renders inside the app shell (not a bare dead end) and only installed-PWA icon shortcuts hit it, hence medium. Fix: add a real route `src/routes/transactions.new.tsx` whose beforeLoad calls `useNavStore.getState().setQuickAddOpen(true)` and throws `redirect({ to: "/transactions", replace: true })` (mirrors the dashboard.tsx legacy-redirect pattern, and fixes existing installs whose OS cached the manifest). If adding a search param instead, note `transactions.tsx`'s validateSearch is hand-rolled, not zod. Add a styled root `notFoundComponent` as a safety net.

**31. theme-color #1e40af and manifest colors match no UI surface and never adapt to dark mode** — `small`
Primarily an Android PWA issue (iOS is partially covered by black-translucent + the header's safe-area padding). Fix: paired `<meta name="theme-color" media="(prefers-color-scheme: ...)">` metas (#ffffff / #0a0a0a matching `--background`), manifest `theme_color: "#ffffff"`, plus a tiny ThemeColorSync component inside ThemeProvider rewriting the meta from `resolvedTheme` (needed because the in-app toggle, not just system, drives theme; keep the media metas for the pre-hydration window). manifest background_color can't adapt; pick a compromise.

**32. Analytics Card-in-Card doubles borders/titles/padding, squeezing charts to ~200px** — `small`
Fix: remove the outer Card/CardHeader wrappers in `AnalyticsDashboard.tsx:115-160` and let MonthlyChart/CategoryChart's own Cards stand (they must stay; both are used standalone on the dashboard). Also covers BudgetProgressChart, which is double-wrapped too (lines 153-159); drop the redundant empty-state branch at 132-138 (CategoryChart has its own); keep YearOverYearChart's outer Card, it's the only chart without a self-wrapping Card.

**33. Analytics tabs are icon-only on phones: unnamed for screen readers, ~29px tall** — `small`
Fix: drop `hidden sm:inline` on the labels (`analytics.tsx:71-79`; the grid TabsList already gives ~110px-wide triggers; hide the icons on narrow instead since "By Category" is tight). If extending the coarse-pointer rule to `[data-slot="tabs-trigger"]`, pair it with `[data-slot="tabs-list"] { height: auto }` or the fixed h-9 list overflows. (SRs announce unnamed tabs, "tab 1 of 3" with no name; the pattern doesn't recur elsewhere.)

**34. No prefers-reduced-motion handling anywhere** — `small`
Zero guards in src/ and zero in tw-animate-css; every dialog/sheet zoom+fade plays for Reduce Motion users of a many-times-daily PWA. Fix: the blanket `@media (prefers-reduced-motion: reduce)` block in `index.css` @layer base with `0.01ms` durations (deliberately not 0s: Radix animate-out waits on animationend, which can fail to fire at exactly 0s). Optionally swap spinners to `motion-safe:animate-spin` so they stay perceivable.

**35. Icon-only action buttons have no accessible name on core screens** — `small`
Status toggle/Edit/Delete rows (`TransactionList.tsx:341-374`), MonthSelector chevrons, BudgetCard actions, three dismiss X's all announce as "button". Fix: ~10 one-line dynamic aria-labels using row context (the codebase's own idiom, e.g. `TransactionList.tsx:294`; `OfflineBanner.tsx:148` is the template for the X's). Note the status toggle is sm+ only, so its label gap doesn't affect phones.

**36. Drafts review on phones hides the Account/Category inline-edit selects entirely** — `medium`
The edit-mode `<Select>`s live in `hidden md:table-cell` cells (`drafts.tsx:302-343`), so below 768px a user reviewing PDF imports cannot correct account or assign category (the wizard's AccountMapStep does stamp a user-chosen account on every draft, so imports aren't mis-filed by default, but per-row correction and categorization are impossible; category must be fixed post-confirm). The read-mode Category cell renders a hardcoded "-" even on desktop. Fix: stacked card list below a container breakpoint (the `accounts.tsx` isNarrow pattern; `useContainerNarrow` exists) with a bottom Sheet for editing the full field set. Absolute minimum: remove `hidden md:table-cell` from the two select cells while a row is in edit mode.

**37. Overlays ignore hardware/gesture back; back can exit the PWA with a half-typed expense on screen** — `medium`
No popstate/pushState/useBlocker anywhere in src. Fix: a `useHistoryBackClose(open, onClose)` hook centralized in the `ui/sheet.tsx`/`ui/dialog.tsx` wrappers (covers future overlays), using `router.history` rather than raw window.history since TanStack Router owns history; TanStack's `useBlocker` is the idiomatic guard for the unsaved transaction form specifically. Prerequisite: `TransactionFilterSheet` is currently uncontrolled and must be converted to controlled open state first. Cheap safety net: close the drawer on pathname change in the existing `AppLayout.tsx:51-53` effect.

**38. Row tap goes straight into the edit form; filtered In/Out totals unreachable below @[1500px]** — `medium`
No read-only inspection path on phones, and the filterSummary computed in the route (`transactions.tsx:71-78`) is thrown away on narrow layouts. Fix: extend the count row (`transactions.tsx:122-129`) with formatPHP totals gated `@[1500px]:hidden` (matches the existing `@[1100px]:hidden` element there), and show a read-only bottom Sheet on row tap with an explicit Edit button. Two prerequisites: export `TransactionDetailContent` (currently a private function in TransactionDetailPane.tsx), and key the sheet-vs-pane decision off the existing `useContainerNarrow(1500)` isNarrow, not a viewport query, or the UI-05 dead zone reappears.

**39. All destructive confirmations are window.confirm** — `medium`
Five sites (`TransactionList.tsx:103, 145`, `SyncQueueViewer.tsx:173`, `budgets/index.tsx:65`, `authStore.ts:158`) plus a doc example propagating it. Fix: add shadcn AlertDialog and swap the call sites; give it the DialogContent max-h/dvh treatment (depends on that fix landing). Skip the toast-Undo alternative for transaction deletes: delete is not a plain row removal (signed debt-payment reversal rows, transfer-leg cascades, immediate outbox drain), so undo is not cheap. The authStore case can't be a drop-in swap; lift the confirm into the component layer (`signOut({ exportFirst })` or a split API).

**40. Income/expense/warning colors fail WCAG AA on primary financial data; dark: variants inconsistent (47 missing vs 26 present)** — `medium`
green-600 on white is ~3.3:1 and yellow-600 ~2.9:1 (light-mode red-600 actually passes at ~4.8:1; dark-mode red-600 on card fails at ~3.7:1, including the Net Amount card). The 24px-bold AnalyticsDashboard totals pass as large text; the real failures are the 14-16px amounts in RecentTransactions/TransactionList, 12px percent lines in SummaryCards, and yellow at-risk budget text. Fix: semantic tokens `--color-income/--color-expense/--color-warning` in the existing `@theme inline` block (green-700/red-700/yellow-700 light, -400 dark, matching TransactionList's existing pattern), then sweep the ~73 raw usages.

**41. Route loading is a copy-pasted unlabeled spinner on 10+ screens; the in-tree LoadingSpinner and Skeleton go unused** — `medium`
The dashboard, TransactionList, budgets, and AuthProvider (`AuthProvider.tsx:16`, every app boot) are truly silent; five other routes at least have visible "Loading..." text. Fix: put `role="status"` + sr-only text inside LoadingSpinner itself (aria-label on an SVG alone is unreliable) and use it everywhere including AuthProvider; then layout-shaped Skeletons for dashboard/transactions/accounts so headers paint immediately.

**42. No bottom tab bar: all navigation is a top-left hamburger, with links starting ~250px down the drawer** — `large`
For daily bouncing between Dashboard/Transactions/Budgets, the highest-frequency navigation is in the least reachable spot with zero glanceable wayfinding. Fix: fixed bottom bar in AppLayout's mobile branch (Dashboard, Transactions, Budgets, Accounts) with Router `Link` + activeProps, `pb-[var(--safe-area-bottom)]`, 44px+ targets; keep the drawer for the long tail. Two verifier additions: the mobile `<main>` needs bottom padding equal to the bar height (fold into finding 13's token), and active state must prefix-match via activeOptions so `/transactions/:id` keeps the tab lit (replicating MobileNav's `isActiveRoute`). Reposition or embed the FAB.

### Low severity (one-liners with fixes)

- **Drawer nav rows ~40px, SettingsNav ~36px**: add `min-h-11` to the shared row class in MobileNav (3 spots) + SettingsNav anchors; don't broaden the CSS rule to `nav a` (would add unintended min-width). `small`
- **Mobile header never shows the page title**: reuse PageTitle (`AppLayout.tsx:208-229`) but give it an `as` prop rendering `<span>` in headers, or you duplicate the page h1 (the tablet branch already has that wart). `small`
- **MonthSelector "Current" hidden on phones**: drop `hidden sm:inline-flex` (`MonthSelector.tsx:44`); both hosts are `flex flex-wrap` so it wraps safely. State is transient useState, so users are inconvenienced, never stuck. `small`
- **Sync detail tooltip-only on touch**: render "Last sync Xm ago" inline in MobileNav (pending count is already an inline Badge). Drop the SyncBadge-failed part: `TransactionList.tsx:311` never passes "failed", the real gap is failed state not being wired to rows at all (see finding 3). `small`
- **Select/dropdown rows ~32px**: extend the coarse-pointer block with `min-height: 44px` on `[data-slot="select-item"]`, `[data-slot="dropdown-menu-item"]`, plus the checkbox-item/radio-item/sub-trigger slots that share the same geometry. `small`
- **YearOverYearChart raw Y-axis ticks**: shared `formatPHPAxisTick` in currency.ts, but make it take CENTS and adjust callers, since MonthlyChart/YearOverYear pass pesos while SpendingTrends/IncomeExpenses pass cents, a 100x trap when consolidating. `tick={{ fontSize: 12 }}` matters more than `width`. `small`
- **Dashboard chart skeleton mismatch (~80-200px shift on cold load)**: structural Card-shaped fallback (`<Card className="p-4 sm:p-6"><Skeleton h-7 w-40 mb-4/><Skeleton h-[280px]/></Card>`) instead of a magic height (real height is ~358px, not 372); CategoryChart's is data-dependent, target the populated case. Also: CategoryChart uses viewport `md:` inside the rail, contradicting the container-query rule. `small`
- **Dead chart components with fixed 400px sizing**: delete CategoryInsightsDashboard + the three orphan charts (tree-shaken today, so no bundle impact; BudgetProgressCard is dead but has no sizing problem), or fix to @container-driven heights before ever mounting. `small`
- **Offline create toast doesn't say "saved locally"** (adjusted medium → low; OfflineBanner covers it by default and the header badge increments): branch on `useOnlineStatus` in onSubmit for a "Saved on this device, will sync" toast; extend to update/delete toasts; Account/Category dialogs write straight to Supabase so out of scope. `small`
- **MobileNav's SyncIndicator is stale and can contradict the header**: swap for `<GlobalSyncStatus variant="detailed" />` (drop-in, tappable, live outbox); SyncIndicator is also in `AppSidebar.tsx:219` with the same staleness, and its mount effect can clobber a live "syncing" status, so remove rather than refactor. `small`
- **Category analytics "Total Spending" can overflow at 320-375px**: `flex-wrap` + text-2xl is the load-bearing fix (min-w-0 alone can't break a mono currency token). Bigger catch from verification: `/analytics/categories` is effectively dead, `routes/analytics.tsx` renders no `<Outlet>`, so the sidebar link shows only the tabs page. File that as its own bug. `small`
- **Inert first-run empty states**: add CTAs with existing wiring (`setIsFormOpen(true)` in accounts.tsx, `navStore.setQuickAddOpen` in TransactionList's no-data branch, which matters most on phones where the header Add button is `hidden md:flex`). `small`
- **PWA install prompt never shows on iPad; Firefox-iOS copy wrong**: add `ua.includes("Macintosh") && navigator.maxTouchPoints > 1` to detection; Chrome-iOS share sheet has had Add to Home Screen since 16.4, so only FxiOS copy is off; clearTimeout the two timers as hygiene. `small`
- **No iOS splash screens (referenced assets don't exist)**: pwa-asset-generator with `--dark-mode` (emits a prefers-color-scheme dark link set, properly fixing the dark flash) into public/splash/, or delete the dead `splash/*.jpg` glob in `vite.config.ts:25`. `medium`
- **Category picker: no search, no recents on touch** (desktop has Radix typeahead): Popover + Command combobox with a Recent group derived from the Dexie transactions table; fixes three surfaces at once (CategorySelector, TransactionFilters, BudgetForm); consider prefilling from the last expense. `medium`

## Quick wins (under ~an hour each)

- `replace: true` in `updateFilters` navigate (`transactions.tsx:81`)
- `pb-[calc(5.5rem+var(--safe-area-bottom))]` on the mobile `<main>` (`AppLayout.tsx:115`)
- TransferForm UTC date → `format(new Date(), "yyyy-MM-dd")` + README fix
- 90vh → 90dvh in TransactionFormDialog/CategoryFormDialog (stopgap for finding 5)
- `max-h-[calc(100dvh-2rem)] overflow-y-auto` on DialogContent primitive
- Sonner `position` / `mobileOffset` one-liner in `ui/sonner.tsx`
- `min-h-11` on MobileNav rows + SettingsNav anchors
- Coarse-pointer CSS: select-item/dropdown-item min-height; checkbox/radio ::after hit expansion; select-trigger inclusion
- `w-full` on form SelectTriggers (all forms)
- prefers-reduced-motion block in index.css
- `active:` variants in buttonVariants + MobileNav rows
- ~10 aria-labels on icon-only buttons
- Paired theme-color metas (+ ThemeColorSync soon after)
- StorageWarning `top-[calc(4rem+var(--safe-area-top))]`
- MonthSelector: drop `hidden sm:inline-flex`
- Account detail onEdit wiring (state + dialog, pattern exists)
- GlobalSyncStatus compact button sizing
- failedCount liveQuery + hasFailures TODO replacement (the header half of finding 3)
- Row onClick wiring in TransactionList (finding 14)
- Draft discard Undo toast (status flip + counter decrement)
- SummaryCards container-query grid + remove truncate
- Empty-state CTAs
- Swap MobileNav SyncIndicator for GlobalSyncStatus detailed

## Gaps flagged by completeness critic

1. **No scroll restoration (high)**: `createRouter({ routeTree })` at `src/App.tsx:14` with no `scrollRestoration: true`; TanStack Router v1 neither restores nor resets by default. Scroll position bleeds into newly-pushed routes, and back-nav loses list position (the virtualized list remounts from the top). One-line router option plus verifying virtualizer behavior.
2. **No session-expiry UX on a resident PWA (high)**: the only /login redirect is the navigation-time `beforeLoad` guard (`src/routes/__root.tsx:111-118`); `onAuthStateChange` (`src/stores/authStore.ts:93-98`) writes state only, no navigation, no toast, no query-cache clear on SIGNED_OUT. A PWA resumed after days shows cached financial data and accepts edits whose sync will fail (compounding finding 3), and remote sign-out doesn't purge the cache on a shared phone.
3. **Landscape rotation swaps the whole navigation model and deletes the FAB (high)**: mobile is `max-width: 767px` (`src/hooks/useMediaQuery.ts:72`); landscape iPhones are 812-932px wide, so `AppLayout.tsx:70` renders the tablet branch: no QuickActionButton (mobile-branch-only, line 120), no MobileNav, sidebar collapsed. Consider a pointer/orientation-aware isMobile, or render the FAB in both branches under a coarse-pointer condition.
4. **Pull-to-refresh disabled with no replacement (medium)**: `overscroll-behavior: none` (`src/index.css:137-140`) plus zero gesture handlers in src; in standalone mode there is no reload button, so a wedged screen requires force-killing the app. Distinct from finding 26 (outbox push vs read refresh). An in-app refresh affordance or error-boundary reload button is the minimum.
5. **No notFoundComponent (medium)**: zero hits; any bad deep link in the installed PWA renders TanStack's bare default text. Overlaps finding 30's safety-net item; fix once at the root route with a styled component.
6. **No swipe actions or haptics anywhere (low)**: the only gesture handler in src is the FAB's onContextMenu; `vibrate` exists only in SW push payloads (`src/sw.ts:123,138`). Optional, but swipe-to-reveal on transaction/draft rows is the standard mobile alternative to the tiny edit/delete buttons.
7. **Search inputs lack `type="search"`/`enterKeyHint` (low)**: `src/components/TransactionFilters.tsx:211-216`; keyboards show generic "return", no iOS clear affordance, and Enter does nothing since it's not in a form.

(The critic's Supabase email-confirmation deep-link question was explicitly unverified and depends on config outside the repo; not filed.)

## Refuted / not issues

- **"/analytics/categories is orphaned on mobile"**: refuted as an impact claim; the mobile nav intentionally links /analytics only. (Separately, the route is dead on ALL platforms due to the missing `<Outlet>`; see the low-severity overflow item.)
- **"Mobile filter sheet cannot scroll"**: refuted; `TransactionFilterSheet.tsx:25`'s `overflow-y-auto` div is a valid flex-child scroll container inside the full-height SheetContent.

## Decisions needed

1. **SummaryCards: single-column grid vs compact formatter** — recommended default: the container-query grid (keeps full precision, wrapper already exists).
2. **Keep FAB secondary actions at all, or make it a single-action button** — recommended default: single action (quick-add); Account/Category creation lives in MobileNav and their own pages.
3. **Bottom tab bar (large effort) now or after the small/medium batch** — recommended default: after; findings 1, 13, and 42 interact (FAB position, main padding), so sequence the tab bar last and fold the padding tokens together.
4. **filterSummary totals: enable PostgREST aggregates vs RPC** — recommended default: RPC (aggregates are disabled by default on Supabase and the count label needs a server answer anyway).
5. **Dead chart components: delete vs keep for a planned insights dashboard** — recommended default: delete; they duplicate live charts and re-adding fixed-size components later is a known trap.
6. **window.confirm sweep: all five to AlertDialog vs leaving sign-out for later** — recommended default: all five, with the authStore one done as the small component-layer refactor described in finding 39.
