import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Router singleton.
 *
 * Lives in its own module (not App.tsx) so non-component layers can navigate.
 * The session-expiry handler in `stores/authStore.ts` imports this LAZILY
 * (`await import("@/router")`) — a static edge there would create the cycle
 * authStore → router → routeTree → routes → authStore and drag the entire
 * route tree into every unit test that touches the store.
 *
 * `scrollRestoration: true` (mobile UX review C1): TanStack Router does not
 * restore or reset scroll by default, so scroll position bled into newly
 * pushed routes and back-nav lost list position. With this flag the router
 * sets `history.scrollRestoration = "manual"` and records scroll positions
 * per location key via a capture-phase document scroll listener.
 *
 * What is and isn't restored (verified against @tanstack/router-core
 * the installed @tanstack/router-core scroll-restoration.js):
 *
 * - WINDOW scroll (the page scroll on every route, incl. the mobile layout's
 *   normal-flow <main>) is recorded and restored on history navigations, and
 *   reset to top on new pushes.
 * - INNER scrollable elements are recorded too (keyed by CSS selector), but
 *   restoration is a one-shot clamped `scrollTop` assignment on render. The
 *   virtualized TransactionList scrolls a keyed inner div (its virtualizer's
 *   getScrollElement is `parentRef.current`, NOT window — see
 *   TransactionList.tsx), so its restoration is best-effort: it works when
 *   TanStack Query still has the list cached on back-nav (the container has
 *   its full height on first render, and the assigned scrollTop fires a
 *   scroll event the virtualizer handles normally); when data loads async the
 *   assignment clamps to 0 and the list re-opens at the top. Neither case can
 *   crash or mis-position the virtualizer — worst case is top-of-list.
 */
export const router = createRouter({
  routeTree,
  scrollRestoration: true,
});

// Type augmentation for the router (enables route autocomplete app-wide)
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
