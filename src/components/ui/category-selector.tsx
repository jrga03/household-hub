/**
 * CategorySelector - searchable category combobox (mobile UX review, item 6.8).
 *
 * Replaces the flat Radix Select with a Popover + Command (cmdk) combobox:
 * - text search across parent AND child names (case/diacritic-insensitive)
 * - two-level hierarchy preserved (parent group headings, children indented)
 * - "Recent" group on top: the last 5 distinct categories used on
 *   transactions in the local Dexie table (live, works offline, gracefully
 *   empty with no data). Transfers are excluded - they are not spending.
 * - keyboard navigation via cmdk; 44px touch rows via the coarse-pointer
 *   rule on [data-slot="command-item"] in index.css
 *
 * The public props contract is unchanged from the Select version:
 * onChange fires with the selected child category id.
 */

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { db } from "@/lib/dexie/db";
import { useCategoriesGrouped } from "@/lib/supabaseQueries";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Category } from "@/types/categories";

interface CategorySelectorProps {
  value?: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** How many distinct recently-used categories to surface. */
const RECENT_LIMIT = 5;
/** Bound the Dexie scan - recents only need the newest slice of the table. */
const RECENT_SCAN_LIMIT = 300;

/** Case- and diacritic-insensitive normalization ("Café" matches "cafe"). */
function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * cmdk filter: match against the item's keywords (child + parent names),
 * never its `value` (which is an internal id). Returns 1 (match) or 0.
 */
function commandFilter(_value: string, search: string, keywords?: string[]): number {
  if (!keywords || keywords.length === 0) return 0;
  return normalizeForSearch(keywords.join(" ")).includes(normalizeForSearch(search)) ? 1 : 0;
}

interface ResolvedCategory {
  category: Category;
  parentName: string;
}

function CategoryRowContent({ category }: { category: Category }) {
  return (
    <>
      <div
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: category.color }}
        aria-hidden="true"
      />
      <span className="truncate">{category.name}</span>
    </>
  );
}

export function CategorySelector({
  value,
  onChange,
  disabled,
  placeholder = "Select category",
}: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const { data: categories, isLoading } = useCategoriesGrouped();

  // Most recent N distinct category ids from local transactions, newest
  // first. Live so new entries surface immediately; transfers excluded
  // (transfer_group_id set) per the analytics-exclusion rule.
  const recentCategoryIds = useLiveQuery(
    async (): Promise<string[]> => {
      try {
        const recentTransactions = await db.transactions
          .orderBy("created_at")
          .reverse()
          .limit(RECENT_SCAN_LIMIT)
          .toArray();

        const ids: string[] = [];
        const seen = new Set<string>();
        for (const txn of recentTransactions) {
          if (!txn.category_id || txn.transfer_group_id) continue;
          if (seen.has(txn.category_id)) continue;
          seen.add(txn.category_id);
          ids.push(txn.category_id);
          if (ids.length >= RECENT_LIMIT) break;
        }
        return ids;
      } catch {
        // Dexie unavailable (private mode, quota, etc.) - recents are
        // best-effort sugar, never block the picker.
        return [];
      }
    },
    [],
    [] as string[]
  );

  // child category id -> { category, parentName } for value display,
  // recents resolution, and search keywords.
  const childById = useMemo(() => {
    const map = new Map<string, ResolvedCategory>();
    for (const parent of categories ?? []) {
      for (const child of parent.children) {
        map.set(child.id, { category: child, parentName: parent.name });
      }
    }
    return map;
  }, [categories]);

  // Resolve recent ids to selectable categories; unknown/inactive ids drop out.
  const recentCategories = useMemo(
    () =>
      recentCategoryIds.flatMap((id) => {
        const resolved = childById.get(id);
        return resolved ? [resolved] : [];
      }),
    [recentCategoryIds, childById]
  );

  const selected = value ? childById.get(value)?.category : undefined;

  const handleSelect = (categoryId: string) => {
    onChange(categoryId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          data-slot="select-trigger"
          data-placeholder={selected ? undefined : ""}
          className={cn(
            // Mirrors SelectTrigger so the swap is visually seamless; the
            // select-trigger slot also inherits the 44px coarse-pointer rule.
            "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2",
            "text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          )}
        >
          {isLoading ? (
            <span className="text-muted-foreground">Loading categories...</span>
          ) : selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <CategoryRowContent category={selected} />
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
          <ChevronDownIcon className="size-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command filter={commandFilter}>
          <CommandInput placeholder="Search categories..." />
          <CommandList>
            <CommandEmpty>No categories found.</CommandEmpty>
            {recentCategories.length > 0 && (
              <CommandGroup heading="Recent">
                {recentCategories.map(({ category, parentName }) => (
                  <CommandItem
                    key={`recent-${category.id}`}
                    value={`recent:${category.id}`}
                    keywords={[category.name, parentName]}
                    onSelect={() => handleSelect(category.id)}
                  >
                    <CategoryRowContent category={category} />
                    <CheckIcon
                      className={cn(
                        "ml-auto size-4",
                        value === category.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {categories?.map((parent) => (
              <CommandGroup key={parent.id} heading={parent.name}>
                {parent.children.map((child) => (
                  <CommandItem
                    key={child.id}
                    value={`category:${child.id}`}
                    keywords={[child.name, parent.name]}
                    onSelect={() => handleSelect(child.id)}
                    className="pl-4"
                  >
                    <CategoryRowContent category={child} />
                    <CheckIcon
                      className={cn(
                        "ml-auto size-4",
                        value === child.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
