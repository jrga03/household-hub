import { useEffect, ReactNode } from "react";
import { useAuthStore } from "@/stores/authStore";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ConfirmDialogHost } from "@/components/ConfirmDialog";

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);
  const initialized = useAuthStore((state) => state.initialized);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Branded, screen-reader-announced boot screen (review R41): every app
  // boot passes through here, so it must not be a silent unlabeled spinner
  if (!initialized) {
    return <LoadingScreen />;
  }

  return (
    <>
      {children}
      {/* Single app-level host for the imperative confirm() AlertDialog
          (review R39). Dark mode is class-based on <html>, so rendering
          above App's ThemeProvider is fine. */}
      <ConfirmDialogHost />
    </>
  );
}
