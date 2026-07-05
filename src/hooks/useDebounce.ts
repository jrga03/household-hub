import { useEffect, useState } from "react";

/**
 * Custom hook to debounce a value
 *
 * This hook delays updating the returned value until the input value has stopped
 * changing for the specified delay period. Perfect for search inputs to avoid
 * excessive API calls.
 *
 * @example
 * ```typescript
 * const [searchTerm, setSearchTerm] = useState("");
 * const debouncedSearch = useDebounce(searchTerm, 300);
 *
 * // debouncedSearch only updates 300ms after user stops typing
 * useQuery({
 *   queryKey: ["search", debouncedSearch],
 *   queryFn: () => searchAPI(debouncedSearch),
 * });
 * ```
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up a timer to update the debounced value after the delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function: cancel the timer if value changes before delay expires
    // This is the key to debouncing - rapid changes reset the timer
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
