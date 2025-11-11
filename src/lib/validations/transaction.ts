import * as z from "zod";
import { endOfDay } from "date-fns";

export const transactionSchema = z
  .object({
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
    // Debt tracking fields (optional)
    debt_id: z.string().optional(),
    internal_debt_id: z.string().optional(),
    // Transfer tracking (existing field for context)
    transfer_group_id: z.string().optional(),
  })
  .refine(
    (data) => {
      // Cannot link debt to transfer transactions
      const hasDebtLink = data.debt_id || data.internal_debt_id;
      const isTransfer = Boolean(data.transfer_group_id);
      return !(hasDebtLink && isTransfer);
    },
    {
      message: "Transfers cannot be linked to debts",
      path: ["debt_id"],
    }
  )
  .refine(
    (data) => {
      // Cannot specify both external and internal debt
      return !(data.debt_id && data.internal_debt_id);
    },
    {
      message: "Cannot link to both external and internal debt",
      path: ["debt_id"],
    }
  );

export type TransactionFormData = z.infer<typeof transactionSchema>;
