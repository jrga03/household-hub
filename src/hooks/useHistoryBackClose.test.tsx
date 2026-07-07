/**
 * Tests for useHistoryBackClose (mobile UX review R37):
 * - opening an overlay pushes a sentinel history entry; hardware/gesture back
 *   pops it and closes the overlay instead of navigating the route underneath
 * - closing by other means (X, Escape, programmatic) consumes the sentinel so
 *   no stale duplicate entry is left behind
 * - rapid open/close/open keeps the stack consistent
 * - a navigation performed while the overlay is open is never rolled back
 * - a replace performed while the overlay is open (filter-sheet pattern) is
 *   kept when the overlay closes by other means; hardware back still closes
 * - stacked overlays close top-most first
 * - no-ops without a RouterProvider (component unit tests)
 * - the shared ui/sheet + ui/dialog wrappers engage the hook for CONTROLLED
 *   usage only; uncontrolled Radix usage gets no history handling
 *
 * Async-back races (the "browser-like pop timing" block): in real browsers
 * `history.back()` queues an ASYNC traversal while pushes land synchronously.
 * `createMemoryHistory().back()` is fully synchronous (index decrement +
 * notify inline), which can never reproduce the same-commit A-closes/B-opens
 * handoff race, so those tests shim `back()` behind a microtask to model the
 * browser: location unchanged until the queued pop lands.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { StrictMode, useEffect, useState } from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { useHistoryBackClose } from "./useHistoryBackClose";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Radix measures via ResizeObserver, which jsdom lacks
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;

// Per-host external controls, registered on render
const setOpenControls: Record<string, (open: boolean) => void> = {};
const closeSpies: Record<string, ReturnType<typeof vi.fn>> = {};

function HookHost({ id, initialOpen = false }: { id: string; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => {
    setOpenControls[id] = setOpen;
  }, [id]);
  useHistoryBackClose(open, () => {
    closeSpies[id]();
    setOpen(false);
  });
  return <div data-testid={`host-${id}`} data-open={open ? "true" : "false"} />;
}

function ControlledSheetHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpenControls.sheet = setOpen;
  }, []);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left">
        <SheetTitle>Controlled sheet</SheetTitle>
      </SheetContent>
    </Sheet>
  );
}

function UncontrolledSheetHost() {
  return (
    <Sheet>
      <SheetTrigger>Open uncontrolled</SheetTrigger>
      <SheetContent side="left">
        <SheetTitle>Uncontrolled sheet</SheetTitle>
      </SheetContent>
    </Sheet>
  );
}

function ControlledDialogHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpenControls.dialog = setOpen;
  }, []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Controlled dialog</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Models the real browser's pop timing on top of memory history: `back()`
 * queues the traversal (index decrement + notify) behind a microtask while
 * pushes stay synchronous. `history.location` therefore does NOT change
 * until the pop lands — exactly like `window.history.back()` +
 * TanStack's popstate-driven notify.
 */
function shimAsyncBack(history: RouterHistory): void {
  const realBack = history.back.bind(history);
  history.back = (...args: Parameters<RouterHistory["back"]>) => {
    // Same microtask scheduling TanStack's browser history uses for flush()
    void Promise.resolve().then(() => realBack(...args));
  };
}

interface SetupOptions {
  /** Shim `history.back()` to pop asynchronously (browser-like) */
  asyncBack?: boolean;
  /** Wrap the app in <StrictMode> (dev double effect run) */
  strictMode?: boolean;
  /** Mount an extra HookHost "c" that is already open at mount */
  openAtMountHost?: boolean;
}

async function setup(options: SetupOptions = {}) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <HookHost id="a" />
        <HookHost id="b" />
        {options.openAtMountHost ? <HookHost id="c" initialOpen /> : null}
        <ControlledSheetHost />
        <UncontrolledSheetHost />
        <ControlledDialogHost />
        <Outlet />
      </>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>home</div>,
  });
  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/other",
    component: () => <div>other</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  if (options.asyncBack) shimAsyncBack(history);
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, otherRoute]),
    history,
  });
  const app = <RouterProvider router={router} />;
  render(options.strictMode ? <StrictMode>{app}</StrictMode> : app);
  await screen.findByText("home");
  return { router, history };
}

const indexOf = (history: { location: { state: { __TSR_index: number } } }) =>
  history.location.state.__TSR_index;

beforeEach(() => {
  closeSpies.a = vi.fn();
  closeSpies.b = vi.fn();
  closeSpies.c = vi.fn();
});

