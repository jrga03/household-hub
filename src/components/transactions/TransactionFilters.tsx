import { useState } from "react";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { Button } from "@/components/app/Button";
import { Field } from "@/components/app/Field";
import {
  FilterChip,
  FilterChips,
  FilterChipSelect,
  FilterSelect,
  type FilterChoiceGroup,
} from "@/components/app/FilterChips";
import { Input } from "@/components/app/Input";
import { Label } from "@/components/app/Label";
import { SelectTrigger, SelectValue } from "@/components/app/Select";
import { Switch } from "@/components/app/Switch";
import type { AccountRow } from "@/lib/accounts/projection";
import type { CategoryList } from "@/lib/categories/projection";
import { CORRECTION_LABEL } from "@/lib/corrections/events";
import {
  isListType,
  TRANSFER_TYPE,
  CORRECTION_TYPE,
  UNASSIGNED_FILTER,
  type TransactionFilter,
} from "@/lib/transactions/filter";
import { isTransactionStatus } from "@/lib/transactions/events";
import { isVisibility, VISIBILITY_LABELS } from "@/lib/events/ownership";
import { monthLabel, monthRangeLabel } from "@/lib/utils/dates";

/** The Month control's value while a link's range is the current choice. */
const RANGE = "range";

function categoryGroups(list: CategoryList | undefined): FilterChoiceGroup[] {
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

interface FilterChoices {
  key: string;
  value: string | undefined;
  label: string;
  anyLabel: string;
  groups: FilterChoiceGroup[];
  read: (value: string | undefined) => TransactionFilter;
}

interface TransactionFiltersProps {
  filter: TransactionFilter;
  onChange: (filter: TransactionFilter) => void;
  /** "yyyy-MM" months holding transactions, newest first. */
  months: string[];
  /** Retired ones included, so their transactions stay findable. */
  accounts: AccountRow[];
  categories: CategoryList | undefined;
  /** A phone's row of chips, or the stacked fields of the laptop's rail. */
  layout: "chips" | "rail";
}

export function TransactionFilters({
  filter,
  onChange,
  months,
  accounts,
  categories,
  layout,
}: TransactionFiltersProps) {
  // The input keeps its own text: the URL catches up a render later while typing.
  const [query, setQuery] = useState(filter.query ?? "");
  const [urlQuery, setUrlQuery] = useState(filter.query);
  if (filter.query !== urlQuery) {
    setUrlQuery(filter.query);
    // Cleared by Clear filters or a link, not by typing.
    if (filter.query === undefined) setQuery("");
  }

  const mergeFilter = (next: TransactionFilter) => onChange({ ...filter, ...next });
  const isFiltered = Object.keys(filter).length > 0;

  const thisMonth = format(new Date(), "yyyy-MM");
  const monthChoices = [
    ...new Set([thisMonth, ...(filter.month ? [filter.month] : []), ...months]),
  ].sort((a, b) => b.localeCompare(a));
  const range = filter.from && filter.to ? monthRangeLabel(filter.from, filter.to) : undefined;
  const choices: FilterChoices[] = [
    {
      key: "month",
      value: filter.month ?? (range && RANGE),
      label: "Month",
      anyLabel: "All months",
      groups: [
        ...(range ? [{ label: "Range", choices: [{ value: RANGE, label: range }] }] : []),
        {
          label: "Months",
          choices: monthChoices.map((month) => ({ value: month, label: monthLabel(month) })),
        },
      ],
      read: (month) => (month === RANGE ? {} : { month, from: undefined, to: undefined }),
    },
    {
      key: "account",
      value: filter.account,
      label: "Account",
      anyLabel: "All accounts",
      groups: [
        {
          label: "Accounts",
          choices: accounts.map((account) => ({
            value: account.id,
            label: account.retired ? `${account.name} (retired)` : account.name,
          })),
        },
      ],
      read: (account) => ({ account }),
    },
    {
      key: "category",
      value: filter.category,
      label: "Category",
      anyLabel: "All categories",
      groups: [
        { label: "No category", choices: [{ value: UNASSIGNED_FILTER, label: "Unassigned" }] },
        ...categoryGroups(categories),
      ],
      read: (category) => ({ category }),
    },
    {
      key: "visibility",
      value: filter.visibility,
      label: "Visibility",
      anyLabel: "Any visibility",
      groups: [
        {
          label: "Visibilities",
          choices: Object.entries(VISIBILITY_LABELS).map(([value, label]) => ({ value, label })),
        },
      ],
      read: (visibility) => ({
        visibility: visibility && isVisibility(visibility) ? visibility : undefined,
      }),
    },
    {
      key: "status",
      value: filter.status,
      label: "Status",
      anyLabel: "Any status",
      groups: [
        {
          label: "Statuses",
          choices: [
            { value: "cleared", label: "Cleared" },
            { value: "pending", label: "Pending" },
          ],
        },
      ],
      read: (status) => ({ status: isTransactionStatus(status) ? status : undefined }),
    },
    {
      key: "type",
      value: filter.type,
      label: "Type",
      anyLabel: "All types",
      groups: [
        {
          label: "Types",
          choices: [
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
            { value: TRANSFER_TYPE, label: "Transfer" },
            { value: CORRECTION_TYPE, label: CORRECTION_LABEL },
          ],
        },
      ],
      read: (type) => ({ type: isListType(type) ? type : undefined }),
    },
  ];

  const search = (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
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
          mergeFilter({ query: event.target.value || undefined });
        }}
      />
    </div>
  );
  const clear = isFiltered && (
    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onChange({})}>
      Clear filters
    </Button>
  );

  if (layout === "chips") {
    return (
      <div className="space-y-3" role="search" aria-label="Filter transactions">
        {search}
        <FilterChips label="Filters" className="-mx-4 px-4">
          {choices.map((choice) => (
            <FilterChipSelect
              key={choice.key}
              label={choice.label}
              anyLabel={choice.anyLabel}
              value={choice.value}
              groups={choice.groups}
              onChange={(value) => mergeFilter(choice.read(value))}
            />
          ))}
          <FilterChip
            pressed={filter.needsCategory ?? false}
            onPressedChange={(pressed) => mergeFilter({ needsCategory: pressed || undefined })}
          >
            Needs a category
          </FilterChip>
          {clear}
        </FilterChips>
      </div>
    );
  }

  return (
    <div className="space-y-4" role="search" aria-label="Filter transactions">
      {search}
      {choices.map((choice) => (
        <Field key={choice.key} label={choice.label}>
          {(control) => (
            <FilterSelect
              anyLabel={choice.anyLabel}
              value={choice.value}
              groups={choice.groups}
              onChange={(value) => mergeFilter(choice.read(value))}
            >
              <SelectTrigger {...control} className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FilterSelect>
          )}
        </Field>
      ))}
      <div className="flex items-center gap-2">
        <Switch
          id="filter-needs-category"
          checked={filter.needsCategory ?? false}
          onCheckedChange={(checked) => mergeFilter({ needsCategory: checked || undefined })}
        />
        <Label htmlFor="filter-needs-category">Needs a category</Label>
      </div>
      {clear}
    </div>
  );
}
