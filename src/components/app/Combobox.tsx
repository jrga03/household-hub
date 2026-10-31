import { useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  /** Searched, and shown unless `content` is given. */
  label: string;
  content?: ReactNode;
}

export interface ComboboxGroup {
  /** Searched too: a group's name lists all its options. */
  label?: string;
  options: ComboboxOption[];
}

// Substring, not cmdk's fuzzy score: "food" should not match "Fuel and oil".
const matchKeywords = (_value: string, search: string, keywords: string[] = []) =>
  keywords.some((keyword) => keyword.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0;

/**
 * A Select with a search field, for long grouped lists. Inside a `Field`, spread its
 * control props onto it. With `name`, it submits `value` in a form.
 */
export function Combobox({
  value,
  onValueChange,
  groups,
  placeholder,
  name,
  className,
  children,
  ...trigger
}: Omit<ComponentProps<"button">, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  groups: ComboboxGroup[];
  placeholder?: string;
  name?: string;
  /** Replaces the chosen option's label in the trigger. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const popupId = useId();
  // A tap must not raise the on-screen keyboard; a tap on the field searches.
  // Keys, a mouse or a trackpad go straight to the field.
  const openedByTouch = useRef(false);
  const chosen = groups.flatMap((group) => group.options).find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? popupId : undefined}
          data-slot="combobox-trigger"
          data-placeholder={chosen ? undefined : ""}
          onPointerDown={(event) => (openedByTouch.current = event.pointerType === "touch")}
          onKeyDown={() => (openedByTouch.current = false)}
          className={cn(
            "border-input data-[placeholder]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-control whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...trigger}
        >
          {children ?? (
            <span className="line-clamp-1 flex items-center gap-2">
              {chosen ? (chosen.content ?? chosen.label) : placeholder}
            </span>
          )}
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      {name && <input type="hidden" name={name} value={value} />}
      <PopoverContent
        id={popupId}
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-56 p-0"
        onOpenAutoFocus={(event) => {
          if (openedByTouch.current) event.preventDefault();
        }}
      >
        <Command label="Search" filter={matchKeywords} defaultValue={value}>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No matches</CommandEmpty>
            {groups.map((group, index) => (
              <CommandGroup key={group.label ?? index} heading={group.label}>
                {group.options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={group.label ? [option.label, group.label] : [option.label]}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.content ?? option.label}
                    {option.value === value && <CheckIcon className="ml-auto" aria-hidden />}
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