describe("useHistoryBackClose", () => {
  it("pushes a sentinel on open and closes the overlay on back instead of navigating", async () => {
    const { history } = await setup();
    expect(indexOf(history)).toBe(0);

    act(() => setOpenControls.a(true));
    expect(indexOf(history)).toBe(1);
    expect(history.location.href).toBe("/");

    act(() => history.back());
    await waitFor(() => expect(closeSpies.a).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("host-a")).toHaveAttribute("data-open", "false");
    // Back consumed the sentinel and stayed on the same URL
    expect(indexOf(history)).toBe(0);
    expect(history.location.href).toBe("/");
  });

  it("consumes the sentinel when the overlay closes by other means", async () => {
    const { history } = await setup();

    act(() => setOpenControls.a(true));
    expect(indexOf(history)).toBe(1);

    act(() => setOpenControls.a(false));
    expect(indexOf(history)).toBe(0);
    expect(closeSpies.a).not.toHaveBeenCalled();

    // No stale entry: a subsequent back cannot pop anything overlay-related
    expect(history.canGoBack()).toBe(false);
  });

  it("survives rapid open/close/open", async () => {
    const { history } = await setup();

    act(() => setOpenControls.a(true));
    act(() => setOpenControls.a(false));
    act(() => setOpenControls.a(true));
    expect(indexOf(history)).toBe(1);

    act(() => history.back());
    await waitFor(() => expect(closeSpies.a).toHaveBeenCalledTimes(1));
    expect(indexOf(history)).toBe(0);
  });

  it("does not roll back a navigation performed while the overlay was open", async () => {
    const { history } = await setup();

    act(() => setOpenControls.a(true));
    expect(indexOf(history)).toBe(1);

    // e.g. a nav-drawer link pushing a new route while the drawer is open
    act(() => history.push("/other"));
    await waitFor(() => expect(history.location.pathname).toBe("/other"));
    expect(indexOf(history)).toBe(2);

    // Closing now must NOT back() — that would undo the navigation. The
    // buried sentinel stays behind (documented tradeoff: one extra same-URL
    // back press later).
    act(() => setOpenControls.a(false));
    expect(history.location.pathname).toBe("/other");
    expect(indexOf(history)).toBe(2);
  });

  it("keeps a URL replaced while the overlay was open (filter-sheet pattern)", async () => {
    const { history } = await setup();

    act(() => setOpenControls.a(true));
    act(() => history.replace("/?type=expense"));
    expect(indexOf(history)).toBe(1);

    // Closing by other means keeps the user's replaced URL instead of
    // rolling it back; the pre-change entry stays in the stack.
    act(() => setOpenControls.a(false));
    expect(history.location.href).toBe("/?type=expense");
    expect(indexOf(history)).toBe(1);
    expect(closeSpies.a).not.toHaveBeenCalled();
  });

  it("still closes on hardware back after an in-overlay replace (back-as-undo)", async () => {
    const { history } = await setup();

    act(() => setOpenControls.a(true));
    act(() => history.replace("/?type=expense"));

    act(() => history.back());
    await waitFor(() => expect(closeSpies.a).toHaveBeenCalledTimes(1));
    expect(history.location.href).toBe("/");
    expect(indexOf(history)).toBe(0);
  });

  it("closes stacked overlays top-most first", async () => {
    const { history } = await setup();

    act(() => setOpenControls.a(true));
    act(() => setOpenControls.b(true));
    expect(indexOf(history)).toBe(2);

    act(() => history.back());
    await waitFor(() => expect(closeSpies.b).toHaveBeenCalledTimes(1));
    expect(closeSpies.a).not.toHaveBeenCalled();
    expect(screen.getByTestId("host-a")).toHaveAttribute("data-open", "true");
    expect(indexOf(history)).toBe(1);

    act(() => history.back());
    await waitFor(() => expect(closeSpies.a).toHaveBeenCalledTimes(1));
    expect(indexOf(history)).toBe(0);
  });

  it("no-ops without a RouterProvider", () => {
    // Renders outside any router (the component-unit-test scenario): the
    // hook must neither throw nor call onClose
    render(<HookHost id="a" />);
    act(() => setOpenControls.a(true));
    act(() => setOpenControls.a(false));
    expect(closeSpies.a).not.toHaveBeenCalled();
  });
});

