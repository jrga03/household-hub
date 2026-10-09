import type { AppDatabase, SameKeys } from "@/types/app-database";
import type { EntityType } from "@/types/sync";

type TransactionInsert = AppDatabase["public"]["Tables"]["transactions"]["Insert"];

export const TRANSACTION_COLUMNS = [
  "account_id",
  "amount_cents",
  "category_id",
  "created_at",
  "created_by_user_id",
  "currency_code",
  "date",
  "debt_id",
  "description",
  "device_id",
  "household_id",
  "id",
  "import_key",
  "internal_debt_id",
  "notes",
  "status",
  "tagged_user_ids",
  "transfer_group_id",
  "type",
  "updated_at",
  "visibility",
] as const;

// Fails tsc when the transactions table gains or loses a column that this list does not match.
/** @public */
export const transactionColumnsMatchTable: SameKeys<
  Record<(typeof TRANSACTION_COLUMNS)[number], unknown>,
  TransactionInsert
> = true;

const transactionColumns: ReadonlySet<string> = new Set(TRANSACTION_COLUMNS);

/** Local transaction rows carry device-only fields (e.g. owner_user_id) that PostgREST rejects. */
export function pickServerColumns(
  entityType: EntityType,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (entityType !== "transaction") return payload;
  return Object.fromEntries(Object.entries(payload).filter(([key]) => transactionColumns.has(key)));
}
