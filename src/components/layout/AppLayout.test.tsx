/**
 * AppLayout branch tests (mobile UX reviews C3, R42):
 *
 * isMobile is width-only (max-width: 767px), so landscape phones render the
 * tablet/desktop branch with the sidebar. The BottomTabBar is
 * mobile-branch-only and never renders on auth routes, where AppLayout
 * early-returns without navigation chrome.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppLayout } from "./AppLayout";

const { mockIsMobile, mockIsTablet, mockPathname, mockResolvedPathname, mockStaticData } =
  vi.hoisted(() => ({
    mockIsMobile: vi.fn((): boolean => false),
    mockIsTablet: vi.fn((): boolean => false),
    mockPathname: vi.fn((): string => "/"),
    mockResolvedPathname: vi.fn((): string | undefined => undefined),
    mockStaticData: vi.fn((): { bottomChrome?: false } => ({})),
  }));

vi.mock("@/hooks/useMediaQuery", () => ({
  useIsMobile: () => mockIsMobile(),
  useIsTablet: () => mockIsTablet(),
}));

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
  useRouterState: () => {
    const resolvedPathname = mockResolvedPathname();
    return {
      location: { pathname: mockPathname() },
      resolvedLocation: resolvedPathname === undefined ? undefined : { pathname: resolvedPathname },
      matches: [{ staticData: mockStaticData() }],
    };
  },
}));

// Heavy neighbors stubbed out — this test targets branch selection only
vi.mock("./AppSidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}));
// Reads the review count (Dexie and the server); covered in MobileNav.test.tsx
vi.mock("./ReviewCount", () => ({
  SidebarTriggerWithReview: (props: { className?: string }) => (
    <button type="button" className={props.className}>
      toggle sidebar
    </button>
  ),
}));
vi.mock("./MobileNav", () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
  NavMenuButton: () => null,
}));
// Reads the route's staticData and the household; covered in PageHeader.test.tsx
vi.mock("./PageHeader", () => ({
  PageHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
}));
// The real BottomTabBar needs a RouterProvider (Link active matching); its
// own semantics are covered in BottomTabBar.test.tsx
vi.mock("./BottomTabBar", () => ({
  BottomTabBar: () => <nav data-testid="bottom-tab-bar" />,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/StorageWarning", () => ({
  StorageWarning: () => null,
}));
vi.mock("@/components/PWAInstallPrompt", () => ({
  PWAInstallPrompt: () => null,
}));
vi.mock("@/components/transactions/QuickEntry", () => ({
  AddTransactionButton: () => <button type="button">Add transaction</button>,
  QuickEntryDialog: () => null,
}));
vi.mock("@/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: () => undefined,
}));

describe("AppLayout bottom tab bar placement (review R42)", () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    mockIsTablet.mockReturnValue(false);
    mockPathname.mockReturnValue("/");
    mockResolvedPathname.mockReturnValue(undefined);
    mockStaticData.mockReturnValue({});
  });

  it("renders the bottom tab bar in the mobile branch", () => {
    mockIsMobile.mockReturnValue(true);

    render(<AppLayout />);

    expect(screen.getByTestId("mobile-nav")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-tab-bar")).toBeInTheDocument();
  });

  it("renders the sidebar and no tab bar in the tablet/desktop branch", () => {
    mockIsTablet.mockReturnValue(true);

    render(<AppLayout />);

    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("bottom-tab-bar")).not.toBeInTheDocument();
  });

  it.each(["/login", "/signup", "/create-or-join"])(
    "does NOT render the tab bar (or any nav chrome) on the %s auth route",
    (authPath) => {
      mockIsMobile.mockReturnValue(true);
      mockPathname.mockReturnValue(authPath);

      render(<AppLayout />);

      // Auth early-return: outlet only, no navigation chrome at all
      expect(screen.getByTestId("outlet")).toBeInTheDocument();
      expect(screen.queryByTestId("bottom-tab-bar")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mobile-nav")).not.toBeInTheDocument();
    }
  );

  it("keeps the rendered route's chrome while a navigation is still pending", () => {
    // Swapping branches early would remount the outlet's current page mid-navigation
    mockIsMobile.mockReturnValue(true);
    mockPathname.mockReturnValue("/");
    mockResolvedPathname.mockReturnValue("/signup");

    render(<AppLayout />);

    expect(screen.queryByTestId("mobile-nav")).not.toBeInTheDocument();
  });

  it("leaves out the tab bar and the Add button on a phone when the route turns bottom chrome off", () => {
    mockIsMobile.mockReturnValue(true);
    mockStaticData.mockReturnValue({ bottomChrome: false });

    render(<AppLayout />);

    expect(screen.getByTestId("mobile-nav")).toBeInTheDocument();
    expect(screen.queryByTestId("bottom-tab-bar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add transaction" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveClass("pb-[calc(3.5rem+var(--bottom-chrome))]");
  });

  it("keeps the tab bar, the Add button and the bottom inset on other phone routes", () => {
    mockIsMobile.mockReturnValue(true);

    render(<AppLayout />);

    expect(screen.getByTestId("bottom-tab-bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add transaction" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("pb-[calc(3.5rem+var(--bottom-chrome))]");
  });

  it("keeps the header Add button on a tablet when the route turns bottom chrome off", () => {
    mockIsTablet.mockReturnValue(true);
    mockStaticData.mockReturnValue({ bottomChrome: false });

    render(<AppLayout />);

    expect(screen.getByRole("button", { name: "Add transaction" })).toBeInTheDocument();
  });
});
