// PROTOTYPE (#194): made-up household data for October 2026, today the 20th.
// eslint-disable-next-line no-restricted-imports -- prototype fixtures build raw cents
import { asCents, type Cents } from "@/lib/currency";

const php = (pesos: number): Cents => asCents(Math.round(pesos * 100));

export const TODAY = "2026-10-20";
export const MONTH_LABEL = "October 2026";
export const DAYS_IN_MONTH = 31;
export const DAY_OF_MONTH = 20;

export interface Account {
  id: string;
  name: string;
  kind: "bank" | "cash" | "e-wallet" | "credit card";
  balance: Cents;
}

export const ACCOUNTS: Account[] = [
  { id: "bdo", name: "BDO Savings", kind: "bank", balance: php(84250) },
  { id: "metro", name: "Metrobank Payroll", kind: "bank", balance: php(-1200) },
  { id: "gcash", name: "GCash", kind: "e-wallet", balance: php(6420.5) },
  { id: "cash", name: "Cash", kind: "cash", balance: php(3180) },
  { id: "bpi", name: "BPI Visa", kind: "credit card", balance: php(18940) },
];

export interface BudgetCategory {
  id: string;
  name: string;
  /** No budget: spent alone, nothing to compare. */
  budget: Cents | null;
  spent: Cents;
}

export interface BudgetGroup {
  id: string;
  name: string;
  categories: BudgetCategory[];
}

export const BUDGET_GROUPS: BudgetGroup[] = [
  {
    id: "home",
    name: "Home",
    categories: [
      { id: "rent", name: "Rent", budget: php(25000), spent: php(25000) },
      { id: "electricity", name: "Electricity", budget: php(4500), spent: php(3980.4) },
      { id: "water", name: "Water", budget: php(900), spent: php(612) },
      { id: "internet", name: "Internet", budget: php(1899), spent: php(1899) },
    ],
  },
  {
    id: "food",
    name: "Food",
    categories: [
      { id: "groceries", name: "Groceries", budget: php(15000), spent: php(12480.6) },
      { id: "dining", name: "Dining out", budget: php(4000), spent: php(5230) },
      { id: "coffee", name: "Coffee", budget: php(1500), spent: php(640) },
    ],
  },
  {
    id: "transport",
    name: "Transport",
    categories: [
      { id: "fuel", name: "Fuel", budget: php(5000), spent: php(2950) },
      { id: "grab", name: "Grab", budget: php(2000), spent: php(2410) },
      { id: "parking", name: "Parking and tolls", budget: php(600), spent: php(180) },
    ],
  },
  {
    id: "kids",
    name: "Kids",
    categories: [
      { id: "school", name: "School allowance", budget: php(3000), spent: php(2000) },
      { id: "care", name: "Personal care", budget: null, spent: php(820) },
    ],
  },
];

export type BudgetStatus = "over" | "close" | "fine" | "none";

/** Close is 85% or more of the budget spent, as Home's counts compare them today. */
export function budgetStatus(category: BudgetCategory): BudgetStatus {
  if (category.budget === null) return "none";
  if (category.spent > category.budget) return "over";
  if (category.spent >= category.budget * 0.85) return "close";
  return "fine";
}

export const leftOf = (category: BudgetCategory): Cents =>
  asCents((category.budget ?? 0) - category.spent);

export interface Row {
  id: string;
  date: string;
  label: string;
  category: string | null;
  account: string;
  amount: Cents;
  kind: "income" | "expense" | "transfer";
  /** For a transfer, the account it went into. */
  toAccount?: string;
  pending?: boolean;
}

let nextId = 0;
const row = (
  date: string,
  label: string,
  category: string | null,
  account: string,
  pesos: number,
  kind: Row["kind"] = "expense",
  extra: Partial<Row> = {}
): Row => ({
  id: `t${nextId++}`,
  date: `2026-10-${date}`,
  label,
  category,
  account,
  amount: php(pesos),
  kind,
  ...extra,
});

/** Newest first. */
export const ROWS: Row[] = [
  row("20", "Puregold", "Groceries", "BPI Visa", 2346.75, "expense", { pending: true }),
  row("20", "Grab to Makati", "Grab", "GCash", 286),
  row("19", "Jollibee", "Dining out", "GCash", 512),
  row("19", "Card payment", null, "BDO Savings", 12000, "transfer", { toAccount: "BPI Visa" }),
  row("18", "Shell Ortigas", "Fuel", "BPI Visa", 1950),
  row("18", "Starbucks", "Coffee", "GCash", 210),
  row("17", "Meralco", "Electricity", "BDO Savings", 3980.4),
  row("16", "Mang Inasal", "Dining out", "Cash", 640),
  row("16", "SM Hypermarket", "Groceries", "BPI Visa", 4120.3),
  row("15", "Salary (Ana)", null, "BDO Savings", 60000, "income"),
  row("15", "Grab to BGC", "Grab", "GCash", 342),
  row("14", "Watsons", "Personal care", "Cash", 820),
  row("13", "Converge", "Internet", "BDO Savings", 1899),
  row("12", "Cash withdrawal", null, "BDO Savings", 5000, "transfer", { toAccount: "Cash" }),
  row("12", "Samgyupsal", "Dining out", "BPI Visa", 2480),
  row("11", "Landers", "Groceries", "BPI Visa", 3890.55),
  row("10", "Maynilad", "Water", "BDO Savings", 612),
  row("9", "School allowance", "School allowance", "Cash", 1000),
  row("8", "Grab to airport", "Grab", "GCash", 1150),
  row("7", "Petron", "Fuel", "BPI Visa", 1000),
  row("6", "Toll", "Parking and tolls", "GCash", 180),
  row("5", "Ramen Nagi", "Dining out", "BPI Visa", 1598),
  row("4", "Coffee Project", "Coffee", "GCash", 430),
  row("3", "Puregold", "Groceries", "Cash", 2123),
  row("2", "School allowance", "School allowance", "Cash", 1000),
  row("1", "Rent", "Rent", "BDO Savings", 25000),
  row("1", "Salary (Ben)", null, "Metrobank Payroll", 60000, "income"),
  row("1", "Move to BDO", null, "Metrobank Payroll", 61200, "transfer", { toAccount: "BDO Savings" }),
];

export const MONTH_IN = php(120000);
export const MONTH_OUT = php(57570);
export const MONTH_LEFT = php(62430);
export const REVIEW_COUNT = 3;
