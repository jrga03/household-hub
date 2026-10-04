import { expectTypeOf, it } from "vitest";
import type { Cents } from "@/lib/currency";
import type { AppDatabase } from "@/types/app-database";

type Tables = AppDatabase["public"]["Tables"];

it("brands money columns and leaves other numbers alone", () => {
  expectTypeOf<Tables["transactions"]["Row"]["amount_cents"]>().toEqualTypeOf<Cents>();
  expectTypeOf<Tables["accounts"]["Row"]["initial_balance_cents"]>().toEqualTypeOf<Cents | null>();
  expectTypeOf<
    Tables["debt_payments"]["Row"]["overpayment_amount"]
  >().toEqualTypeOf<Cents | null>();
  expectTypeOf<Tables["accounts"]["Row"]["sort_order"]>().toEqualTypeOf<number | null>();
  expectTypeOf<
    AppDatabase["public"]["Functions"]["get_account_balances"]["Returns"][number]["cleared_count"]
  >().toEqualTypeOf<number>();
});
