# UI overhaul

Status: scoped 2026-10-13 in a grilling session. Runs before #99 (drafts and review), which then builds onto the Review screen. Spec: #106. Folds in #102.

## Context

- The create-or-join screen ignores the safe area, so it collides with the Dynamic Island, and stacks both forms at once.
- Home mixes finances with household admin and account management.
- Transactions shows filters, totals, a needs-category link, an always-visible select row, and a status badge plus trash icon on every row.
- Forms are centered dialogs with no keyboard handling (no `visualViewport`, `interactive-widget` or `enterKeyHint`).
- Every route draws its own title and description block, while the phone header always says "Household Hub".
- The Categories screen combines defining categories, allocating money and tracking spend in one view, with `/distribute` on the side.
- The phone drawer puts the email above the links.

The app is used mostly on phones; desktop must stay good but gets no separate layout for now.

## Decisions & Deferrals

- **One plan, seven issues.** #107 shipped on its own (PR #115). Changed 2026-10-13: the remaining six are built together with `/implement-spec` on the integration branch `feat/106-ui-overhaul` (parallel worktree agents along the blocked-by graph, one PR closing all of them), not one per session. Why: the user chose it. Revisit: never.
- **#99 shipped before the overhaul** (PR #113, drafts reviewed on `/import`). So #110's Review screen gets an "Imported drafts" section that shows the draft count and links to `/import`; it doesn't move the draft review UI. Revisit: if reviewing drafts inline on `/review` is wanted.
- **#102 is folded in** as the Accounts + Household issue. Accounts get `/accounts` (the current card, moved); tapping an account opens Transactions filtered to it. Revisit: never.
- **Deferred: the per-account register.** Revisit: unchanged from the re-architecture plan.
- **Phone nav: bottom tabs are Home and Transactions, plus the existing FAB.** The drawer holds Budget, Review, Accounts, Import, Categories, Settings, with email and sign out pinned at the very bottom. The desktop sidebar uses the same items as a daily group and a manage group. Why: keep the tab bar small for now. Revisit: if Budget or Review proves to be a daily destination.
- **The header shows the page title**: the household name on Home, the page name elsewhere. It has a back arrow on pushed screens, a right-side actions slot (month picker, Edit plan, Select) and the sync icon. In-page title and description blocks are removed; descriptions survive only in empty states. The "HH" badge and "Household Hub" text remain only in the drawer header.
- **Home is finances-only for now**: Review banner (when items exist), opening checklist, This month, Budgets, Balances, Latest. Household (name, code), Join requests and Members move to Settings → Household. Balances link to the account on `/accounts`. Revisit: when non-finance sections (todos) arrive.
- **Review is its own route** (`/review`): uncategorized expenses, imported drafts (#99, later) and owner-only join requests. Each section hides when empty, and the page shows an all-clear state at zero. The count is the sum of all sections. It shows on the drawer entry, as a dot on the hamburger and in the Home banner.
- **Transactions is filters + list only.** The Totals block and the needs-category link are removed (that link moves to Review). Filters stay collapsed behind one button on phones.
- **Rows sit under sticky date headers** (Today, Yesterday, Mon Oct 12). Line 1 is description and signed, colored amount; line 2 is category · account, muted; transfers get an icon. Rows have no checkbox, trash icon or status badge.
- **Pending rows are muted, with a Lucide `Info` icon before the amount** (accessible label "Pending"). There is no background color, because color alone fails WCAG 1.4.1. Warning icons are reserved for Review-type problems. Cleared rows look normal.
- **Status stays.** Swipe right _reveals_ "Mark cleared/pending" and swipe left _reveals_ "Remove"; both need a tap. The row snaps back on scroll or on a tap elsewhere. Bulk "Mark" buttons are removed.
- **Remove asks for confirmation** ("Remove 'Lunch' ₱250?"; bulk shows the count), and the existing undo toast is kept.
- **Selection mode**: entered by long-press or a header "Select" button. The header becomes "N selected ✕", and a bottom action bar (Category, Remove) replaces the tab bar and FAB. On desktop the bar sits at the bottom of the list column.
- **Description is required** for new and edited transactions, enforced in the command, never the decoder. Old events with empty descriptions still decode and show the amount as their label until edited. Imports keep the statement description. Transfers stay optional with an auto label ("Transfer to BPI").
- **Budget splits into three screens.** Categories (setup) defines groups and categories, with no money figures and Suggested categories shown when empty. Budget (view-only) shows allocated / spent / left per category with a progress bar and group totals; it has a month picker in the header and a ledger drill-in (sheet on phones, right pane on desktop). Plan (set budget) is reached from Budget's "Edit plan" action and holds the "₱X to assign" bar with Distribute folded in, an amount input per category with last-month and this-month spent as hints, and Move money. `/distribute` is removed. Why: you check the budget often and plan it rarely; each screen does one job.
- **Overspending**: "left" shows as a negative red figure with a full red bar, and group headers total the same way.
- **Deferred: drag-reordering categories.** Revisit: if ordering by hand is missed.
- **Phone forms become bottom sheets** (shadcn Drawer/vaul) that stay above the keyboard (`interactive-widget=resizes-content`, plus a `visualViewport` fallback for iOS). The submit button is pinned above the keyboard, `enterKeyHint` is "next"/"done" and Enter advances fields. Desktop keeps centered dialogs and the Transactions edit pane. Revisit: if sheets prove cramped for long forms.
- **Onboarding**: safe-area padding, a compact brand mark, a Create / Join segmented toggle showing one form at a time, and "Signed in as … · Sign out" pinned at the bottom.
- **Desktop gets the same flows in wider layouts.** Revisit: if a separate desktop layout is needed.
- **Nav slots for routes that don't exist yet** (#107): `src/components/layout/nav.ts` holds Import, Categories, Settings today; Budget and Review join the daily group (#111, #110) and Accounts leads the manage group (#102). Revisit: as each route lands.
- **Deferred: the review dot on the tablet sidebar trigger** (#107 shows it on the phone hamburger only). Revisit: #110, when Review gets its sidebar entry and count badge.
- **Deferred: an index for the review count** (`countReviewItems` scans `db.transactions`). Revisit: #110, when drafts and join requests join the count, or if it shows up against the performance budget.
- **Dropped: the Import page's privacy line** ("the file and its password never leave it"), removed with the in-page descriptions (#107). Why: not needed as a field hint either. Revisit: never.
- **Deferred: a "Review" glossary term** (GLOSSARY.md uses review only for drafts; #107 counts uncategorized expenses as review items). Revisit: #110.
- **Deferred: rewriting `src/components/layout/README.md`**, which still describes an older nav (Budgets, Analytics, Transfers); #107 fixed only the lines it made false. Revisit: a separate docs cleanup.
- **The HH badge stays in the desktop sidebar header**, which plays the drawer's role on wide screens (#107). Revisit: never.
- **Each issue updates the e2e specs and layout baselines it breaks** (for example, the 16 specs that add accounts on Home and the checklist's `/#add-account` link). There is no separate test-migration issue.
- **#112 tests the safe area by overriding `--safe-area-top/bottom`** (iPhone 15 Pro insets, 59px/34px) in `household.spec.ts`, since no desktop or emulated browser reports `env(safe-area-inset-*)`. Revisit: if a real-device check (BrowserStack or a physical iPhone) shows a mismatch.
- **#112 moved the Create / Join choices into `src/components/households/CreateOrJoin.tsx`** so the toggle and request states are unit-tested there; the route keeps only the page frame. Revisit: never.

## Issues

- [x] File the spec (#106) and sub-issues (`ready-for-agent`, blocked-by edges); #102 re-scoped as issue 3, #99 blocked by #110
- [x] 1. #107 (PR #115) Shell: header title and actions slot, drawer regroup with email and sign out at the bottom, Review dot, desktop sidebar groups, in-page titles removed
- [ ] 2. #108 Phone sheets and keyboard: Drawer component, viewport handling, pinned submit, `enterKeyHint`, all phone forms migrated
- [ ] 3. #102 Accounts screen and Settings → Household; Home becomes finances-only
- [ ] 4. #109 Transactions rehaul: rows, date headers, pending style, swipe-reveal, remove confirmation, selection mode, Totals removed, description required
- [ ] 5. #110 Review screen
- [ ] 6. #111 Categories / Budget / Plan split; `/distribute` removed
- [ ] 7. #112 Onboarding (no blockers; can jump the queue): safe area, Create / Join toggle
