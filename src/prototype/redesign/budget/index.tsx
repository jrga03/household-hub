// PROTOTYPE (#194): budget variants.
import type { Variant } from "../screens";
import { BudgetA } from "./A";
import { BudgetB } from "./B";
import { BudgetC } from "./C";
import { MonthActions } from "./shared";

export const BUDGET_VARIANTS: Variant[] = [
  { key: "A", name: "Grouped rows", actions: MonthActions, Body: BudgetA },
  { key: "B", name: "By status", actions: MonthActions, Body: BudgetB },
  { key: "C", name: "Pace tiles", actions: MonthActions, Body: BudgetC },
];
