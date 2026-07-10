/**
 * Typed offline error for query fallbacks (review R11)
 *
 * Thrown by queryFns when the network is unreachable AND the local Dexie
 * mirror has nothing to serve (e.g. a month of budgets that was never
 * fetched on this device). Routes branch on `isOfflineError` to render an
 * honest "you're offline" empty state instead of a false "no data" one, and
 * the shared QueryClient skips retries for it so offline screens fail fast
 * instead of burning through the exponential-backoff schedule.
 *
 * Builds on `isLikelyNetworkError` (lib/offline/reads.ts): that helper
 * decides WHETHER a failure should fall back to Dexie; OfflineError is what
 * the fallback throws when Dexie cannot answer either.
 *
 * @module offline/errors
 */

export class OfflineError extends Error {
  /**
   * Structural brand: without an own member, OfflineError is structurally
   * identical to Error and TS's negative narrowing after `isOfflineError`
   * collapses plain Errors to `never` in the else branch.
   */
  readonly offline = true as const;

  constructor(what = "this data") {
    super(`You're offline and ${what} hasn't been saved to this device yet.`);
    this.name = "OfflineError";
  }
}

/**
 * True when the error is an OfflineError. Checks `name` as well as
 * `instanceof` so errors that crossed a bundling/realm boundary still match.
 */
export function isOfflineError(error: unknown): error is OfflineError {
  return error instanceof OfflineError || (error instanceof Error && error.name === "OfflineError");
}
