import { diffCents, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import type { Debt, InternalDebt } from "@/types/debt";
import { calculateDebtBalance } from "./balance";
import type { DebtKind } from "./outbox";

/**
 * Working copy of debt rows and balances, so chained prepares (reverse, then
 * re-pay in one edit) see each other's effects before anything is written.
 */
export class DebtLedgerView {
  private readonly debts = new Map<string, Debt | InternalDebt>();
  private readonly balances = new Map<string, Cents>();

  async debt(kind: DebtKind, id: string): Promise<Debt | InternalDebt | undefined> {
    const cached = this.debts.get(id);
    if (cached) return cached;
    const row = kind === "external" ? await db.debts.get(id) : await db.internalDebts.get(id);
    if (row) this.debts.set(id, row);
    return row;
  }

  async balance(kind: DebtKind, id: string): Promise<Cents> {
    const cached = this.balances.get(id);
    if (cached !== undefined) return cached;
    const balance = await calculateDebtBalance(id, kind);
    this.balances.set(id, balance);
    return balance;
  }

  setDebt(row: Debt | InternalDebt): void {
    this.debts.set(row.id, row);
  }

  /** Signed ledger: a reversal's negative amount raises the balance. */
  recordPayment(id: string, amountCents: Cents): void {
    const current = this.balances.get(id);
    if (current === undefined) {
      throw new Error(`Balance for debt ${id} was not loaded before recording a payment`);
    }
    this.balances.set(id, diffCents(current, amountCents));
  }
}
