import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { ThemeColorSync } from "@/components/ThemeColorSync";
import { TooltipProvider } from "@/components/ui/tooltip";
// Router singleton + scroll restoration + Register augmentation live in
// src/router.ts so non-component layers (authStore session expiry) can
// navigate without importing the React tree.
import { router } from "@/router";

function App() {
  // Auth initialization lives in ONE place: AuthProvider (main.tsx wraps App
  // with it). The store's initialize() is idempotent either way (review UI-12).
  return (
    <ErrorBoundary>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        storageKey="household-hub-theme"
      >
        {/* Keeps the browser-chrome theme-color meta in sync with the
            resolved (in-app or system) theme */}
        <ThemeColorSync />

        <TooltipProvider>
          {/* Offline + storage banners render in AppLayout's BannerStack */}

          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
          <Toaster />

          {/* Service worker update prompt (persistent sonner toast; renders
              null itself - the Toaster above displays it) */}
          <UpdatePrompt />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
