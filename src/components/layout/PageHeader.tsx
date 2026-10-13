import type { ReactNode } from "react";
import { useCanGoBack, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SyncStatusIndicator } from "@/components/sync/SyncStatusIndicator";
import { useHousehold } from "@/hooks/useHousehold";
import { cn } from "@/lib/utils";
import { useHeaderSlot } from "./HeaderActions";
import type { RoutePath } from "./nav";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** The header's title. Home shows the household's name instead. */
    title?: string;
    /** Set on pushed screens: where the back arrow goes when there's no history to return to. */
    parent?: RoutePath;
  }
}

function usePageHeading() {
  const { household } = useHousehold();
  const leaf = useRouterState({ select: (state) => state.matches.at(-1) });
  const routeTitle = leaf?.staticData.title ?? "";
  const title = leaf?.routeId === "/" ? (household?.name ?? routeTitle) : routeTitle;
  return { title, parent: leaf?.staticData.parent };
}

interface PageHeaderProps {
  /** Opens the navigation; a pushed screen shows a back arrow in its place. */
  menuButton: ReactNode;
  /** Icon-only sync status, for narrow headers. */
  compactSync?: boolean;
  className?: string;
  /** Shell-wide controls after the sync status. */
  children?: ReactNode;
}

/** The page title, a back arrow on pushed screens, the route's actions and the sync status. */
export function PageHeader({ menuButton, compactSync, className, children }: PageHeaderProps) {
  const { title, parent } = usePageHeading();
  const { setSlot } = useHeaderSlot();

  return (
    <header
      className={cn(
        "sticky top-0 border-b bg-background/95 pt-[var(--safe-area-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4">
        {parent ? <BackButton parent={parent} /> : menuButton}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
        <div ref={setSlot} className="flex items-center gap-2 empty:hidden" />
        <SyncStatusIndicator compact={compactSync} />
        {children}
      </div>
    </header>
  );
}

function BackButton({ parent }: { parent: RoutePath }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const goBack = () => {
    if (canGoBack) router.history.back();
    else void router.navigate({ to: parent });
  };

  return (
    <Button variant="ghost" size="icon" aria-label="Back" onClick={goBack}>
      <ArrowLeft className="h-5 w-5" />
    </Button>
  );
}
