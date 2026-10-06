import { z } from "zod";
import { asCents } from "@/lib/currency";
import type { LocalAccount, LocalCategory, LocalTransaction } from "@/lib/dexie/db";
import type { Debt, DebtPayment, InternalDebt } from "@/types/debt";

export type SyncTableName =
  | "transactions"
  | "accounts"
  | "categories"
  | "debts"
  | "internal_debts"
  | "debt_payments";

const EPOCH = "1970-01-01T00:00:00.000Z";

const centsValue = z
  .number()
  .refine(Number.isSafeInteger, "Expected whole cents")
  .transform(asCents);
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);
const timestamp = z
  .string()
  .nullish()
  .transform((value) => value ?? EPOCH);
const visibility = z
  .enum(["household", "personal"])
  .nullish()
  .transform((value) => value ?? "household");
const isActive = z
  .boolean()
  .nullish()
  .transform((value) => value ?? true);
const sortOrder = z
  .number()
  .int()
  .nullish()
  .transform((value) => value ?? 0);

export const transactionRowSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
  amount_cents: centsValue,
  type: z.enum(["income", "expense"]),
  currency_code: z.string(),
  account_id: optionalText,
  category_id: optionalText,
  transfer_group_id: optionalText,
  debt_id: optionalText,
  internal_debt_id: optionalText,
  status: z.enum(["pending", "cleared"]),
  visibility: z.enum(["household", "personal"]),
  created_by_user_id: optionalText,
  tagged_user_ids: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  notes: optionalText,
  import_key: optionalText,
  device_id: optionalText,
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<LocalTransaction, z.ZodTypeDef, unknown>;

export const accountRowSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  name: z.string(),
  type: z.enum(["bank", "investment", "credit_card", "cash", "e-wallet"]),
  initial_balance_cents: z
    .number()
    .nullish()
    .transform((value) => value ?? 0)
    .pipe(centsValue),
  currency_code: z
    .string()
    .nullish()
    .transform((value) => value ?? "PHP"),
  visibility,
  owner_user_id: optionalText,
  color: z
    .string()
    .nullish()
    .transform((value) => value ?? "#3B82F6"),
  icon: z
    .string()
    .nullish()
    .transform((value) => value ?? "building-2"),
  sort_order: sortOrder,
  is_active: isActive,
  created_at: timestamp,
  updated_at: timestamp,
}) satisfies z.ZodType<LocalAccount, z.ZodTypeDef, unknown>;

export const categoryRowSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  parent_id: optionalText,
  name: z.string(),
  color: z.string(),
  icon: z
    .string()
    .nullish()
    .transform((value) => value ?? "folder"),
  sort_order: sortOrder,
  is_active: isActive,
  created_at: timestamp,
  updated_at: timestamp,
}) satisfies z.ZodType<LocalCategory, z.ZodTypeDef, unknown>;

const debtStatus = z.enum(["active", "paid_off", "archived"]);
const debtEntityType = z.enum(["category", "account", "member"]);
const flag = z
  .boolean()
  .nullish()
  .transform((value) => value ?? false);

export const debtRowSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  name: z.string(),
  original_amount_cents: centsValue,
  status: debtStatus,
  closed_at: optionalText,
  created_at: timestamp,
  updated_at: timestamp,
}) satisfies z.ZodType<Debt, z.ZodTypeDef, unknown>;

export const internalDebtRowSchema = debtRowSchema.extend({
  from_type: debtEntityType,
  from_id: z.string(),
  from_display_name: z.string(),
  to_type: debtEntityType,
  to_id: z.string(),
  to_display_name: z.string(),
}) satisfies z.ZodType<InternalDebt, z.ZodTypeDef, unknown>;

/** The server ledger is append-only (no updated_at); locally a row's updated_at is its created_at. */
export const debtPaymentRowSchema = z
  .object({
    id: z.string(),
    household_id: z.string(),
    debt_id: optionalText,
    internal_debt_id: optionalText,
    transaction_id: z.string(),
    amount_cents: centsValue,
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    device_id: z.string(),
    is_reversal: flag,
    reverses_payment_id: optionalText,
    adjustment_reason: optionalText,
    is_overpayment: flag,
    overpayment_amount: centsValue.nullish().transform((value) => value ?? undefined),
    created_at: timestamp,
  })
  .transform((row) => ({ ...row, updated_at: row.created_at })) satisfies z.ZodType<
  DebtPayment,
  z.ZodTypeDef,
  unknown
>;

export type SyncRowResult =
  | {
      ok: true;
      row: LocalTransaction | LocalAccount | LocalCategory | Debt | InternalDebt | DebtPayment;
    }
  | { ok: false; issues: z.ZodIssue[] };

const schemas = {
  transactions: transactionRowSchema,
  accounts: accountRowSchema,
  categories: categoryRowSchema,
  debts: debtRowSchema,
  internal_debts: internalDebtRowSchema,
  debt_payments: debtPaymentRowSchema,
} as const;

export function parseSyncRow(table: SyncTableName, record: unknown): SyncRowResult {
  const result = schemas[table].safeParse(record);
  return result.success
    ? { ok: true, row: result.data }
    : { ok: false, issues: result.error.issues };
}
