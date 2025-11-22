import { useEffect } from "react";
import { Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { QuickActionButton } from "./QuickActionButton";
import { useAuthStore } from "@/stores/authStore";
import { useNavStore } from "@/stores/navStore";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { cn } from "@/lib/utils";
import { GlobalSyncStatus } from "@/components/sync/GlobalSyncStatus";
import { LoadingScreen } from "@/components/LoadingScreen";
import { OfflineBanner } from "@/components/sync/OfflineBanner";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

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
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
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

  // Get current path
  const currentPath = router.location.pathname;
  const isAuthRoute = NO_NAV_ROUTES.includes(currentPath);

  // Authentication Protection
  useEffect(() => {
    // Wait for auth to initialize
    if (!initialized) return;

    // If not authenticated and not on auth page, redirect to login
    if (!user && !isAuthRoute) {
      // Store the intended destination
      sessionStorage.setItem("redirectUrl", currentPath);
      // Redirect to login
      navigate({ to: "/login" });
    }
  }, [user, initialized, currentPath, isAuthRoute, navigate]);

  // Show loading screen while checking auth
  if (!initialized) {
    return <LoadingScreen />;
  }

  // If on auth pages (login/signup), render without navigation
  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    );
  }

  // If not authenticated and not on auth page, show loading
  // (redirect will happen via useEffect)
  if (!user) {
    return <LoadingScreen />;
  }

  // Mobile layout
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background">
        {/* Skip to main content link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg focus:ring-2 focus:ring-primary"
        >
          Skip to main content
        </a>

        {/* Mobile Header */}
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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

        {/* Offline Banner */}
        <OfflineBanner />

        {/* Main Content */}
        <main id="main-content" className="flex-1">
          <Outlet />
        </main>

        {/* Floating Action Button */}
        <QuickActionButton />

        {/* PWA Installation Prompt */}
        <PWAInstallPrompt />
      </div>
    );
  }

  // Tablet/Desktop layout with sidebar
  return (
    <SidebarProvider defaultOpen={!isTablet}>
      <div className="flex min-h-screen">
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
          <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden">
            <div className="flex h-14 items-center px-4">
              <SidebarTrigger className="mr-2" />
              <div className="flex flex-1 items-center">
                <PageTitle />
              </div>
            </div>
          </header>

          {/* Offline Banner */}
          <OfflineBanner />

          {/* Main Content */}
          <main
            id="main-content"
            className={cn(
              "flex-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "relative"
            )}
            tabIndex={-1}
          >
            <Outlet />
          </main>
        </div>

        {/* PWA Installation Prompt */}
        <PWAInstallPrompt />
      </div>
    </SidebarProvider>
  );
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
    if (pathname.startsWith("/import")) return "Import";
    if (pathname.startsWith("/settings")) return "Settings";
    return "Household Hub";
  };

  return <h1 className="text-lg font-semibold">{getTitleFromPath(path)}</h1>;
}
