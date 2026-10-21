import { useCallback, useEffect, useId, type ReactNode } from "react";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { Drawer as DrawerPrimitive } from "vaul";
import { useSheetAboveKeyboard } from "@/components/app/FormSheet";
import { Button } from "@/components/ui/button";
import {
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { PageShell } from "./PageShell";
import { BELOW_HEADER, PANE_MAX_HEIGHT, useTwoPanes } from "./pane";

declare module "@tanstack/history" {
  interface HistoryState {
    /** This entry was pushed to open an item in the sheet, so closing it goes back. */
    openPushed?: boolean;
  }
}

export interface OpenItemSearch {
  open?: string;
}

/** For a list-detail route's `validateSearch`: the open item's id. */
export function readOpenItem(search: Record<string, unknown>): OpenItemSearch {
  return typeof search.open === "string" && search.open !== "" ? { open: search.open } : {};
}

const withoutOpen = (search: Record<string, unknown>) => {
  const next = { ...search };
  delete next.open;
  return next;
};

// The key of the entry a close already went back from: a second close while that pop lands
// (the editor's onClose, then the item vanishing) must not leave the page too.
let backedFromKey: string | undefined;

/**
 * The open item of a list-detail page, kept in the URL as `?open=<id>`.
 * With one pane, opening pushes an entry, so back closes the sheet; with two,
 * it replaces the entry, so back leaves the page. Call it inside the
 * list-detail `PageShell`, which knows how many panes it shows.
 */
export function useOpenItem() {
  const router = useRouter();
  const navigate = useNavigate();
  const twoPanes = useTwoPanes();
  const openId = useSearch({
    strict: false,
    select: (search: Record<string, unknown>) => readOpenItem(search).open ?? null,
  });

  const open = useCallback(
    (id: string) => {
      const { location } = router.state;
      const push = !twoPanes && readOpenItem(location.search).open === undefined;
      void navigate({
        // Route-agnostic: each list-detail route validates `open` itself.
        search: ((previous: Record<string, unknown>) => ({ ...previous, open: id })) as never,
        replace: !push,
        resetScroll: false,
        state: { openPushed: push || location.state.openPushed === true },
      });
    },
    [router, navigate, twoPanes]
  );

  const close = useCallback(() => {
    const { location } = router.state;
    if (readOpenItem(location.search).open === undefined) return;
    if (location.state.openPushed) {
      if (backedFromKey === location.state.__TSR_key) return;
      backedFromKey = location.state.__TSR_key;
      router.history.back();
      return;
    }
    void navigate({ search: withoutOpen as never, replace: true, resetScroll: false });
  }, [router, navigate]);

  return { openId, open, close };
}

interface DetailPaneProps<T> {
  title: ReactNode;
  description?: ReactNode;
  /** The open item from the local projections: undefined while they load, null once it's gone. */
  item: T | null | undefined;
  children: (item: T) => ReactNode;
}

/**
 * Shows a list-detail page's open item: in the Detail slot beside the list
 * from a shell width of 840, and in a bottom sheet over the list below it.
 * A stale id (the item was removed or synced away) closes it.
 */
export function DetailPane<T>({ title, description, item, children }: DetailPaneProps<T>) {
  const twoPanes = useTwoPanes();
  const { openId, close } = useOpenItem();
  const gone = openId !== null && item === null;
  useEffect(() => {
    if (gone) close();
  }, [gone, close]);

  if (openId === null || item === null || item === undefined) return null;
  const content = children(item);
  return twoPanes ? (
    <Pane title={title} description={description} onClose={close}>
      {content}
    </Pane>
  ) : (
    <Sheet title={title} description={description} onClose={close}>
      {content}
    </Sheet>
  );
}

interface ShownProps {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

function Pane({ title, description, onClose, children }: ShownProps) {
  const titleId = useId();
  return (
    <PageShell.Detail>
      <section
        aria-labelledby={titleId}
        className={cn(
          "@container sticky space-y-4 overflow-y-auto rounded-md border p-4",
          BELOW_HEADER,
          PANE_MAX_HEIGHT
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-heading">
              {title}
            </h2>
            {description && <p className="text-body text-muted-foreground">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </section>
    </PageShell.Detail>
  );
}

function Sheet({ title, description, onClose, children }: ShownProps) {
  const aboveKeyboard = useSheetAboveKeyboard();
  return (
    // The open item's URL entry stands in for the drawer's own back-close entry.
    <DrawerPrimitive.Root open onOpenChange={(open) => !open && onClose()} repositionInputs={false}>
      <DrawerContent
        {...aboveKeyboard}
        {...(!description && { "aria-describedby": undefined })}
        // Reviewing comes first; focusing a field would open a phone's keyboard.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          aboveKeyboard.ref.current?.focus();
        }}
      >
        <DrawerHeader>
          <DrawerTitle className="truncate">{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="@container overflow-y-auto overscroll-contain px-4 pb-6">{children}</div>
      </DrawerContent>
    </DrawerPrimitive.Root>
  );
}
