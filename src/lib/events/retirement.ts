/**
 * Where a retire, unretire, delete or restore leaves an account, group or
 * category; the latest one wins. A deleted record is retired too, so every
 * list of records in use leaves it out.
 */
export interface Retirement {
  retired: boolean;
  /** Hidden everywhere unless something references it (see `src/lib/history`). */
  deleted: boolean;
}

export const RETIRED: Retirement = { retired: true, deleted: false };
export const UNRETIRED: Retirement = { retired: false, deleted: false };
export const DELETED: Retirement = { retired: true, deleted: true };
/** Undoing a delete brings the record back retired. */
export const RESTORED: Retirement = { retired: true, deleted: false };
