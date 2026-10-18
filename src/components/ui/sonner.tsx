import React, { useSyncExternalStore } from "react";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useIsMobile } from "@/hooks/useMediaQuery";

// Radix dialogs and the vaul sheets built on them mark the body while open.
const SCROLL_LOCK = "data-scroll-locked";

function subscribeToScrollLock(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { attributes: true, attributeFilter: [SCROLL_LOCK] });
  return () => observer.disconnect();
}

const isScrollLocked = () => document.body.hasAttribute(SCROLL_LOCK);

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isPhone = useIsMobile();
  const overlayOpen = useSyncExternalStore(subscribeToScrollLock, isScrollLocked, () => false);
  // A phone sheet rises from the bottom, where toasts sit, so they move to the top while one is open.
  const position = isPhone && overlayOpen ? "top-center" : undefined;

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 motion-safe:animate-spin" />,
      }}
      // Lift toasts clear of the bottom tab bar, the FAB, and the iOS
      // home-indicator zone (reviews R7, R42). --toast-bottom (index.css) is
      // media-queried at the app's 767px mobile boundary: FAB+tab-bar
      // clearance through 767px (sonner's own mobile breakpoint is only
      // 600px, so the desktop `offset` must carry the 601-767px band), and
      // ~sonner's 32px default on real desktops.
      position={position}
      // Sonner's own toast shadow is unlayered CSS, so the token needs !important.
      toastOptions={{ classNames: { toast: "shadow-float!" } }}
      mobileOffset={{ bottom: "var(--toast-bottom)", top: "var(--toast-top)" }}
      offset={{ bottom: "var(--toast-bottom)", top: "var(--toast-top)" }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
