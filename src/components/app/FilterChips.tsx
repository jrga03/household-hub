import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "./Select";

/** The phone filter row: toggle chips in one horizontally scrolling line. */
export function FilterChips({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex gap-2 overflow-x-auto", className)}>
      {children}
    </div>
  );
}

const chipClasses = (pressed: boolean) =>
  cn(
    "flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-label font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    pressed
      ? "border-transparent bg-secondary text-secondary-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  );

export function FilterChip({
  pressed,
  onPressedChange,
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-slot="filter-chip"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={chipClasses(pressed)}
    >
      {children}
    </button>
  );
}

export interface FilterChoice {
  value: string;
  label: string;
}

export interface FilterChoiceGroup {
  label: string;
  choices: FilterChoice[];
}

// Radix Select can't hold an empty value.
const ANY = "all";

/**
 * A chip that picks one value from a list. It reads its `label` until a value
 * is chosen, then the value; `anyLabel` is the choice that clears it.
 */
export function FilterChipSelect({
  label,
  anyLabel,
  value,
  groups,
  onChange,
}: {
  label: string;
  anyLabel: string;
  value: string | undefined;
  groups: FilterChoiceGroup[];
  onChange: (value: string | undefined) => void;
}) {
  const chosen = groups.flatMap((group) => group.choices).find((choice) => choice.value === value);
  return (
    <Select
      value={value ?? ANY}
      onValueChange={(next) => onChange(next === ANY ? undefined : next)}
    >
      <SelectTrigger
        data-slot="filter-chip"
        aria-label={chosen ? `${label}: ${chosen.label}` : label}
        className={cn(chipClasses(chosen !== undefined), "h-8 py-0 shadow-none")}
      >
        <span>{chosen?.label ?? label}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
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
  );
}
