import { Combobox } from "@/components/app/Combobox";
import type { AccountRow } from "@/lib/accounts/projection";
import { canHoldMoneyIn, type CategoryList, type CategoryRow } from "@/lib/categories/projection";

export const UNASSIGNED = "unassigned";

export interface CategoryChoiceGroup {
  label: string;
  categories: CategoryRow[];
}

/** Categories in use seen by the account's people, by group, plus a retired one the record already has. */
export function categoryChoices(
  list: CategoryList,
  account: AccountRow | undefined,
  currentId: string | null
): CategoryChoiceGroup[] {
  if (!account) return [];
  const fits = (category: CategoryRow) => canHoldMoneyIn(category, account);
  const groups = [
    ...list.groups.map((group) => ({
      label: group.name,
      categories: group.categories.filter(fits),
    })),
    { label: "Ungrouped", categories: list.ungrouped.filter(fits) },
    {
      label: "Retired",
      categories: list.retiredCategories.filter(
        (category) => category.id === currentId && fits(category)
      ),
    },
  ];
  return groups.filter((group) => group.categories.length > 0);
}

export const isCategoryChoice = (choices: CategoryChoiceGroup[], id: string | null) =>
  choices.some((group) => group.categories.some((category) => category.id === id));

/**
 * Unassigned, then the choices by group. `value` is a category id or UNASSIGNED.
 * Inside a `Field`, spread its control props onto it.
 */
export function CategorySelect({
  choices,
  ...combobox
}: {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  name?: string;
  choices: CategoryChoiceGroup[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Combobox
      {...combobox}
      className="w-full"
      groups={[
        { options: [{ value: UNASSIGNED, label: "Unassigned" }] },
        ...choices.map((group) => ({
          label: group.label,
          options: group.categories.map((category) => ({
            value: category.id,
            label: category.name,
          })),
        })),
      ]}
    />
  );
}
