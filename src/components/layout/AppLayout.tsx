import { useEffect } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "./AppSidebar";
import { BottomTabBar } from "./BottomTabBar";
import { MobileNav } from "./MobileNav";
import { useNavStore } from "@/stores/navStore";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { cn } from "@/lib/utils";
import { OfflineBanner } from "@/components/sync/OfflineBanner";
import { StorageWarning } from "@/components/StorageWarning";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { CREATE_OR_JOIN_PATH } from "@/lib/households";

/**
 * Main application layout component
 *
 * Handles responsive layout logic:
 * - Mobile: Header with hamburger + drawer navigation + bottom tab bar
 * - Tablet: Collapsible sidebar (default collapsed)
 * - Desktop: Collapsible sidebar (default expanded)
 *
 * Bottom-edge geometry (review R42): everything pinned to the bottom edge
 * derives from the shared `--bottom-chrome` custom property (index.css),
 * which equals the BottomTabBar footprint at mobile widths and just the
 * safe area elsewhere. The tab bar is mobile-branch-only; the
 * tablet/desktop branch (including landscape phones, review C3) keeps the
 * sidebar instead.
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
const NO_NAV_ROUTES = ["/login", "/signup", CREATE_OR_JOIN_PATH];

export function AppLayout() {
  const router = useRouterState();
  const { mobileNavOpen, setMobileNavOpen } = useNavStore();

  // Responsive breakpoints
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  // Safety net for the nav drawer: close it on any pathname change — the drawer's own links close it via onClick, but
  // programmatic navigations and back-gesture pops don't go through those
  // handlers (review R37).
  useEffect(() => {
    setMobileNavOpen(false);
  }, [router.location.pathname, setMobileNavOpen]);

  // Authentication is enforced BEFORE render by the root route's beforeLoad
  // guard (routes/__root.tsx); no effect-based redirects here (review UI-07)
  // Chrome follows the route on screen, not the pending one: swapping branches
  // mid-navigation remounts the current page, and a page that navigates on
  // mount (login, signup) would loop against the household gate's redirect.
  const currentPath = (router.resolvedLocation ?? router.location).pathname;
  const isAuthRoute = NO_NAV_ROUTES.includes(currentPath);

  // Auth pages and create-or-join render without navigation
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
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

        {/* Offline + storage banners (shared fixed stack) */}
        <BannerStack />

        {/* Main Content: bottom inset keeps the tab bar from covering the
            last row on every route (reviews R13, R42) */}
        <main
          id="main-content"
          className="flex-1 bg-background pb-[calc(0.5rem+var(--bottom-chrome))]"
        >
          <Outlet />
        </main>

        {/* Bottom tab bar: one-tap access to the primary destinations
            (review R42) */}
        <BottomTabBar />

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
 * Page title component for tablet header
 * Shows the current page name based on route
 */
function PageTitle() {
  const router = useRouterState();
  const path = router.location.pathname;

  // Map routes to titles
  const getTitleFromPath = (pathname: string): string => {
    if (pathname === "/") return "Home";
    if (pathname.startsWith("/settings")) return "Settings";
    return "Household Hub";
  };

  return <h1 className="text-lg font-semibold">{getTitleFromPath(path)}</h1>;
}
