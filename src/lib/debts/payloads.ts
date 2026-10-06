import type { AppDatabase } from "@/types/app-database";
import type { Debt, DebtPayment, InternalDebt } from "@/types/debt";

type Tables = AppDatabase["public"]["Tables"];
export type DebtInsert = Tables["debts"]["Insert"];
export type InternalDebtInsert = Tables["internal_debts"]["Insert"];
export type DebtPaymentInsert = Tables["debt_payments"]["Insert"];

export function toDebtInsert(debt: Debt): DebtInsert {
  return {
    id: debt.id,
    household_id: debt.household_id,
    name: debt.name,
    original_amount_cents: debt.original_amount_cents,
    status: debt.status,
    created_at: debt.created_at,
    updated_at: debt.updated_at,
    closed_at: debt.closed_at ?? null,
  };
}

export function toInternalDebtInsert(debt: InternalDebt): InternalDebtInsert {
  return {
    id: debt.id,
    household_id: debt.household_id,
    name: debt.name,
    original_amount_cents: debt.original_amount_cents,
    from_type: debt.from_type,
    from_id: debt.from_id,
    from_display_name: debt.from_display_name,
    to_type: debt.to_type,
    to_id: debt.to_id,
    to_display_name: debt.to_display_name,
    status: debt.status,
    created_at: debt.created_at,
    updated_at: debt.updated_at,
    closed_at: debt.closed_at ?? null,
  };
}

/** `updated_at` and `idempotency_key` are local-only; the server ledger is append-only. */
export function toDebtPaymentInsert(payment: DebtPayment): DebtPaymentInsert {
  return {
    id: payment.id,
    household_id: payment.household_id,
    debt_id: payment.debt_id ?? null,
    internal_debt_id: payment.internal_debt_id ?? null,
    transaction_id: payment.transaction_id,
    amount_cents: payment.amount_cents,
    payment_date: payment.payment_date,
    device_id: payment.device_id,
    is_reversal: payment.is_reversal,
    reverses_payment_id: payment.reverses_payment_id ?? null,
    adjustment_reason: payment.adjustment_reason ?? null,
    is_overpayment: payment.is_overpayment ?? false,
    overpayment_amount: payment.overpayment_amount ?? null,
    created_at: payment.created_at,
  };
}
