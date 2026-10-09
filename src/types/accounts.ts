import type { AppDatabase } from "./app-database";

/**
 * Account type helpers
 * Generated from Supabase schema - see DATABASE.md lines 105-131
 */

// Row types (full database record)
export type Account = AppDatabase["public"]["Tables"]["accounts"]["Row"];

// Account type enumeration
export type AccountType = "bank" | "investment" | "credit_card" | "cash" | "e-wallet";

// Account visibility enumeration
export type AccountVisibility = "household" | "personal";
