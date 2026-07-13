import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import type { RegisteredRouter, RouterHistory } from "@tanstack/react-router";

/**
 * Makes the hardware/gesture back button close an open overlay instead of
 * navigating the route underneath — or exiting the PWA with a half-typed
 * form on screen (mobile UX review R37).
 *
 * Mechanism: while `open` is true, a sentinel history entry (a duplicate of
 * the current location) is pushed via TanStack Router's history — never raw
 * `window.history`, since the router owns history. Back then pops the
 * sentinel, which is a same-URL no-op for the router, and the subscription
 * below turns that pop into `onClose()`.
 *
 * - Closed by back: the pop consumed the sentinel; nothing else to do.
 * - Closed by other means (X button, Escape, backdrop, programmatic): the
 *   effect cleanup consumes the sentinel with `history.back()` so no stale
 *   duplicate entry is left behind. The back() is deferred one microtask
 *   with a re-check, so a navigation committed in the same task (a nav-link
 *   tap that closes the overlay before the router's push lands) is never
 *   rolled back — see consumeSentinel.
 * - Stacked overlays each push their own sentinel; back closes the top-most
 *   one at a time (same-href pushes are recognized as sibling sentinels and
 *   do not disarm this instance).
 *
 * Async-back coordination (module-level, shared across instances): in real
 * browsers `history.back()` queues an ASYNC traversal while pushes land
 * synchronously. When overlay A closes and overlay B opens in the same React
 * commit (detail-sheet → edit-form handoff, MobileNav's "Add transaction",
 * dev StrictMode's double effect run), A's cleanup back() has not popped yet
 * when B's mount effect runs. Without coordination B would read its
 * baseIndex from A's still-current sentinel, push on top of it, and A's
 * landing pop would then drop the index to B's baseIndex — instantly closing
 * B. So every sentinel-consuming close reserves a PENDING CONSUME
 * synchronously (settled by a one-shot history subscription when its pop
 * lands, or cancelled by the microtask re-check), and a newly-arming
 * instance defers its sentinel push until all pending consumes have
 * settled, THEN reads baseIndex. The consume decision itself is always one
 * microtask deferred — even on memory history (used in most tests), where
 * the pop then lands synchronously once issued.
 *
 * Edge cases intentionally NOT handled (kept simple on purpose — history
 * manipulation is risky):
 * - If the overlay itself navigates forward while open (e.g. the nav drawer's
 *   links), the sentinel is buried mid-stack and cannot be removed without
 *   user-visible URL churn. It is left behind: cost is one extra back press
 *   later that lands on an identical URL.
 * - If the overlay replaces the URL while open (the filter sheet's
 *   replace-based filter updates), closing it by other means keeps the
 *   replaced URL instead of rolling back the user's changes; the pre-change
 *   entry stays in the stack (again one extra back press). A hardware back
 *   while it is still open closes it AND reverts to the pre-change URL
 *   (back-as-undo).
 * - A navigation that commits while a consuming back() traversal is already
 *   IN FLIGHT (cross-task: e.g. an after-save callback navigating right as
 *   a sheet closes) still gets popped by that traversal — queued browser
 *   traversals execute even if a push lands in between, and nothing can
 *   recall them. The bookkeeping settles regardless (the consume
 *   subscription raises its landing threshold when it sees the racing
 *   push), so back-close handling keeps working afterwards.
 */

interface HistoryBookkeeping {
  /** Sentinel-consuming back() traversals whose pop has not landed yet */
  pendingConsumes: number;
  /** Deferred arm callbacks waiting for all pending consumes to land */
  waiters: (() => void)[];
}

// Keyed per history instance so parallel routers (tests) never share state
const bookkeepingByHistory = new WeakMap<RouterHistory, HistoryBookkeeping>();

function getBookkeeping(history: RouterHistory): HistoryBookkeeping {
  let book = bookkeepingByHistory.get(history);
  if (!book) {
    book = { pendingConsumes: 0, waiters: [] };
    bookkeepingByHistory.set(history, book);
  }
  return book;
}

function settleConsume(book: HistoryBookkeeping): void {
  book.pendingConsumes -= 1;
  if (book.pendingConsumes === 0) {
    const waiters = book.waiters.splice(0);
    for (const waiter of waiters) waiter();
  }
}

/**
 * Consume a sentinel with `history.back()`, tracking the traversal as a
 * pending consume until the pop lands (index drops to `targetIndex` or
 * below). A pop blocked by a `useBlocker` (dirty-form discard prompt)
 * notifies with the index unchanged, so it neither settles the consume nor
 * disarms anyone — matching the pre-existing blocked-pop behavior.
 *
 * The back() itself is DEFERRED one microtask, with the sentinel re-checked
 * before issuing it. Reason: a nav-link tap inside an overlay closes it AND
 * navigates in the same task, but in that order — TanStack Router's Link
 * handler flushes the close render (and this hook's effect cleanup) via
 * flushSync BEFORE router.navigate() commits the push. At cleanup time the
 * sentinel still looks topmost even though a push is in flight; consuming
 * synchronously queues an async back() traversal that executes AFTER that
 * push and yanks the user off the route they just navigated to (the dead
 * mobile drawer, 2026-07-13). The router updates its in-memory location
 * synchronously on push, so by microtask time an in-flight navigation is
 * visible: the consume is then cancelled and the sentinel stays buried
 * (same documented tradeoff as a push landing first: one extra same-URL
 * back press later). The pendingConsumes reservation still happens
 * SYNCHRONOUSLY so a same-commit successor overlay (handoff, StrictMode)
 * keeps deferring its arm until this decision settles, exactly as before.
 */
