/**
 * Lazy Loading Utility
 *
 * Provides helper functions for code-splitting and lazy loading components.
 * Use this for heavy routes or components that aren't needed on initial load.
 *
 * Benefits:
 * - Reduces initial bundle size
 * - Faster initial page load
 * - Better long-term caching (vendors cached separately)
 * - On-demand loading for rarely-used features
 *
 * @example
 * // In route file
 * import { lazyRouteComponent } from '@/lib/lazy';
 *
 * export const Route = createFileRoute('/analytics')({
 *   component: lazyRouteComponent(() => import('./AnalyticsPage')),
 * });
 *
 * @example
 * // For heavy components within a page
 * const HeavyChart = lazyComponent(() => import('@/components/HeavyChart'));
 *
 * function Dashboard() {
 *   return (
 *     <Suspense fallback={<Loading />}>
 *       <HeavyChart data={data} />
 *     </Suspense>
 *   );
 * }
 */

import { lazy, ComponentType, Suspense, ReactElement } from "react";
import { Loader2 } from "lucide-react";

/**
 * Default loading fallback for lazy components
 */
function DefaultLoadingFallback() {
  return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/**
 * Lazy load a component with automatic Suspense boundary
 *
 * @param importFn - Dynamic import function
 * @param fallback - Optional custom loading component
 * @returns Lazy-loaded component wrapped in Suspense
 *
 * @example
 * const Analytics = lazyComponent(() => import('./Analytics'));
 *
 * function Dashboard() {
 *   return <Analytics />; // Automatically shows loading state
 * }
 */
export function lazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  fallback: ReactElement = <DefaultLoadingFallback />
): ComponentType<React.ComponentProps<T>> {
  const LazyComponent = lazy(importFn);

  return function LazyComponentWithSuspense(props: React.ComponentProps<T>) {
    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

/**
 * Lazy load a route component (for TanStack Router)
 *
 * Similar to lazyComponent but optimized for route-level code splitting.
 * Routes should be lazy loaded to reduce initial bundle size.
 *
 * @param importFn - Dynamic import function
 * @returns Lazy-loaded route component
 *
 * @example
 * export const Route = createFileRoute('/analytics')({
 *   component: lazyRouteComponent(() => import('./AnalyticsPage')),
 * });
 */
export function lazyRouteComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): ComponentType<React.ComponentProps<T>> {
  return lazy(importFn);
}

/**
 * Preload a lazy component
 *
 * Useful for prefetching components on hover or when user is likely to navigate.
 *
 * @param importFn - Same import function used in lazyComponent
 *
 * @example
 * <Link
 *   to="/analytics"
 *   onMouseEnter={() => preloadComponent(() => import('./Analytics'))}
 * >
 *   Analytics
 * </Link>
 */
export function preloadComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): void {
  // Calling the import function starts the download
  // The browser will cache it for when it's actually needed
  importFn();
}
