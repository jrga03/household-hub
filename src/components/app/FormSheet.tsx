import { useEffect, useRef, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { PHONE_QUERY, useIsMobile } from "@/hooks/useMediaQuery";
import { useVisibleArea } from "@/hooks/useVisibleArea";
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
 * dismiss. Put the form's buttons in a `FormFooter` after its last field.
 */
export function FormSheet(props: FormSheetProps) {
  const isPhone = useIsMobile();
  return isPhone ? <PhoneSheet {...props} /> : <WideDialog {...props} />;
}

const closeOn = (onClose: () => void) => (open: boolean) => !open && onClose();

function PhoneSheet({ title, description, onClose, children }: FormSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { top, inset, viewportHeight } = useVisibleArea();

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
        // Its top stays in the visible area, which iOS may have panned down the page.
        style={
          inset > 0 || top > 0
            ? { paddingBottom: inset, maxHeight: `calc(${viewportHeight + inset}px - 1rem)` }
            : undefined
        }
      >
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="@container overflow-y-auto overscroll-contain px-4">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

function WideDialog({ title, description, onClose, children }: FormSheetProps) {
  return (
    <Dialog open onOpenChange={closeOn(onClose)}>
      <DialogContent
        className="@container max-h-[90dvh] overflow-y-auto"
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

interface DestructiveAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The form's buttons, after its last field; they scroll with the form. A
 * destructive action (Remove, Retire) sits apart below them as a text button.
 */
export function FormFooter({
  className,
  destructive,
  children,
}: {
  className?: string;
  destructive?: DestructiveAction;
  children: ReactNode;
}) {
  return (
    <div data-slot="form-footer" className="pt-2 pb-[max(1rem,var(--safe-area-bottom))]">
      <div
        className={cn(
          "flex flex-col-reverse gap-2 @[480px]:flex-row @[480px]:justify-end",
          className
        )}
      >
        {children}
      </div>
      {destructive && (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive active:text-destructive mt-6 w-full @[480px]:w-auto"
          onClick={destructive.onClick}
          disabled={destructive.disabled}
        >
          {destructive.label}
        </Button>
      )}
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
