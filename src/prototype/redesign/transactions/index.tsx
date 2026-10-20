/* eslint-disable arch/no-direct-primitive-import -- prototype (#194), throwaway branch */
// PROTOTYPE (#194): Transactions variants.
import { ListChecks, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Variant } from "../screens";
import { TransactionsA } from "./A";
import { TransactionsB } from "./B";
import { TransactionsC } from "./C";

const SelectAction = () => (
  <Button variant="ghost" size="sm">
    <ListChecks />
    Select
  </Button>
);

export const TRANSACTIONS_VARIANTS: Variant[] = [
  { key: "A", name: "List and detail", actions: SelectAction, Body: TransactionsA },
  {
    key: "B",
    name: "Table on laptop",
    actions: () => (
      <>
        <Button variant="outline" size="sm" className="hidden md:inline-flex">
          Import statement
        </Button>
        <SelectAction />
      </>
    ),
    Body: TransactionsB,
  },
  {
    key: "C",
    name: "Summary first",
    actions: () => (
      <Button variant="ghost" size="sm">
        <SlidersHorizontal />
        Filters
      </Button>
    ),
    Body: TransactionsC,
  },
];
