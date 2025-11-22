import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "@/components/AuthProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initSentry } from "@/lib/sentry";

// Initialize Sentry error tracking FIRST (before app render)
// This ensures all errors are captured from the start
initSentry();

// Create query client with optimized default options
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale-while-revalidate: Show cached data immediately, refetch in background
      staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
      gcTime: 10 * 60 * 1000, // 10 minutes - cache persists in memory

      // Retry failed queries with exponential backoff
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch optimizations
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      refetchOnReconnect: true, // Refetch when network reconnects
      refetchOnMount: true, // Refetch when component mounts if stale

      // Network mode for offline-first
      networkMode: "offlineFirst", // Try cache first, fallback to network
    },
    mutations: {
      // Retry failed mutations
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),

      // Network mode for offline-first
      networkMode: "offlineFirst",
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
