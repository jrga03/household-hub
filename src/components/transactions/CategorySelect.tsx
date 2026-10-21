import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
import type { AccountRow } from "@/lib/accounts/projection";
import { canHoldMoneyIn, type CategoryList, type CategoryRow } from "@/lib/categories/projection";

// Radix Select can't hold an empty value.
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
  name,
  choices,
  value,
  onValueChange,
  ...trigger
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
    <Select name={name} value={value} onValueChange={onValueChange}>
      <SelectTrigger {...trigger} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {choices.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
