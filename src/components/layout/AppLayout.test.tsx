/**
 * AppLayout's navigation per window size class (#216): compact gets the tab
 * bar, the drawer and the floating Add button; medium and up get the rail and
 * Add in the header. Auth routes render no navigation at all.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { setViewportWidth } from "@/test/viewport";
import { AppLayout } from "./AppLayout";

const { mockPathname, mockResolvedPathname, mockStaticData } = vi.hoisted(() => ({
  mockPathname: vi.fn((): string => "/"),
  mockResolvedPathname: vi.fn((): string | undefined => undefined),
  mockStaticData: vi.fn((): { bottomChrome?: false; floatingAdd?: true } => ({})),
}));

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
  // No RouterProvider: the modal rail's back-closes-it wiring stays inert
  useRouter: () => undefined,
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: (options?: { select?: (state: unknown) => unknown }) => {
    const resolvedPathname = mockResolvedPathname();
    const state = {
      location: { pathname: mockPathname() },
      resolvedLocation: resolvedPathname === undefined ? undefined : { pathname: resolvedPathname },
      matches: [{ staticData: mockStaticData() }],
    };
    return options?.select ? options.select(state) : state;
  },
}));

// Dexie and the server; the count itself is covered in MobileNav.test.tsx
vi.mock("@/hooks/useReviewCount", () => ({ useReviewCount: () => 0 }));
vi.mock("@/lib/sign-out", () => ({ signOutWithToast: () => undefined }));
vi.mock("./MobileNav", () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
  NavMenuButton: () => null,
}));
// Reads the route's staticData and the household; covered in PageHeader.test.tsx
vi.mock("./PageHeader", () => ({
  PageHeader: ({ children, menuButton }: { children?: ReactNode; menuButton?: ReactNode }) => (
    <header>
      {menuButton}
      {children}
    </header>
  ),
}));
// The real BottomTabBar needs a RouterProvider (Link active matching); its
// own semantics are covered in BottomTabBar.test.tsx
vi.mock("./BottomTabBar", () => ({
  BottomTabBar: () => <nav data-testid="bottom-tab-bar" />,
}));
vi.mock("@/components/StorageWarning", () => ({ StorageWarning: () => null }));
vi.mock("@/components/PWAInstallPrompt", () => ({ PWAInstallPrompt: () => null }));
vi.mock("@/components/transactions/QuickEntry", () => ({
  AddTransactionButton: () => <button type="button">Add transaction</button>,
  QuickEntryDialog: () => null,
}));
vi.mock("@/hooks/useKeyboardShortcuts", () => ({ useKeyboardShortcuts: () => undefined }));

const COMPACT = 393;
const MEDIUM = 768;
const EXPANDED = 1024;
const LARGE = 1366;

const rail = () => document.querySelector<HTMLElement>('[data-slot="sidebar"]:not([data-mobile])');
const tabBar = () => screen.queryByTestId("bottom-tab-bar");
/** An expanded rail names its pages; a collapsed one shows only their icons. */
const railIsExpanded = () => {
  const element = rail();
  if (!element) throw new Error("no rail");
  return within(element).queryByText("Budget") !== null;
};
const headerAdd = () =>
  within(screen.getByRole("banner")).queryByRole("button", { name: "Add transaction" });

function clearSidebarCookie() {
  document.cookie = "sidebar_state=; path=/; max-age=0";
}

beforeEach(() => {
  mockPathname.mockReturnValue("/");
  mockResolvedPathname.mockReturnValue(undefined);
  mockStaticData.mockReturnValue({});
  clearSidebarCookie();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearSidebarCookie();
});