describe("useHistoryBackClose with browser-like async pop timing", () => {
  it("same-commit handoff (A closes, B opens) keeps B open; back then closes B", async () => {
    const { history } = await setup({ asyncBack: true });

    act(() => setOpenControls.a(true));
    expect(indexOf(history)).toBe(1);

    // One commit: A closes and B opens (the detail-sheet → edit-form handoff
    // in routes/transactions.tsx, or MobileNav's "Add transaction"). A's
    // cleanup queues an async back(); B's mount effect runs before that pop
    // lands and must NOT read its baseIndex from A's still-current sentinel.
    act(() => {
      setOpenControls.a(false);
      setOpenControls.b(true);
    });

    // Let A's queued pop land and B's deferred sentinel arm
    await act(async () => {});

    expect(screen.getByTestId("host-b")).toHaveAttribute("data-open", "true");
    expect(closeSpies.b).not.toHaveBeenCalled();
    expect(indexOf(history)).toBe(1);

    // Hardware back now closes B (and only B), consuming its sentinel
    act(() => history.back());
    await waitFor(() => expect(closeSpies.b).toHaveBeenCalledTimes(1));
    expect(closeSpies.a).not.toHaveBeenCalled();
    expect(indexOf(history)).toBe(0);
  });

  it("StrictMode double effect run does not close an overlay that is open at mount", async () => {
    const { history } = await setup({ asyncBack: true, strictMode: true, openAtMountHost: true });

    // StrictMode runs the effect create → destroy → create at mount: the
    // destroy queues an async back() for the first sentinel, and the second
    // create must defer until that pop lands instead of stacking a doomed
    // sentinel on top of it.
    await act(async () => {});

    expect(screen.getByTestId("host-c")).toHaveAttribute("data-open", "true");
    expect(closeSpies.c).not.toHaveBeenCalled();
    expect(indexOf(history)).toBe(1);

    act(() => history.back());
    await waitFor(() => expect(closeSpies.c).toHaveBeenCalledTimes(1));
    expect(indexOf(history)).toBe(0);
    expect(history.location.href).toBe("/");
  });

  it("close-then-reopen before the pop lands re-arms exactly one sentinel", async () => {
    const { history } = await setup({ asyncBack: true });

    act(() => setOpenControls.a(true));
    act(() => setOpenControls.a(false)); // queues the consuming back()
    act(() => setOpenControls.a(true)); // pop not landed yet: must defer

    await act(async () => {});

    expect(screen.getByTestId("host-a")).toHaveAttribute("data-open", "true");
    expect(closeSpies.a).not.toHaveBeenCalled();
    expect(indexOf(history)).toBe(1);

    act(() => history.back());
    await waitFor(() => expect(closeSpies.a).toHaveBeenCalledTimes(1));
    expect(indexOf(history)).toBe(0);
  });

  it("closing a still-deferred overlay before the pop lands pushes nothing", async () => {
    const { history } = await setup({ asyncBack: true });

    act(() => setOpenControls.a(true));
    act(() => {
      setOpenControls.a(false);
      setOpenControls.b(true);
    });
    // B is still waiting on A's pending pop; close it again before it arms
    act(() => setOpenControls.b(false));

    await act(async () => {});

    expect(indexOf(history)).toBe(0);
    expect(history.canGoBack()).toBe(false);
    expect(closeSpies.a).not.toHaveBeenCalled();
    expect(closeSpies.b).not.toHaveBeenCalled();
  });
});

describe("ui wrapper wiring (Sheet/Dialog)", () => {
  it("controlled Sheet: back closes it and consumes the sentinel", async () => {
    const { history } = await setup();

    act(() => setOpenControls.sheet(true));
    expect(await screen.findByText("Controlled sheet")).toBeInTheDocument();
    expect(indexOf(history)).toBe(1);

    act(() => history.back());
    await waitFor(() => {
      expect(screen.queryByText("Controlled sheet")).not.toBeInTheDocument();
    });
    expect(indexOf(history)).toBe(0);
  });

  it("controlled Dialog: closing by other means consumes the sentinel", async () => {
    const { history } = await setup();

    act(() => setOpenControls.dialog(true));
    expect(await screen.findByText("Controlled dialog")).toBeInTheDocument();
    expect(indexOf(history)).toBe(1);

    act(() => setOpenControls.dialog(false));
    await waitFor(() => {
      expect(screen.queryByText("Controlled dialog")).not.toBeInTheDocument();
    });
    expect(indexOf(history)).toBe(0);
  });

  it("uncontrolled Sheet: no history handling", async () => {
    const { history } = await setup();

    fireEvent.click(screen.getByText("Open uncontrolled"));
    expect(await screen.findByText("Uncontrolled sheet")).toBeInTheDocument();
    // No sentinel was pushed
    expect(indexOf(history)).toBe(0);
    expect(history.canGoBack()).toBe(false);
  });
});
