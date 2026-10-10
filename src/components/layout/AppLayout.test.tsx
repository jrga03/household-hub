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

const { mockIsMobile, mockIsTablet, mockPathname, mockResolvedPathname } = vi.hoisted(() => ({
  mockIsMobile: vi.fn((): boolean => false),
  mockIsTablet: vi.fn((): boolean => false),
  mockPathname: vi.fn((): string => "/"),
  mockResolvedPathname: vi.fn((): string | undefined => undefined),
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
    };
  },
}));

// Heavy neighbors stubbed out — this test targets branch selection only
vi.mock("./AppSidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}));
vi.mock("./MobileNav", () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}));
// The real BottomTabBar needs a RouterProvider (Link active matching); its
// own semantics are covered in BottomTabBar.test.tsx
vi.mock("./BottomTabBar", () => ({
  BottomTabBar: () => <nav data-testid="bottom-tab-bar" />,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SidebarTrigger: (props: { className?: string }) => (
    <button type="button" className={props.className}>
      toggle sidebar
    </button>
  ),
}));
vi.mock("@/components/sync/OfflineBanner", () => ({
  OfflineBanner: () => null,
}));
vi.mock("@/components/StorageWarning", () => ({
  StorageWarning: () => null,
}));
vi.mock("@/components/PWAInstallPrompt", () => ({
  PWAInstallPrompt: () => null,
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
});
