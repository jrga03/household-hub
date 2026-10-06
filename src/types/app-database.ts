import type { Cents } from "@/lib/currency";
import type { Database } from "@/types/database.types";

type Public = Database["public"];
type NonTransferView = Public["Views"]["transactions_non_transfer"];

// Every BIGINT money column is branded where rows enter the typed client.
type CentsColumn = `${string}_cents` | "overpayment_amount";
type BrandValue<V> = V extends number ? Cents : V;
type BrandRow<R> = { [K in keyof R]: K extends CentsColumn ? BrandValue<R[K]> : R[K] };
type BrandTable<T extends { Row: unknown; Insert: unknown; Update: unknown }> = Omit<
  T,
  "Row" | "Insert" | "Update"
> & { Row: BrandRow<T["Row"]>; Insert: BrandRow<T["Insert"]>; Update: BrandRow<T["Update"]> };
type BrandReturns<R> = R extends readonly (infer E)[] ? BrandRow<E>[] : R;
type BrandFunction<F extends { Returns: unknown }> = Omit<F, "Returns"> & {
  Returns: BrandReturns<F["Returns"]>;
};

type Tables = { [T in keyof Public["Tables"]]: BrandTable<Public["Tables"][T]> };
type Functions = { [F in keyof Public["Functions"]]: BrandFunction<Public["Functions"][F]> };

/** Postgres marks every view column nullable; the view is `select * from transactions where transfer_group_id is null`, so its row is the table's row (pgTAP 210 checks column parity). */
export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Public, "Tables" | "Views" | "Functions"> & {
    Tables: Tables;
    Functions: Functions;
    Views: Omit<Public["Views"], "transactions_non_transfer"> & {
      transactions_non_transfer: {
        Row: Tables["transactions"]["Row"];
        Relationships: NonTransferView["Relationships"];
      };
    };
  };
};

export type SameKeys<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : false
  : false;

// Fails tsc when `transactions` gains or loses a column that the view has not been recreated to match.
export const transactionsViewKeysMatchTable: SameKeys<
  NonTransferView["Row"],
  Public["Tables"]["transactions"]["Row"]
> = true;
