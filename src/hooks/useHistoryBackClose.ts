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
 *   duplicate entry is left behind.
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
 * B. So every sentinel-consuming back() registers a PENDING CONSUME settled
 * by a one-shot history subscription when the pop actually lands, and a
 * newly-arming instance defers its sentinel push until all pending consumes
 * have settled, THEN reads baseIndex. Memory history (used in most tests)
 * pops synchronously, so consumes settle inline and arming stays fully
 * synchronous there.
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

/**
 * Consume a sentinel with `history.back()`, tracking the traversal as a
 * pending consume until the pop lands (index drops to `targetIndex` or
 * below). A pop blocked by a `useBlocker` (dirty-form discard prompt)
 * notifies with the index unchanged, so it neither settles the consume nor
 * disarms anyone — matching the pre-existing blocked-pop behavior.
 */
function consumeSentinel(history: RouterHistory, targetIndex: number): void {
  const book = getBookkeeping(history);
  book.pendingConsumes += 1;
  const unsubscribe = history.subscribe(({ location }) => {
    if (location.state.__TSR_index > targetIndex) return;
    unsubscribe();
    book.pendingConsumes -= 1;
    if (book.pendingConsumes === 0) {
      const waiters = book.waiters.splice(0);
      for (const waiter of waiters) waiter();
    }
  });
  history.back();
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
        const { state } = history.location;
        const currentKey = state.__TSR_key ?? state.key;
        // Closed by other means with the sentinel still on top and unreplaced:
        // consume it so the stack keeps no stale duplicate entry.
        if (state.__TSR_index === sentinelIndex && currentKey === sentinelKey) {
          consumeSentinel(history, baseIndex);
        }
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