describe("AppLayout navigation per window size class", () => {
  it("gives a compact window the tab bar, the drawer and the floating Add button, and no rail", () => {
    setViewportWidth(COMPACT);
    mockStaticData.mockReturnValue({ floatingAdd: true });
    render(<AppLayout />);

    expect(tabBar()).toBeInTheDocument();
    expect(screen.getByTestId("mobile-nav")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add transaction" })).toBeInTheDocument();
    expect(headerAdd()).not.toBeInTheDocument();
    expect(rail()).not.toBeInTheDocument();
  });

  it.each([
    ["medium", MEDIUM, false],
    ["expanded", EXPANDED, false],
    ["large", LARGE, true],
  ])(
    "gives a %s window (%ipx) the rail, expanded: %s, with Add in the header and no tab bar",
    (_, width, expanded) => {
      setViewportWidth(width);
      render(<AppLayout />);

      expect(railIsExpanded()).toBe(expanded);
      expect(headerAdd()).toBeInTheDocument();
      expect(tabBar()).not.toBeInTheDocument();
      expect(screen.queryByTestId("mobile-nav")).not.toBeInTheDocument();
    }
  );

  it.each([COMPACT, 599, 600, MEDIUM, 839, 840, EXPANDED, 1199, 1200, LARGE])(
    "never shows the tab bar and the rail together at %ipx",
    (width) => {
      setViewportWidth(width);
      render(<AppLayout />);

      expect(Boolean(tabBar()) !== Boolean(rail())).toBe(true);
    }
  );

  it("names each link of a collapsed rail, which shows only icons", () => {
    setViewportWidth(EXPANDED);
    render(<AppLayout />);

    const element = rail();
    if (!element) throw new Error("no rail");
    expect(railIsExpanded()).toBe(false);
    for (const label of ["Home", "Transactions", "Budget", "Review", "Accounts", "Settings"]) {
      expect(within(element).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("lets the remembered toggle expand the rail at an expanded window", () => {
    document.cookie = "sidebar_state=true; path=/";
    setViewportWidth(EXPANDED);
    render(<AppLayout />);

    expect(railIsExpanded()).toBe(true);
  });

  it("lets the remembered toggle collapse the rail at a large window", () => {
    document.cookie = "sidebar_state=false; path=/";
    setViewportWidth(LARGE);
    render(<AppLayout />);

    expect(railIsExpanded()).toBe(false);
  });

  it("remembers the rail toggle for the next visit", () => {
    setViewportWidth(EXPANDED);
    render(<AppLayout />);

    fireEvent.click(
      within(screen.getByRole("banner")).getByRole("button", { name: "Toggle Sidebar" })
    );

    expect(railIsExpanded()).toBe(true);
    expect(document.cookie).toContain("sidebar_state=true");
  });
});

describe("AppLayout modal rail at a medium window", () => {
  it("keeps the rail collapsed even when the toggle was remembered open", () => {
    document.cookie = "sidebar_state=true; path=/";
    setViewportWidth(MEDIUM);
    render(<AppLayout />);

    expect(railIsExpanded()).toBe(false);
  });

  it("opens the expanded rail over the page from the menu icon, and closes it on navigation", () => {
    setViewportWidth(MEDIUM);
    const { rerender } = render(<AppLayout />);

    fireEvent.click(
      within(screen.getByRole("banner")).getByRole("button", { name: "Toggle Sidebar" })
    );

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText("Budget")).toBeInTheDocument();
    expect(railIsExpanded()).toBe(false);
    expect(document.cookie).not.toContain("sidebar_state");

    mockPathname.mockReturnValue("/budget");
    act(() => rerender(<AppLayout />));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("AppLayout routes without navigation", () => {
  beforeEach(() => setViewportWidth(COMPACT));

  it.each(["/login", "/signup", "/create-or-join"])(
    "renders no navigation chrome on the %s auth route",
    (authPath) => {
      mockPathname.mockReturnValue(authPath);

      render(<AppLayout />);

      expect(screen.getByTestId("outlet")).toBeInTheDocument();
      expect(tabBar()).not.toBeInTheDocument();
      expect(screen.queryByTestId("mobile-nav")).not.toBeInTheDocument();
    }
  );

  it("keeps the rendered route's chrome while a navigation is still pending", () => {
    // Swapping branches early would remount the outlet's current page mid-navigation
    mockPathname.mockReturnValue("/");
    mockResolvedPathname.mockReturnValue("/signup");

    render(<AppLayout />);

    expect(screen.queryByTestId("mobile-nav")).not.toBeInTheDocument();
  });

  it("leaves out the tab bar and the Add button on a compact window when the route turns bottom chrome off", () => {
    mockStaticData.mockReturnValue({ bottomChrome: false, floatingAdd: true });

    render(<AppLayout />);

    expect(screen.getByTestId("mobile-nav")).toBeInTheDocument();
    expect(tabBar()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add transaction" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveClass("pb-[calc(3.5rem+var(--bottom-chrome))]");
  });

  it("keeps the tab bar, the Add button and the bottom inset on compact routes that float Add", () => {
    mockStaticData.mockReturnValue({ floatingAdd: true });
    render(<AppLayout />);

    expect(tabBar()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add transaction" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("pb-[calc(3.5rem+var(--bottom-chrome))]");
  });

  it("leaves out only the floating Add button on compact routes that do not ask for it", () => {
    render(<AppLayout />);

    expect(tabBar()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add transaction" })).not.toBeInTheDocument();
  });

  it("keeps the header Add button from medium up when the route turns bottom chrome off", () => {
    setViewportWidth(MEDIUM);
    mockStaticData.mockReturnValue({ bottomChrome: false });

    render(<AppLayout />);

    expect(headerAdd()).toBeInTheDocument();
  });
});
