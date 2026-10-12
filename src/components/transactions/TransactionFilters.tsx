import { useState } from "react";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AccountRow } from "@/lib/accounts/projection";
import type { CategoryList } from "@/lib/categories/projection";
import { UNASSIGNED_FILTER, type TransactionFilter } from "@/lib/transactions/filter";
import { isTransactionStatus, isTransactionType } from "@/lib/transactions/events";
import { parseLocalDate } from "@/lib/utils/dates";

// Radix Select can't hold an empty value.
const ALL = "all";

interface Choice {
  value: string;
  label: string;
}

interface ChoiceGroup {
  label: string;
  choices: Choice[];
}

const monthLabel = (month: string) => format(parseLocalDate(`${month}-01`), "MMMM yyyy");

function categoryGroups(list: CategoryList | undefined): ChoiceGroup[] {
  if (!list) return [];
  const toChoice = (category: { id: string; name: string }) => ({
    value: category.id,
    label: category.name,
  });
  return [
    ...list.groups.map((group) => ({
      label: group.name,
      choices: group.categories.map(toChoice),
    })),
    { label: "Ungrouped", choices: list.ungrouped.map(toChoice) },
    { label: "Retired", choices: list.retiredCategories.map(toChoice) },
  ].filter((group) => group.choices.length > 0);
}

interface TransactionFiltersProps {
  filter: TransactionFilter;
  onChange: (filter: TransactionFilter) => void;
  /** "yyyy-MM" months holding transactions, newest first. */
  months: string[];
  accounts: AccountRow[];
  retiredAccounts: AccountRow[];
  categories: CategoryList | undefined;
}

export function TransactionFilters({
  filter,
  onChange,
  months,
  accounts,
  retiredAccounts,
  categories,
}: TransactionFiltersProps) {
  const [query, setQuery] = useState(filter.query ?? "");
  const [shownQuery, setShownQuery] = useState(filter.query);
  // Cleared or changed by a link: show the URL's query.
  if (filter.query !== shownQuery) {
    setShownQuery(filter.query);
    setQuery(filter.query ?? "");
  }

  const change = (next: TransactionFilter) => onChange({ ...filter, ...next });
  const choose = (value: string) => (value === ALL ? undefined : value);
  const isFiltered = Object.keys(filter).length > 0;

  const accountChoices: Choice[] = [
    ...accounts.map((account) => ({ value: account.id, label: account.name })),
    ...retiredAccounts.map((account) => ({
      value: account.id,
      label: `${account.name} (retired)`,
    })),
  ];
  const monthChoices =
    filter.month && !months.includes(filter.month) ? [filter.month, ...months] : months;

  return (
    <div className="space-y-3" role="search" aria-label="Filter transactions">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Search description, notes or amount"
          placeholder="Search description, notes or amount"
          className="pl-8"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShownQuery(event.target.value || undefined);
            change({ query: event.target.value || undefined });
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 @[600px]:grid-cols-3 @[900px]:grid-cols-5">
        <FilterSelect
          label="Month"
          value={filter.month}
          allLabel="All months"
          groups={[
            {
              label: "Months",
              choices: monthChoices.map((month) => ({ value: month, label: monthLabel(month) })),
            },
          ]}
          onChange={(value) => change({ month: choose(value) })}
        />
        <FilterSelect
          label="Account"
          value={filter.account}
          allLabel="All accounts"
          groups={[{ label: "Accounts", choices: accountChoices }]}
          onChange={(value) => change({ account: choose(value) })}
        />
        <FilterSelect
          label="Category"
          value={filter.category}
          allLabel="All categories"
          groups={[
            {
              label: "No category",
              choices: [{ value: UNASSIGNED_FILTER, label: "Unassigned" }],
            },
            ...categoryGroups(categories),
          ]}
          onChange={(value) => change({ category: choose(value) })}
        />
        <FilterSelect
          label="Type"
          value={filter.type}
          allLabel="All types"
          groups={[
            {
              label: "Types",
              choices: [
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
              ],
            },
          ]}
          onChange={(value) => change({ type: isTransactionType(value) ? value : undefined })}
        />
        <FilterSelect
          label="Status"
          value={filter.status}
          allLabel="Any status"
          groups={[
            {
              label: "Statuses",
              choices: [
                { value: "cleared", label: "Cleared" },
                { value: "pending", label: "Pending" },
              ],
            },
          ]}
          onChange={(value) => change({ status: isTransactionStatus(value) ? value : undefined })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id="filter-needs-category"
            checked={filter.needsCategory ?? false}
            onCheckedChange={(checked) => change({ needsCategory: checked || undefined })}
          />
          <Label htmlFor="filter-needs-category">Needs a category</Label>
        </div>
        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={() => onChange({})}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string | undefined;
  allLabel: string;
  groups: ChoiceGroup[];
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, allLabel, groups, onChange }: FilterSelectProps) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? ALL} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