function consumeSentinel(
  history: RouterHistory,
  targetIndex: number,
  sentinelIndex: number,
  sentinelKey: string | undefined
): void {
  const book = getBookkeeping(history);
  book.pendingConsumes += 1;
  queueMicrotask(() => {
    let consuming = false;
    let unsubscribe: (() => void) | undefined;
    try {
      const { state } = history.location;
      const currentKey = state.__TSR_key ?? state.key;
      if (state.__TSR_index !== sentinelIndex || currentKey !== sentinelKey) {
        // The sentinel is no longer the current entry — a navigation
        // committed in the same task, a replace changed its key, or a
        // stacked sibling's sentinel is still above it. Backing out now
        // would roll a navigation back (or pop the wrong entry); leave it
        // buried instead. `finally` settles the reservation.
        return;
      }
      // Settle when the traversal lands. Normally that is the base entry
      // (`targetIndex`); if a navigation slips into the traversal's
      // in-flight window, the pop executes from the pushed entry and lands
      // back ON the sentinel — raise the threshold so the reservation still
      // settles instead of parking every future arm in `waiters` forever.
      // (That racing navigation getting popped is the residual cost of a
      // queued traversal; see "Edge cases intentionally NOT handled".)
      let threshold = targetIndex;
      unsubscribe = history.subscribe(({ location, action }) => {
        if (action.type === "PUSH" && location.state.__TSR_index > sentinelIndex) {
          threshold = sentinelIndex;
          return;
        }
        if (location.state.__TSR_index > threshold) return;
        unsubscribe?.();
        settleConsume(book);
      });
      history.back();
      consuming = true;
    } catch (error) {
      // A torn-down or throwing history must not leak the reservation —
      // that would silently disable back-close handling for the whole
      // session. Nothing upstream can catch a microtask throw, so log it.
      unsubscribe?.();
      console.error("useHistoryBackClose: consuming the sentinel failed", error);
    } finally {
      if (!consuming) settleConsume(book);
    }
  });
}

export function useHistoryBackClose(open: boolean, onClose: () => void): void {
  // Overlays can render outside a RouterProvider (e.g. component unit tests).
  // Without a router there is no history to manage, so the hook no-ops.
  const router = useRouter({ warn: false }) as RegisteredRouter | undefined;

  // Latest-ref so inline `onClose` arrows at call sites don't re-run the
  // history effect (and churn history entries) on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open || !router) return;
    const history = router.history;
    const book = getBookkeeping(history);

    let disarm: (() => void) | undefined;

    const arm = () => {
      const baseIndex = history.location.state.__TSR_index;
      const sentinelIndex = baseIndex + 1;
      history.push(history.location.href, { ...history.location.state });
      const sentinelKey = history.location.state.__TSR_key ?? history.location.state.key;
      let lastHref = history.location.href;

      let armed = true;

      const unsubscribe = history.subscribe(({ location, action }) => {
        if (!armed) return;
        if (location.state.__TSR_index <= baseIndex) {
          // Back (or a multi-entry go) consumed the sentinel: close the
          // overlay. The navigation itself proceeds — a plain one-step back
          // lands on the identical URL underneath. (A blocked pop notifies
          // with the index unchanged, so it does NOT land here.)
          armed = false;
          onCloseRef.current();
        } else if (action.type === "PUSH" && location.href !== lastHref) {
          // The overlay navigated somewhere new while open (e.g. a drawer nav
          // link). The sentinel is now buried mid-stack; disarm and leave it
          // (see the "not handled" notes above). Same-href pushes are stacked
          // sibling sentinels and keep this instance armed.
          armed = false;
        }
        lastHref = location.href;
      });

      disarm = () => {
        unsubscribe();
        if (!armed) return;
        armed = false;
        // Closed by other means: consume the sentinel so the stack keeps no
        // stale duplicate entry. Whether it is actually still the current
        // entry is decided one microtask later inside consumeSentinel — it
        // can change within this task (an in-flight navigation push, a
        // replace, a stacked sibling's deferred consume popping first), and
        // deciding synchronously here rolled same-task navigations back (the
        // dead mobile drawer, 2026-07-13). The reservation itself is taken
        // synchronously so same-commit successors keep deferring their arm.
        consumeSentinel(history, baseIndex, sentinelIndex, sentinelKey);
      };
    };

    if (book.pendingConsumes === 0) {
      arm();
      return () => disarm?.();
    }

    // Another instance's sentinel-consuming back() is still in flight: defer
    // arming until every pending pop lands so baseIndex reads the settled
    // stack (see "Async-back coordination" above).
    let cancelled = false;
    const waiter = () => {
      if (!cancelled) arm();
    };
    book.waiters.push(waiter);

    return () => {
      cancelled = true;
      const index = book.waiters.indexOf(waiter);
      if (index !== -1) book.waiters.splice(index, 1);
      disarm?.();
    };
  }, [open, router]);
}
