import * as z from "zod";
import { endOfDay } from "date-fns";

export const transactionSchema = z.object({
  date: z
    .date({
      required_error: "Date is required",
    })
    .refine((date) => date <= endOfDay(new Date()), {
      message: "Transaction date cannot be in the future",
    }),
  description: z
    .string()
    .min(3, "Description must be at least 3 characters")
    .max(200, "Description too long"),
  amount_cents: z
    .number()
    .int("Amount must be an integer")
    .positive("Amount must be positive")
    .max(999999999, "Amount too large"),
  type: z.enum(["income", "expense"], {
    required_error: "Type is required",
  }),
  account_id: z.string().nullable().optional(),
  category_id: z.string().nullable().optional(),
  status: z.enum(["pending", "cleared"]),
  visibility: z.enum(["household", "personal"]),
  notes: z.string().max(500, "Notes too long").nullable().optional(),
});

export type TransactionFormData = z.infer<typeof transactionSchema>;
