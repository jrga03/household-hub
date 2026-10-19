import type { CategoryList, CategoryRow, GroupRow } from "@/lib/categories/projection";
import { byName } from "@/lib/utils/sort";
import { categoryMonth, countsInMonth, type MonthView } from "./month";

export interface BudgetGroup {
  group: GroupRow;
  categories: CategoryRow[];
}

export interface BudgetRows {
  groups: BudgetGroup[];
  /** Categories whose group isn't on this device yet. */
  ungrouped: CategoryRow[];
}

/**
 * Budget's rows for a month: categories in use, plus retired ones that count
 * in it (see `countsInMonth`), by group. A group shows while it has categories
 * in use or one of its categories shows, so a retired group keeps its history.
 */
export function budgetRows(list: CategoryList, view: MonthView): BudgetRows {
  const retiredShown = list.retiredCategories.filter((category) =>
    countsInMonth(category, categoryMonth(view, category.id))
  );
  const retiredIn = (groupId: string) =>
    retiredShown.filter((category) => category.group?.id === groupId);

  const groups = [
    ...list.groups,
    ...list.retiredGroups.map((group) => ({ ...group, categories: [] })),
  ]
    .map((group) => ({
      group,
      categories: [...group.categories, ...retiredIn(group.id)].sort(byName),
    }))
    .filter(({ group, categories }) => !group.retired || categories.length > 0)
    .sort((a, b) => byName(a.group, b.group));

  return {
    groups,
    ungrouped: [
      ...list.ungrouped,
      ...retiredShown.filter((category) => category.group === null),
    ].sort(byName),
  };
}
