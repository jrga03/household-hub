/**
 * App-wide TanStack QueryClient singleton
 *
 * Lives outside the React tree so non-component layers (e.g. the sync
 * processor) can invalidate server-state queries after a background outbox
 * drain (review R9). main.tsx mounts this same instance in
 * <QueryClientProvider>, so useQueryClient() returns it too.
 *
 * @module lib/queryClient
 */

import { QueryClient } from "@tanstack/react-query";

// Create query client with optimized default options
export const queryClient = new QueryClient({
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
