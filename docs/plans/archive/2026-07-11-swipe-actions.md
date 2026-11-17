# Swipe-to-Reveal Row Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add left-swipe-to-reveal Clear/Delete actions to transaction list cards on mobile, without altering the TanStack Virtual integration.

**Architecture:** A `SwipeableRow` wraps each card. `@use-gesture/react`'s `useDrag` translates a foreground layer via `transform: translateX` only — the row wrapper height is constant, so the virtualizer is unaffected. `TransactionList` owns a single `openRowId`; close-on-scroll clears it. Actions reuse `confirmAndDeleteTransaction` and `useToggleTransactionStatus`. Design: `docs/plans/2026-07-11-swipe-actions-design.md`.

**Tech Stack:** React 19, TypeScript strict, @use-gesture/react, TanStack Virtual, shadcn/ui, Tailwind v4, Vitest.

**DEPENDENCY / SEQUENCING:** This plan edits `src/components/TransactionList.tsx`, which the bidirectional-pagination change also edits. Do NOT start until that change is committed on `main`. First step of Task 4: `git log --oneline -5` and confirm the pagination commit is present; rebase/refresh if not.

---

### Task 1: Add the gesture dependency

**Files:**

- Modify: `package.json`, `package-lock.json`

**Step 1:** `npm install @use-gesture/react` (headless pointer/drag gestures, ~4KB).

**Step 2:** Verify it resolves: `node -e "require.resolve('@use-gesture/react')"` → prints a path, no error.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @use-gesture/react for swipe actions"
```

---

### Task 2: Pure gesture-decision helpers (TDD)

Extract the two decisions that need no DOM, so the tuning logic is unit-tested even though the gesture itself can't be.

**Files:**

- Create: `src/lib/gestures/swipe.ts`
- Test: `src/lib/gestures/swipe.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { resolveSwipeAxis, resolveSnap, AXIS_LOCK_PX, SNAP_RATIO } from "./swipe";

describe("resolveSwipeAxis (direction-dominant lock)", () => {
  it("is pending below the lock threshold", () => {
    expect(resolveSwipeAxis(4, 2)).toBe("pending");
  });
  it("locks to x when horizontal dominates past threshold", () => {
    expect(resolveSwipeAxis(AXIS_LOCK_PX + 1, 3)).toBe("x");
  });
  it("locks to y (scroll) when vertical dominates", () => {
    expect(resolveSwipeAxis(AXIS_LOCK_PX + 1, AXIS_LOCK_PX + 20)).toBe("y");
  });
  it("treats a tie as scroll (protect the list)", () => {
    expect(resolveSwipeAxis(AXIS_LOCK_PX + 1, AXIS_LOCK_PX + 1)).toBe("y");
  });
});

describe("resolveSnap (40% open threshold)", () => {
  const TRAY = 144;
  it("snaps closed below the ratio", () => {
    expect(resolveSnap(-(TRAY * (SNAP_RATIO - 0.05)), TRAY)).toBe("closed");
  });
  it("snaps open past the ratio", () => {
    expect(resolveSnap(-(TRAY * (SNAP_RATIO + 0.05)), TRAY)).toBe("open");
  });
  it("ignores rightward (positive) offset — no right-swipe", () => {
    expect(resolveSnap(TRAY, TRAY)).toBe("closed");
  });
});
```

**Step 2: Run to verify it fails** — `npx vitest run src/lib/gestures/swipe.test.ts` → FAIL (module missing).

**Step 3: Implement**

```typescript
/** Pixels of movement before the axis lock commits. Direction-dominant:
 *  the larger axis wins; a tie is scroll (protect the list). */
export const AXIS_LOCK_PX = 10;
/** Fraction of tray width the finger must pass (on release) to snap open. */
export const SNAP_RATIO = 0.4;

export type SwipeAxis = "x" | "y" | "pending";

export function resolveSwipeAxis(absDx: number, absDy: number): SwipeAxis {
  if (absDx < AXIS_LOCK_PX && absDy < AXIS_LOCK_PX) return "pending";
  return absDx > absDy ? "x" : "y";
}

