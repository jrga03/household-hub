import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHeaderSlot } from "./HeaderActions";

interface ContextModeProps {
  /** Shown as the header's title, such as "3 selected". */
  title: string;
  /** The accessible name of the header's ✕. */
  exitLabel: string;
  onExit: () => void;
  /** Wraps the actions where they're placed on wide screens. */
  inlineClassName?: string;
  /** The mode's actions: on phones they replace the tab bar and the Add button. */
  children: ReactNode;
}

/**
 * While mounted, the header shows `title` with a ✕ that calls `onExit`
 * (Escape does too), and the actions take the tab bar's place on phones.
 * On wide screens they render where the mode is placed.
 */
export function ContextMode({
  title,
  exitLabel,
  onExit,
  inlineClassName,
  children,
}: ContextModeProps) {
  const { setMode, bottomSlot } = useHeaderSlot();
  // Read when exiting, so a new onExit each render doesn't re-register the mode.
  const exitRef = useRef(onExit);
  useLayoutEffect(() => {
    exitRef.current = onExit;
  });

  useLayoutEffect(() => {
    setMode({ title, exitLabel, exit: () => exitRef.current() });
  }, [setMode, title, exitLabel]);
  useLayoutEffect(() => () => setMode(null), [setMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape belongs to an open dialog first.
      if (event.key !== "Escape" || document.querySelector("[role=dialog],[role=alertdialog]")) {
        return;
      }
      exitRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  if (bottomSlot) return createPortal(children, bottomSlot);
  return <div className={inlineClassName}>{children}</div>;
}

/**
 * The phone's bottom edge: the tab bar and Add button, or a mode's actions in
 * the same footprint, so `--bottom-chrome` holds either way.
 */
export function PhoneBottomChrome({ children }: { children: ReactNode }) {
  const { mode, setBottomSlot } = useHeaderSlot();
  return (
    <>
      {!mode && children}
      <div
        ref={setBottomSlot}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[var(--safe-area-bottom)] empty:hidden"
      />
    </>
  );
}
