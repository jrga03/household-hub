import { z } from "zod";
import { MAX_AMOUNT_CENTS } from "@/lib/currency";

// TanStack Router JSON-parses search values, so ?search=123 arrives as a number
const optionalText = z
  .preprocess((value) => (typeof value === "number" ? String(value) : value), z.string().min(1))
  .optional()
  .catch(undefined);

// amountMin/amountMax are already cents in the URL; never run them through parsePHP
const optionalCents = z.coerce
  .number()
  .int()
  .min(0)
  .max(MAX_AMOUNT_CENTS)
  .optional()
  .catch(undefined);

export const transactionsSearchSchema = z.object({
  dateFrom: optionalText,
  dateTo: optionalText,
  accountId: optionalText,
  categoryId: optionalText,
  status: z.enum(["pending", "cleared"]).nullable().catch(null),
  type: z.enum(["income", "expense"]).nullable().catch(null),
  search: optionalText,
  // Transfers stay hidden unless explicitly turned off (boolean or string "false")
  excludeTransfers: z.unknown().transform((value) => value !== false && value !== "false"),
  amountMin: optionalCents,
  amountMax: optionalCents,
  selected: optionalText,
});
