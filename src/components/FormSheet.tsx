import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { PHONE_QUERY, useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

interface FormSheetProps {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The container every form opens in: a bottom sheet on phones, a centered
 * dialog on wider screens. Mount it to open it; it calls `onClose` on
 * dismiss. Put the form's buttons in a `FormFooter` so they stay in view.
 */
export function FormSheet(props: FormSheetProps) {
  const isPhone = useIsMobile();
  return isPhone ? <PhoneSheet {...props} /> : <WideDialog {...props} />;
}

/**
 * The pinned footer reaches the container's edges, so the fields scrolling
 * under it can't show their borders past its sides.
 */
const FOOTER_TO_EDGES_PX_4 = "[&_[data-slot=form-footer]]:-mx-4 [&_[data-slot=form-footer]]:px-4";
const FOOTER_TO_EDGES_PX_6 = "[&_[data-slot=form-footer]]:-mx-6 [&_[data-slot=form-footer]]:px-6";

const closeOn = (onClose: () => void) => (open: boolean) => !open && onClose();

function PhoneSheet({ title, description, onClose, children }: FormSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { inset, viewportHeight } = useVisibleArea();

  // The keyboard opening (or the page shrinking for it) mustn't hide the field being typed in.
  useEffect(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && sheetRef.current?.contains(focused)) {
      focused.scrollIntoView({ block: "nearest" });
    }
  }, [viewportHeight]);

  return (
    // vaul's own input repositioning fights the keyboard handling here, so it is off.
    <Drawer open onOpenChange={closeOn(onClose)} repositionInputs={false}>
      <DrawerContent
        ref={sheetRef}
        // The sheet runs on under the keyboard, its content padded above it: moving the sheet up instead leaves a seam at its edge.
        style={
          inset > 0
            ? { paddingBottom: inset, maxHeight: `calc(${viewportHeight + inset}px - 1rem)` }
            : undefined
        }
      >
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div
          className={cn(
            "@container overflow-y-auto overscroll-contain px-4 scroll-pb-24",
            FOOTER_TO_EDGES_PX_4
          )}
        >
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function WideDialog({ title, description, onClose, children }: FormSheetProps) {
  return (
    <Dialog open onOpenChange={closeOn(onClose)}>
      <DialogContent
        className={cn(
          "@container max-h-[90dvh] overflow-y-auto scroll-pb-24",
          FOOTER_TO_EDGES_PX_6
        )}
        {...(!description && { "aria-describedby": undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

interface VisibleArea {
  /** How much of the page bottom an on-screen keyboard covers, in px. */
  inset: number;
  viewportHeight: number;
}

/**
 * The part of the page the person can see. iOS Safari lays the keyboard over
 * the page, so `inset` is its height; where the browser shrinks the page for
 * it instead (`interactive-widget=resizes-content`), `inset` stays 0.
 */
function useVisibleArea(): VisibleArea {
  const [area, setArea] = useState<VisibleArea>(() => ({
    inset: 0,
    viewportHeight: window.visualViewport?.height ?? window.innerHeight,
  }));
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const covered = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
      // A pinch zoom shrinks the visual viewport too; that isn't a keyboard.
      const zoomed = viewport.scale > 1;
      const viewportHeight = Math.round(viewport.height);
      const inset = covered > 0 && !zoomed ? covered : 0;
      setArea((previous) =>
        previous.inset === inset && previous.viewportHeight === viewportHeight
          ? previous
          : { inset, viewportHeight }
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return area;
}

/** The form's buttons, pinned to the bottom of the sheet or dialog while the fields scroll. */
export function FormFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      data-slot="form-footer"
      className={cn(
        "bg-background sticky -bottom-px flex flex-col-reverse gap-2 pt-2 pb-[max(1rem,var(--safe-area-bottom))] @[480px]:flex-row @[480px]:justify-end",
        className
      )}
    >
      {children}
    </div>
  );
}

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "tel", "url", "password", "number"]);

/** Fields the keyboard types into; pickers (date, select, radio) are left to taps. */
function isTypedField(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  const typed =
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type));
  return typed && !element.disabled && !element.readOnly;
}

/**
 * A form's `ref`. On phones, Enter in a field moves to the next typed field,
 * and from the last one submits; Enter in a text area stays a new line. On
 * wider screens Enter keeps submitting the form. Pair it with
 * `enterKeyHint="next"` or `"done"` on the inputs.
 */
export function advanceOnEnter(form: HTMLFormElement | null) {
  if (!form) return;
  const advance = (event: KeyboardEvent) => {
    const field = event.target;
    const modified = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
    if (event.key !== "Enter" || modified || event.isComposing) return;
    if (!window.matchMedia(PHONE_QUERY).matches) return;
    if (!(field instanceof HTMLInputElement) || !isTypedField(field)) return;

    event.preventDefault();
    const fields = [...form.elements].filter(isTypedField);
    const next = fields[fields.indexOf(field) + 1];
    if (next) next.focus();
    else form.requestSubmit();
  };
  form.addEventListener("keydown", advance);
  return () => form.removeEventListener("keydown", advance);
}
