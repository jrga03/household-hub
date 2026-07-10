/**
 * AppLayout branch tests (mobile UX review C3):
 *
 * isMobile is width-only (max-width: 767px), so landscape phones
 * (812-932px wide) render the tablet/desktop branch. The FAB must therefore
 * also render in that branch whenever the device's primary pointer is touch
 * ("(pointer: coarse)") — rotating a phone must not delete the primary add
 * action. Mouse-driven desktops stay FAB-free.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppLayout } from "./AppLayout";

const { mockIsMobile, mockIsTablet, mockUseMediaQuery } = vi.hoisted(() => ({
  mockIsMobile: vi.fn((): boolean => false),
  mockIsTablet: vi.fn((): boolean => false),
  mockUseMediaQuery: vi.fn((_query: string): boolean => false),
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useIsMobile: () => mockIsMobile(),
  useIsTablet: () => mockIsTablet(),
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
  useRouterState: () => ({ location: { pathname: "/" } }),
}));

// Heavy neighbors stubbed out — this test targets branch selection only
vi.mock("./AppSidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}));
vi.mock("./MobileNav", () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SidebarTrigger: (props: { className?: string }) => (
    <button type="button" className={props.className}>
      toggle sidebar
    </button>
  ),
}));
vi.mock("@/components/sync/GlobalSyncStatus", () => ({
  GlobalSyncStatus: () => null,
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
vi.mock("@/components/TransactionFormDialog", () => ({
  TransactionFormDialog: () => null,
}));
vi.mock("@/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: () => undefined,
}));

// The REAL QuickActionButton renders (it is light: navStore + Button); the
// assertions below target its accessible name.
const FAB_NAME = "Add transaction";

describe("AppLayout FAB branches (review C3)", () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    mockIsTablet.mockReturnValue(false);
    mockUseMediaQuery.mockReturnValue(false);
  });

  it("renders the FAB in the tablet/desktop branch on coarse-pointer devices (landscape phones)", () => {
    mockIsTablet.mockReturnValue(true);
    mockUseMediaQuery.mockImplementation((query) => query === "(pointer: coarse)");

    render(<AppLayout />);

    // Tablet/desktop branch is mounted (sidebar, not mobile drawer) …
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-nav")).not.toBeInTheDocument();
    // … and the FAB is still available for touch input
    expect(screen.getByRole("button", { name: FAB_NAME })).toBeInTheDocument();
  });

  it("keeps the tablet/desktop branch FAB-free for fine pointers (mouse desktops)", () => {
    mockIsTablet.mockReturnValue(true);
    mockUseMediaQuery.mockReturnValue(false);

    render(<AppLayout />);

    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FAB_NAME })).not.toBeInTheDocument();
  });

  it("still renders the FAB in the mobile branch regardless of pointer type", () => {
    mockIsMobile.mockReturnValue(true);

    render(<AppLayout />);

    expect(screen.getByTestId("mobile-nav")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: FAB_NAME })).toBeInTheDocument();
  });
});
