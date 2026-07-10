import React from "react";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
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
      mobileOffset={{ bottom: "var(--toast-bottom)" }}
      offset={{ bottom: "var(--toast-bottom)" }}
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
