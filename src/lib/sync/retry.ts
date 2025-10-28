/**
 * Retry Logic with Exponential Backoff
 *
 * Provides utilities for retrying failed sync operations with exponential
 * backoff and jitter to prevent thundering herd problems.
 *
 * Key Concepts:
 * - Exponential Backoff: 2^n * baseDelay (1s, 2s, 4s, 8s, 16s, ...)
 * - Jitter: Random 0-1s added to prevent synchronized retries
 * - Max Delay Cap: Prevents indefinite growth
 *
 * See SYNC-ENGINE.md lines 176-224 for retry strategy.
 *
 * @module sync/retry
 */

/**
 * Retry configuration settings
 */
export interface RetryConfig {
  /** Maximum number of retry attempts before giving up */
  maxRetries: number;

  /** Base delay in milliseconds (multiplied by 2^retryCount) */
  baseDelay: number;

  /** Maximum delay cap in milliseconds (prevents unbounded growth) */
  maxDelay: number;
}

/**
 * Default retry configuration
 *
 * - Max 3 retries (4 total attempts including first try)
 * - Base delay: 1 second
 * - Max delay: 30 seconds (cap for slow networks)
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
};

/**
 * Calculate exponential backoff delay with jitter
 *
 * Formula: min(2^retryCount * baseDelay, maxDelay) + jitter
 *
 * Retry delays with default config:
 * - Retry 1: ~1s (1000ms + jitter)
 * - Retry 2: ~2s (2000ms + jitter)
 * - Retry 3: ~4s (4000ms + jitter)
 *
 * Jitter prevents thundering herd: Multiple devices won't retry
 * at the exact same time, reducing server load spikes.
 *
 * @param retryCount - Number of retries attempted (0-indexed)
 * @param config - Retry configuration (optional, uses defaults)
 * @returns Delay in milliseconds before next retry
 *
 * @example
 * // First retry (retryCount = 0)
 * const delay = calculateRetryDelay(0);
 * // Returns ~1000-2000ms (1s + jitter)
 *
 * @example
 * // Third retry (retryCount = 2)
 * const delay = calculateRetryDelay(2);
 * // Returns ~4000-5000ms (4s + jitter)
 */
export function calculateRetryDelay(
  retryCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Exponential: 2^n * base
  // retryCount=0: 2^0 = 1 → 1s
  // retryCount=1: 2^1 = 2 → 2s
  // retryCount=2: 2^2 = 4 → 4s
  // retryCount=3: 2^3 = 8 → 8s
  const exponential = Math.pow(2, retryCount) * config.baseDelay;

  // Cap at maxDelay to prevent unbounded growth
  const capped = Math.min(exponential, config.maxDelay);

  // Add jitter (0-1s random) to prevent synchronized retries
  const jitter = Math.random() * 1000;

  return capped + jitter;
}

/**
 * Sleep utility for async delays
 *
 * Returns a promise that resolves after the specified milliseconds.
 * Used with await to pause execution during retry backoff.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 *
 * @example
 * const delay = calculateRetryDelay(1);
 * await sleep(delay); // Wait ~2 seconds before retry
 * await processItem(item); // Retry the operation
 *
 * @example
 * // Manual retry loop
 * for (let retry = 0; retry < 3; retry++) {
 *   try {
 *     await processItem(item);
 *     break; // Success - exit loop
 *   } catch (error) {
 *     const delay = calculateRetryDelay(retry);
 *     await sleep(delay); // Wait before next retry
 *   }
 * }
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
