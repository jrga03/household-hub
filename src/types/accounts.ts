import { Database } from "./database.types";

/**
 * Account type helpers
 * Generated from Supabase schema - see DATABASE.md lines 105-131
 */

// Row types (full database record)
export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type AccountInsert = Database["public"]["Tables"]["accounts"]["Insert"];
export type AccountUpdate = Database["public"]["Tables"]["accounts"]["Update"];

// Account type enumeration
export type AccountType = "bank" | "investment" | "credit_card" | "cash" | "e-wallet";

// Account visibility enumeration
export type AccountVisibility = "household" | "personal";

// Type guard helpers
export function isValidAccountType(type: string): type is AccountType {
  return ["bank", "investment", "credit_card", "cash", "e-wallet"].includes(type);
}

export function isValidAccountVisibility(visibility: string): visibility is AccountVisibility {
  return ["household", "personal"].includes(visibility);
}

// Display helpers
export function getAccountTypeLabel(type: AccountType): string {
  const labels: Record<AccountType, string> = {
    bank: "Bank Account",
    investment: "Investment",
    credit_card: "Credit Card",
    cash: "Cash",
    "e-wallet": "E-Wallet",
  };
  return labels[type];
}
