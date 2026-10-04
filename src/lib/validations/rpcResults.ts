import { z } from "zod";
import { asCents } from "@/lib/currency";

// BIGINT RPC columns arrive as JSON numbers (verified on the local stack, 2026-10-04).
const centsValue = z
  .number()
  .refine(Number.isSafeInteger, "Expected whole cents")
  .transform(asCents);
const count = z.number().int().nonnegative();

const accountBalanceDeltaSchema = z.object({
  account_id: z.string(),
  cleared_delta_cents: centsValue,
  pending_delta_cents: centsValue,
  cleared_count: count,
  pending_count: count,
});

const filterSummarySchema = z.object({
  txn_count: count,
  total_in_cents: centsValue,
  total_out_cents: centsValue,
});

export type AccountBalanceDelta = z.output<typeof accountBalanceDeltaSchema>;
export type TransactionsFilterSummaryRow = z.output<typeof filterSummarySchema>;

export function parseAccountBalanceDeltas(data: unknown): AccountBalanceDelta[] {
  return z.array(accountBalanceDeltaSchema).parse(data ?? []);
}

export function parseTransactionsFilterSummary(data: unknown): TransactionsFilterSummaryRow {
  const rows = z.array(filterSummarySchema).parse(data ?? []);
  return (
    rows[0] ?? filterSummarySchema.parse({ txn_count: 0, total_in_cents: 0, total_out_cents: 0 })
  );
}
