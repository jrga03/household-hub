import { useEffect } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { QuickActionButton } from "./QuickActionButton";
import { useNavStore } from "@/stores/navStore";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { cn } from "@/lib/utils";
import { GlobalSyncStatus } from "@/components/sync/GlobalSyncStatus";
import { OfflineBanner } from "@/components/sync/OfflineBanner";
import { StorageWarning } from "@/components/StorageWarning";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { TransactionFormDialog } from "@/components/TransactionFormDialog";

/**
 * Main application layout component
 *
 * Handles responsive layout logic:
 * - Mobile: Header with hamburger + drawer navigation + FAB
 * - Tablet: Collapsible sidebar (default collapsed)
 * - Desktop: Collapsible sidebar (default expanded)
 *
 * Features:
 * - Authentication-aware (no nav on login/signup)
 * - Keyboard shortcuts
 * - Responsive breakpoint management
 * - Persistent sidebar preferences
 * - Skip to main content for accessibility
 *
 * @see src/routes/__root.tsx - Integration point
 */

// Routes that should not show navigation
const NO_NAV_ROUTES = ["/login", "/signup"];

export function AppLayout() {
  const router = useRouterState();
  const { mobileNavOpen, setMobileNavOpen, setActiveRoute } = useNavStore();

  // Responsive breakpoints
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  // Track active route
  useEffect(() => {
    setActiveRoute(router.location.pathname);
  }, [router.location.pathname, setActiveRoute]);

  // Authentication is enforced BEFORE render by the root route's beforeLoad
  // guard (routes/__root.tsx); no effect-based redirects here (review UI-07)
  const currentPath = router.location.pathname;
  const isAuthRoute = NO_NAV_ROUTES.includes(currentPath);

  // If on auth pages (login/signup), render without navigation
  if (isAuthRoute) {
    return (
      <div className="min-h-dvh bg-background">
        <Outlet />
      </div>
    );
  }

  // Mobile layout
  if (isMobile) {
    return (
      <div className="min-h-dvh bg-background">
        {/* Skip to main content link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg focus:ring-2 focus:ring-primary"
        >
          Skip to main content
        </a>

        {/* Mobile Header */}
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[var(--safe-area-top)]">
          <div className="flex h-14 items-center px-4">
            {/* Hamburger Menu */}
            <Button
              variant="ghost"
              size="icon"
              className="mr-2"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* App Title */}
            <div className="flex flex-1 items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-xs font-bold">HH</span>
              </div>
              <span className="font-semibold">Household Hub</span>
            </div>

            {/* Sync Status */}
            <GlobalSyncStatus variant="compact" />
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

        {/* Offline + storage banners (shared fixed stack) */}
        <BannerStack />

        {/* Main Content: bottom inset keeps the FAB from covering the last
            row's amounts on every route (review R13) */}
        <main
          id="main-content"
          className="flex-1 bg-background pb-[calc(5.5rem+var(--safe-area-bottom))]"
        >
          <Outlet />
        </main>

        {/* Floating Action Button */}
        <QuickActionButton />

        {/* Quick-add dialog (FAB, drawer CTA, and shortcuts drive navStore) */}
        <QuickAddTransactionDialog />

        {/* PWA Installation Prompt */}
        <PWAInstallPrompt />
      </div>
    );
  }

  // Tablet/Desktop layout with sidebar
  return (
    <SidebarProvider defaultOpen={!isTablet}>
      {/* w-full keeps the layout's width tied to the SidebarProvider wrapper
          rather than to descendant min-content widths. Required so that pages
          using container queries (PageShell) don't collapse the flex chain. */}
      <div className="flex min-h-dvh w-full">
        {/* Skip to main content link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg focus:ring-2 focus:ring-primary"
        >
          Skip to main content
        </a>

        {/* Sidebar */}
        <AppSidebar />

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col">
          {/* Optional Header for tablet/desktop (minimal) */}
          <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden pt-[var(--safe-area-top)]">
            <div className="flex h-14 items-center px-4">
              <SidebarTrigger className="mr-2" />
              <div className="flex flex-1 items-center">
                <PageTitle />
              </div>
            </div>
          </header>

          {/* Offline + storage banners (shared fixed stack) */}
          <BannerStack />

          {/* Main Content */}
          <main
            id="main-content"
            className={cn(
              "flex-1 bg-background",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "relative"
            )}
            tabIndex={-1}
          >
            <Outlet />
          </main>
        </div>

        {/* Quick-add dialog (sidebar/drawer CTAs and shortcuts drive navStore) */}
        <QuickAddTransactionDialog />

        {/* PWA Installation Prompt */}
        <PWAInstallPrompt />
      </div>
    </SidebarProvider>
  );
}

/**
 * Shared fixed container for the top-edge banners (offline + storage quota).
 * The container owns positioning so simultaneous banners stack instead of
 * overpainting each other (review R29). Both children render null when
 * inactive, so the container collapses to zero height. pointer-events-none
 * keeps the empty strip from blocking content; each banner re-enables
 * pointer events on its own card.
 */
function BannerStack() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(4rem+var(--safe-area-top))] z-40 flex flex-col gap-2">
      <OfflineBanner />
      <StorageWarning />
    </div>
  );
}

/**
 * Single consumer of navStore.quickAddOpen. The mobile FAB, the sidebar
 * "Add Transaction" button, the mobile drawer CTA, keyboard shortcuts, and
 * the /transactions/new manifest-shortcut route all set the flag; this
 * renders the dialog for whichever layout branch is mounted.
 *
 * Mounted conditionally because TransactionFormDialog fetches data on mount.
 */
function QuickAddTransactionDialog() {
  const quickAddOpen = useNavStore((state) => state.quickAddOpen);
  const setQuickAddOpen = useNavStore((state) => state.setQuickAddOpen);

  if (!quickAddOpen) return null;

  return <TransactionFormDialog open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />;
}

/**
 * Page title component for tablet header
 * Shows the current page name based on route
 */
function PageTitle() {
  const router = useRouterState();
  const path = router.location.pathname;

  // Map routes to titles
  const getTitleFromPath = (pathname: string): string => {
    if (pathname === "/") return "Dashboard";
    if (pathname.startsWith("/transactions")) return "Transactions";
    if (pathname.startsWith("/accounts")) return "Accounts";
    if (pathname.startsWith("/categories")) return "Categories";
    if (pathname.startsWith("/budgets")) return "Budgets";
    if (pathname.startsWith("/analytics")) return "Analytics";
    if (pathname.startsWith("/transfers")) return "Transfers";
    if (pathname.startsWith("/import/pdf")) return "PDF Import";
    if (pathname.startsWith("/import")) return "Import";
    if (pathname.startsWith("/drafts")) return "Drafts";
    if (pathname.startsWith("/settings")) return "Settings";
    return "Household Hub";
  };

  return <h1 className="text-lg font-semibold">{getTitleFromPath(path)}</h1>;
}
