# Swipe-to-Reveal Row Actions — Design

Date: 2026-07-11. Follows the mobile UX remediation (deferred item C6, swipe
actions). Companion to `docs/reviews/2026-07-07-mobile-ux-review.md`.

## Goal

Give phone users a fast, native-feeling accelerator for the highest-frequency
per-row actions on the transactions list — without touching the TanStack Virtual
integration and without removing the existing (discoverable, accessible) detail-sheet
path.

## Decisions (locked in brainstorm 2026-07-11)

- **Gesture library:** `@use-gesture/react` (`useDrag`), headless. It reports drag
  deltas and gesture state; we decide what moves. Chosen over framer-motion (heavier,
  wants to own the element) and react-swipeable (less control) precisely because it
  never touches layout or the scroll container, so it cannot fight the virtualizer.
- **Reveal layout:** LEFT swipe reveals a two-button tray on the right edge —
  `[ ✓ Clear ][ Delete ]`, Delete outermost (destructive convention). No right-swipe.
  Edit stays as tap → detail sheet (it needs the form anyway).
- **Reveal behavior:** drag-follows the finger 1:1 with rubber-band resistance past
  full tray width; on release, snap OPEN if past ~40% of tray width, else snap CLOSED;
  then the user taps a button. NO full-swipe-to-commit (two buttons can't disambiguate
  a single long swipe, and auto-delete-on-swipe is the classic accidental-deletion trap).
- **Axis lock:** direction-dominant / forgiving. A gesture becomes a swipe only if
  horizontal movement beats vertical in the first ~10px; otherwise it is a scroll and
  horizontal is ignored for the rest of that gesture. `touch-action: pan-y` keeps the
  browser scrolling natively until we decide. On a scrolling list, protecting scroll
  beats an instant reveal.
- **Scope:** transactions cards first (mobile card presentation from Phase 4). Drafts
  cards a fast-follow only if the pattern proves out. Desktop table = no swipe (not a
  touch surface); it keeps its existing action buttons.

## Architecture

### Components

- **`SwipeableRow`** (new, `src/components/transactions/SwipeableRow.tsx`): wraps a card.
  - Absolutely-positioned action tray behind the card, right-aligned, fixed width
    (`TRAY_WIDTH` = 2 × button, ~144px).
  - A **foreground layer** holding the existing card content, moved ONLY via
    `transform: translateX(x)`. **The row wrapper height NEVER changes** — this is the
    invariant that keeps `measureElement` stable and the virtualizer unaware of swipe.
    A code comment locks this in.
  - `useDrag` with `axis: 'x'` + a ~10px direction-dominant threshold; rubber-band past
    `-TRAY_WIDTH`; on release apply the 40% snap decision.
- **`TransactionList`** owns a single `openRowId: string | null`. A row is open iff
  `openRowId === transaction.id` → one-open-at-a-time for free. Passes `isOpen` +
  `onOpenChange` down.
- **Pure helpers** (extracted for unit tests, no gesture needed):
  - `resolveSwipeAxis(dx, dy, threshold)` → `'x' | 'y' | 'pending'`.
  - `resolveSnap(offsetX, trayWidth, ratio)` → `'open' | 'closed'`.

### Virtualizer integration

- `getItemKey` = transaction id (also required by the in-flight bidirectional
  pagination change) so identity survives recycling and page prepends.
- **Close-on-scroll:** subscribe to the virtualizer's scroll; reset `openRowId = null`.
  Guarantees no phantom-open row survives recycling.
- No new per-row React state in the list render path beyond the single `openRowId`;
  only the opening and previously-open rows re-render (cheap — ~15 mounted rows).

### Action wiring (reuse, do not fork)

- **Delete** → existing `confirmAndDeleteTransaction` (`src/lib/delete-transaction.ts`),
  which already routes through the Phase 5 AlertDialog confirm and the transfer-aware /
  debt-reversal delete path. Close the tray on confirm; leave open on cancel (retry).
- **Clear / Pending** → `useToggleTransactionStatus`; label derived from current status
  ("Mark cleared" when pending, "Mark pending" when cleared). Close the tray after.
- When a row is OPEN, a tap on its foreground **closes the tray** instead of opening the
  detail sheet (an open row must not fight the tap target). When closed, tap = existing
  detail-sheet behavior.

### Accessibility & motion

- Tray buttons carry aria-labels; while closed the tray is `aria-hidden` and its buttons
  are not focusable/tabbable.
- The detail sheet remains the full keyboard/screen-reader path — swipe is purely
  additive; no capability is gated behind the gesture.
- The snap/spring honors the `prefers-reduced-motion` block added in Phase 3 (near-instant
  transition under reduce).

## Edge cases

- Opening row B closes row A automatically (single-valued `openRowId`).
- Delete confirm dialog open → on confirm the row unmounts (removed from list); on cancel
  the tray stays open.
- Recycling during scroll is mooted by close-on-scroll, but open state is id-derived so it
  is correct even without it.
- Reduced motion: snap animates in ~0.01ms (Phase 3 rule) — still snaps, just not animated.

## Testing

- Unit: `resolveSwipeAxis`, `resolveSnap` (pure); status-label derivation; that Delete
  wires to `confirmAndDeleteTransaction` and Clear to the toggle hook (mocked).
- The gesture FEEL (10px lock, 40% snap, rubber-band) cannot be unit-tested in jsdom (no
  layout/pointer physics) — validated in a real-device pass, same caveat as the mobile
  smoke test. Flag explicitly in the plan.

## Non-goals / deferred

- Right-swipe actions (unused for now).
- Full-swipe-to-commit.
- Haptics: a `navigator.vibrate(10)` on commit is a possible tiny add gated behind feature
  detection, but it is a no-op on iOS Safari (the primary target), so Android-only garnish —
  not part of this work.
- Drafts-row swipe: fast-follow, decided after transactions proves out.

## Sequencing

Build AFTER the bidirectional-pagination change lands (both edit
`src/components/TransactionList.tsx`); avoid concurrent edits to the same file.
