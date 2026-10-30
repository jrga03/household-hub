import { useEffect } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { BottomTabBar } from "./BottomTabBar";
import { PhoneBottomChrome } from "./ContextMode";
import { HeaderSlotProvider } from "./HeaderActions";
import { MobileNav, NavMenuButton } from "./MobileNav";
import { PageHeader } from "./PageHeader";
import { SidebarTriggerWithReview } from "./ReviewCount";
import { useNavStore } from "@/stores/navStore";
import { useWindowClass } from "@/hooks/useMediaQuery";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { cn } from "@/lib/utils";
import { StorageWarning } from "@/components/StorageWarning";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { CREATE_OR_JOIN_PATH } from "@/lib/households";
import { AddTransactionButton, QuickEntryDialog } from "@/components/transactions/QuickEntry";

/**
 * Main application layout component
 *
 * Every branch with navigation shares PageHeader: the route's title, a back
 * arrow on pushed screens, the route's actions and the sync status.
 *
 * Navigation follows the window size class (useWindowClass):
 * - Compact: menu button + drawer, bottom tab bar, and floating Add
 *   transaction on routes that set `staticData.floatingAdd`
 * - Medium: collapsed rail; the menu button opens it expanded as a modal
 * - Expanded: rail collapsed by default
 * - Large: rail expanded by default
 * From medium up, Add transaction sits in the header. The remembered rail
 * toggle (sidebar cookie) wins over the class default.
 *
 * Bottom-edge geometry: everything pinned to the bottom edge
 * derives from the shared `--bottom-chrome` custom property (index.css),
 * which equals the BottomTabBar footprint at compact widths and just the
 * safe area elsewhere. The tab bar and the rail never show together.
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

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** `false` drops the phone's tab bar and Add button, and main's bottom inset for them. */
    bottomChrome?: false;
    /** Shows the phone's floating Add transaction button. */
    floatingAdd?: true;
  }
}

// Routes that should not show navigation
const NO_NAV_ROUTES = ["/login", "/signup", CREATE_OR_JOIN_PATH];

export function AppLayout() {
  const router = useRouterState();
  const { mobileNavOpen, setMobileNavOpen } = useNavStore();

  const windowClass = useWindowClass();

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
  const routeData = router.matches.at(-1)?.staticData;
  const hasBottomChrome = routeData?.bottomChrome !== false;

  // Auth pages and create-or-join render without navigation
  if (isAuthRoute) {
    return (
      <div className="min-h-dvh bg-background">
        <Outlet />
      </div>
    );
  }

  if (windowClass === "compact") {
    return (
      <HeaderSlotProvider>
        {/* Without the tab bar, bottom-pinned content (the Assistant's composer) sits on the safe area. */}
        <div
          className={cn(
            "min-h-dvh bg-background",
            !hasBottomChrome && "[--bottom-chrome:var(--safe-area-bottom)]"
          )}
        >
          {/* Skip to main content link for accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-float focus:ring-2 focus:ring-primary"
          >
            Skip to main content
          </a>

          <PageHeader
            className="z-40"
            compactSync
            menuButton={<NavMenuButton onClick={() => setMobileNavOpen(true)} />}
          />

          {/* Mobile Navigation Drawer */}
          <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

          {/* Offline + storage banners (shared fixed stack) */}
          <BannerStack />

          {/* Main Content: with PageShell's own 2rem, the bottom inset clears the
            tab bar, and the FAB (4.5rem above it) where a route floats it */}
          <main
            id="main-content"
            className={cn(
              "flex-1 bg-background",
              hasBottomChrome && "pb-[calc(3.5rem+var(--bottom-chrome))]"
            )}
          >
            <Outlet />
          </main>

          {/* Bottom tab bar: one-tap access to the primary destinations
            (review R42); a mode such as selecting puts its actions there instead */}
          {hasBottomChrome && (
            <PhoneBottomChrome>
              <BottomTabBar />
              {routeData?.floatingAdd && <AddTransactionButton floating />}
            </PhoneBottomChrome>
          )}
          <QuickEntryDialog />

          {/* PWA Installation Prompt */}
          <PWAInstallPrompt />
        </div>
      </HeaderSlotProvider>
    );
  }

  return (
    <HeaderSlotProvider>
      <SidebarProvider defaultOpen={windowClass === "large"}>
        {/* w-full keeps the layout's width tied to the SidebarProvider wrapper
          rather than to descendant min-content widths. Required so that pages
          using container queries (PageShell) don't collapse the flex chain. */}
        <div className="flex min-h-dvh w-full">
          {/* Skip to main content link for accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-float focus:ring-2 focus:ring-primary"
          >
            Skip to main content
          </a>

          {/* Sidebar */}
          <AppSidebar />

          {/* Main Content Area */}
          <div className="flex flex-1 flex-col">
            <PageHeader
              className="z-30"
              menuButton={<SidebarTriggerWithReview className="large:hidden" />}
            >
              <AddTransactionButton />
            </PageHeader>

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

          <QuickEntryDialog />

          {/* PWA Installation Prompt */}
          <PWAInstallPrompt />
        </div>
      </SidebarProvider>
    </HeaderSlotProvider>
  );
}

/**
 * Shared fixed container for the top-edge banners (storage quota for now).
 * The container owns positioning so simultaneous banners stack instead of
 * overpainting each other (review R29). Each banner renders null when
 * inactive, so the container collapses to zero height. pointer-events-none
 * keeps the empty strip from blocking content; each banner re-enables
 * pointer events on its own card.
 */
function BannerStack() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(4rem+var(--safe-area-top))] z-40 flex flex-col gap-2">
      <StorageWarning />
    </div>
  );
}
