import type { Database } from "@/types/database.types";

type Public = Database["public"];
type NonTransferView = Public["Views"]["transactions_non_transfer"];

/** Postgres marks every view column nullable; the view is `select * from transactions where transfer_group_id is null`, so its row is the table's row (pgTAP 210 checks column parity). */
export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Public, "Views"> & {
    Views: Omit<Public["Views"], "transactions_non_transfer"> & {
      transactions_non_transfer: {
        Row: Public["Tables"]["transactions"]["Row"];
        Relationships: NonTransferView["Relationships"];
      };
    };
  };
};

type SameKeys<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : false
  : false;

// Fails tsc when `transactions` gains or loses a column that the view has not been recreated to match.
export const transactionsViewKeysMatchTable: SameKeys<
  NonTransferView["Row"],
  Public["Tables"]["transactions"]["Row"]
> = true;
