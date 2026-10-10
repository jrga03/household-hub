import { expectTypeOf, it } from "vitest";
import type { Cents } from "@/lib/currency";
import type { BrandSchema } from "@/types/app-database";

type Row = { amount_cents: number; balance_cents: number | null; sort_order: number };

type FixtureSchema = BrandSchema<{
  Tables: { ledger: { Row: Row; Insert: Row; Update: Partial<Row> } };
  Functions: { totals: { Args: never; Returns: Row[] } };
}>;

it("brands money columns and leaves other numbers alone", () => {
  type LedgerRow = FixtureSchema["Tables"]["ledger"]["Row"];
  expectTypeOf<LedgerRow["amount_cents"]>().toEqualTypeOf<Cents>();
  expectTypeOf<LedgerRow["balance_cents"]>().toEqualTypeOf<Cents | null>();
  expectTypeOf<LedgerRow["sort_order"]>().toEqualTypeOf<number>();
  expectTypeOf<
    FixtureSchema["Functions"]["totals"]["Returns"][number]["amount_cents"]
  >().toEqualTypeOf<Cents>();
});
