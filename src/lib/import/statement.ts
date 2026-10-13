import type { Cents } from "@/lib/currency";
import type { TransactionType } from "@/lib/transactions/events";

/** One row read from a bank or credit card statement (GLOSSARY: Statement Line). */
export interface StatementLine {
  /** "yyyy-MM-dd", the day the purchase was made. */
  purchaseDate: string;
  /** "yyyy-MM-dd", the day the bank posted it. */
  postingDate: string;
  description: string;
  amount: Cents;
  /** From the account holder's side: a charge is an expense, a refund or payment is income. */
  type: TransactionType;
  /** A payment towards the card itself, matched against transfers rather than saved as income. */
  isCardPayment: boolean;
}

export type StatementFormatId = "bdo-credit-card-pdf";

export interface StatementFormat {
  id: StatementFormatId;
  label: string;
  accept: string;
  /** "fixed": the bank uses the same password for every statement, so it may be remembered. */
  password: "fixed" | "per-file";
}

export interface StatementParser {
  format: StatementFormat;
  parse(data: ArrayBuffer, password: string): Promise<StatementLine[]>;
}

export type StatementParseProblem =
  "password-required" | "wrong-password" | "unrecognised-layout" | "failed";

const PROBLEM_MESSAGES: Record<StatementParseProblem, string> = {
  "password-required": "This statement needs a password.",
  "wrong-password": "That password didn't open the statement. Check it and try again.",
  "unrecognised-layout":
    "This file doesn't look like a statement in the chosen format. Check the file and the format.",
  failed: "The statement couldn't be read.",
};

export class StatementParseError extends Error {
  constructor(
    readonly problem: StatementParseProblem,
    options?: ErrorOptions
  ) {
    super(PROBLEM_MESSAGES[problem], options);
    this.name = "StatementParseError";
  }
}