/** offsetX is negative for a left swipe (reveals the right-edge tray). */
export function resolveSnap(offsetX: number, trayWidth: number): "open" | "closed" {
  if (offsetX >= 0) return "closed"; // rightward drag never opens the left tray
  return Math.abs(offsetX) >= trayWidth * SNAP_RATIO ? "open" : "closed";
}
```

**Step 4: Run to verify it passes** — `npx vitest run src/lib/gestures/swipe.test.ts` → PASS.

**Step 5: Commit**

```bash
git add src/lib/gestures/swipe.ts src/lib/gestures/swipe.test.ts
git commit -m "feat: pure swipe axis-lock and snap decision helpers"
```

---

### Task 3: SwipeableRow component (TDD for structure/a11y; gesture feel is device-tested)

**Files:**

- Create: `src/components/transactions/SwipeableRow.tsx`
- Test: `src/components/transactions/SwipeableRow.test.tsx`

**Behavior:** absolutely-positioned right-edge tray `[ Clear ][ Delete ]` (Delete outermost); a foreground layer holding `children`, moved by `transform: translateX`. `useDrag` with `resolveSwipeAxis` gating (only capture when axis === "x"), rubber-band past `-TRAY_WIDTH`, `resolveSnap` on release. Props: `{ isOpen, onOpenChange(open), onClear(), onDelete(), clearLabel, children }`. `touch-action: pan-y` on the root. Tray buttons `aria-hidden` + `tabIndex=-1` while closed.

**Step 1: Write the failing test** (structure + a11y — jsdom can't drive the drag):

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwipeableRow } from "./SwipeableRow";

const base = {
  onOpenChange: vi.fn(), onClear: vi.fn(), onDelete: vi.fn(),
  clearLabel: "Mark cleared",
};

describe("SwipeableRow", () => {
  it("renders children (the card) and the tray buttons", () => {
    render(<SwipeableRow isOpen={false} {...base}><div>Card body</div></SwipeableRow>);
    expect(screen.getByText("Card body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark cleared/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
  it("hides tray buttons from a11y tree and tab order while closed", () => {
    render(<SwipeableRow isOpen={false} {...base}><div>Card</div></SwipeableRow>);
    const del = screen.getByRole("button", { name: /delete/i, hidden: true });
    expect(del).toHaveAttribute("tabindex", "-1");
  });
  it("fires onDelete / onClear when the open tray buttons are tapped", () => {
    const onDelete = vi.fn(), onClear = vi.fn();
    render(<SwipeableRow isOpen {...base} onDelete={onDelete} onClear={onClear}><div>Card</div></SwipeableRow>);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /mark cleared/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run to verify it fails** — FAIL (module missing).

**Step 3: Implement** `SwipeableRow.tsx`. Key points (write the full component):

- `TRAY_WIDTH = 144` (2 × 72px buttons).
- `useDrag(({ movement:[mx], down, last, ... }) => {...}, { axis: undefined, filterTaps: true, pointer:{touch:true} })` — do axis lock manually with `resolveSwipeAxis(Math.abs(mx), Math.abs(my))`, ignore the gesture until it resolves to `"x"`; once `"y"`, bail for the rest of the gesture.
- Track `x` in a spring/state; clamp to `[-TRAY_WIDTH * 1.2, 0]` with rubber-band past `-TRAY_WIDTH`.
- On `last`, call `resolveSnap(x, TRAY_WIDTH)`; set x to `-TRAY_WIDTH` (open) or `0` (closed) and `onOpenChange(snap === "open")`.
- When `isOpen` prop changes externally (e.g. close-on-scroll, or another row opens), animate x to match.
- Root style `touchAction: "pan-y"`; foreground `transform: translateX(${x}px)`; transition honors reduced motion (use a CSS class that the Phase 3 `prefers-reduced-motion` block already flattens, or gate the transition duration).
- Tray: `absolute inset-y-0 right-0 flex`, buttons 72px wide; `aria-hidden={!isOpen}`, `tabIndex={isOpen ? 0 : -1}`. Delete uses destructive styling.

**Step 4: Run to verify it passes** — `npx vitest run src/components/transactions/SwipeableRow.test.tsx` → PASS.

**Step 5: Commit**

```bash
git add src/components/transactions/SwipeableRow.tsx src/components/transactions/SwipeableRow.test.tsx
git commit -m "feat: SwipeableRow with transform-only left-swipe tray"
```

---

### Task 4: Wire openRowId + close-on-scroll into TransactionList

**Files:**

- Modify: `src/components/TransactionList.tsx` (card branch ~line 405+, the `data-testid="transaction-row"` cards ~line 661)
- Test: `src/components/TransactionList.test.tsx` (extend)

**Step 1:** Confirm the pagination commit is on `main` (`git log --oneline -5`).

**Step 2: Write the failing test** — wrap two card rows, opening one closes the other; a scroll event closes any open row. (Assert via `onOpenChange`/state exposed through the rows; if the virtualizer mock hides rows in jsdom, test the pure `openRowId` reducer instead — extract `nextOpenRowId(current, id, open)` and a `closeOnScroll` no-arg reset, and unit-test those.)

**Step 3: Implement:**

- Add `const [openRowId, setOpenRowId] = useState<string | null>(null)` in the card branch.
- Wrap each card in `<SwipeableRow isOpen={openRowId === t.id} onOpenChange={(o) => setOpenRowId(o ? t.id : null)} ...>`.
- Subscribe to the virtualizer scroll element: on `scroll`, `setOpenRowId(null)` (throttle with rAF). Attach via the existing `parentRef`/scroll container from Phase 4.
- When a row is open, its foreground tap must NOT open the detail sheet — pass an `isOpen`-aware `onClick` that, if open, calls `setOpenRowId(null)` and returns; else the existing row-tap handler.

**Step 4: Run** — `npx vitest run src/components/TransactionList.test.tsx` → PASS.

**Step 5: Commit**

```bash
git add src/components/TransactionList.tsx src/components/TransactionList.test.tsx
git commit -m "feat: single-open swipe row state + close-on-scroll in transaction list"
```

---

### Task 5: Wire the Clear and Delete actions (reuse existing paths)

**Files:**

- Modify: `src/components/TransactionList.tsx`
- Test: `src/components/TransactionList.test.tsx` (extend)

**Step 1: Write the failing test** — tapping the tray Delete calls the same delete path as the row Delete button (mock `confirmAndDeleteTransaction`); tapping Clear calls `useToggleTransactionStatus().mutate(id)`; both then close the row (`openRowId → null`).

**Step 2: Implement:**

- `onDelete` → the existing `handleDelete(t)` (which already calls `confirmAndDeleteTransaction({ id, description, isTransferLeg, deleteTransaction, queryClient })`). On resolve, `setOpenRowId(null)`.
- `onClear` → `toggleStatus.mutate(t.id)` from `useToggleTransactionStatus()`; `setOpenRowId(null)`.
- `clearLabel` = `t.status === "pending" ? "Mark cleared" : "Mark pending"`.

**Step 3: Run** — PASS.

**Step 4: Commit**

```bash
git add src/components/TransactionList.tsx src/components/TransactionList.test.tsx
git commit -m "feat: wire swipe tray to delete-confirm and status-toggle"
```

---

### Task 6: Reduced-motion + a11y polish

**Files:**

- Modify: `src/components/transactions/SwipeableRow.tsx`

**Step 1:** Ensure the open/close transition uses a class covered by the Phase 3 `@media (prefers-reduced-motion: reduce)` block in `src/index.css` (durations flattened to 0.01ms). Verify by reading that block; if the transition is inline-style, switch to a utility class so the rule applies.

**Step 2:** Confirm the detail sheet still exposes Edit/Delete/status (unchanged) so swipe remains purely additive — no keyboard/SR regression.

**Step 3: Commit** (if any change)

```bash
git add src/components/transactions/SwipeableRow.tsx
git commit -m "polish: respect reduced-motion for swipe tray animation"
```

---

### Task 7: Manual device pass (cannot be unit-tested)

> Status: Tasks 1-6 built, reviewed, committed. This device pass is the remaining
> gate before the git-remote push. Review (2026-07-11) verified in code: the
> virtualizer height invariant, pagination-listener coexistence (close-on-scroll
> merged into the single existing scroll handler, touches no pagination refs),
> single-open state, action reuse, reduced-motion class coverage, no-any. The
> items below are the DEVICE-ONLY unknowns the review flagged.

Run `npm run dev`, open on a real phone (or device emulation with touch). Verify, and record results in this plan doc:

- **[review finding 1, fixed — confirm it worked]** Vertical scroll is never hijacked by a near-vertical thumb arc. `touch-action: pan-y` was moved onto the element `useDrag` binds to (the foreground); confirm iOS Safari cleanly hands off vertical panning while horizontal swipe still captures.
- Tray snaps open past ~40%, closed under; rubber-band past full width feels natural.
- **[review finding 2 — decide on device]** A gesture between 3px (tap) and 10px (axis lock) on an OPEN row is currently a no-op (neither closes nor navigates). If that imprecise-tap dead zone feels bad, lower `AXIS_LOCK_PX` toward 3 or close an open row on a below-threshold release. Not a correctness bug.
- Opening row B closes row A; scrolling closes any open row.
- Delete opens the AlertDialog; Clear toggles status; both close the tray.
- No virtualizer jump/flicker while swiping or after an action removes a row.
- Reduced-motion setting removes the animation but keeps the snap.

If the 10px / 40% thresholds feel off, tune `AXIS_LOCK_PX` / `SNAP_RATIO` in `src/lib/gestures/swipe.ts` and re-test. Commit any tuning with a note of what felt wrong.

---

### Caveat (out of scope, pre-existing): Clear action offline behavior

`useToggleTransactionStatus` (reused per Task 5) is not offline-first and has no
error toast — offline, a Clear silently fails while the tray has already closed.
This is pre-existing behavior shared by the desktop table and detail sheet, not a
swipe regression. Making that hook offline-first (optimistic + outbox + onError)
would improve every caller; deferred.

### Task 8 (fast-follow, gated on Task 7 success): Drafts rows

Only after transactions swipe proves out on-device. Apply `SwipeableRow` to the drafts card list (`src/routes/drafts.tsx`), tray = `[ Confirm ][ Discard ]` (reuse the existing confirm/discard handlers + the Phase-3 Undo toast for discard). Same TDD shape as Tasks 3–5. Decide during execution whether the drafts action set justifies it.
