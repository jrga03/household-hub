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
 *   restoration is a one-shot clamped `scrollTop` assignment on render, so it
 *   is best-effort when their content loads asynchronously.
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
