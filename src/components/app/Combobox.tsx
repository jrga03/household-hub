import { useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useCommandState } from "cmdk";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsCompact } from "@/hooks/useMediaQuery";
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

// Only what both the button and the phone's text field can take.
type ComboboxProps = Pick<
  ComponentProps<"button">,
  "id" | "aria-label" | "aria-describedby" | "aria-invalid" | "disabled" | "className"
> & {
  value: string;
  onValueChange: (value: string) => void;
  groups: ComboboxGroup[];
  /** The choice an empty field means, such as Unassigned. Omit when a choice is required. */
  empty?: { value: string; label: string };
  placeholder?: string;
  name?: string;
  /** A custom trigger, such as a filter chip. It always opens the list. */
  children?: ReactNode;
};

const fold = (text: string) => text.trim().toLowerCase();

// Substring, not cmdk's fuzzy score: "food" should not match "Fuel and oil".
function filterGroups(groups: ComboboxGroup[], query: string): ComboboxGroup[] {
  const search = fold(query);
  if (!search) return groups;
  return groups
    .map((group) => ({
      ...group,
      options:
        group.label && fold(group.label).includes(search)
          ? group.options
          : group.options.filter((option) => fold(option.label).includes(search)),
    }))
    .filter((group) => group.options.length > 0);
}

const allOptions = (groups: ComboboxGroup[]) => groups.flatMap((group) => group.options);

function Highlight({ text, query }: { text: string; query: string }) {
  const start = query.trim() ? fold(text).indexOf(fold(query)) : -1;
  if (start < 0) return text;
  const end = start + query.trim().length;
  return (
    <span>
      {text.slice(0, start)}
      <strong className="font-semibold">{text.slice(start, end)}</strong>
      {text.slice(end)}
    </span>
  );
}

function Results({
  groups,
  query,
  value,
  emptyValue,
  onPick,
}: {
  groups: ComboboxGroup[];
  query: string;
  value: string;
  emptyValue?: string;
  onPick: (value: string) => void;
}) {
  return (
    <CommandList>
      <CommandEmpty>No matches</CommandEmpty>
      {groups.map((group, index) => (
        <CommandGroup
          key={group.label ?? index}
          heading={group.label && <Highlight text={group.label} query={query} />}
        >
          {group.options.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              className={cn(option.value === emptyValue && "text-muted-foreground")}
              onSelect={() => onPick(option.value)}
            >
              {option.content ?? <Highlight text={option.label} query={query} />}
              {option.value === value && <CheckIcon className="ml-auto" aria-hidden />}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </CommandList>
  );
}

/**
 * A select with a search field, for long grouped lists. Below 600px it is a text field
 * that filters as the person types; wider, a button that opens a list with a search box.
 * Inside a `Field`, spread its control props onto it. With `name`, it submits `value`.
 */
export function Combobox(props: ComboboxProps) {
  const compact = useIsCompact();
  return compact && props.children === undefined ? (
    <ComboboxField {...props} />
  ) : (
    <ComboboxButton {...props} />
  );
}

function ComboboxButton({
  value,
  onValueChange,
  groups,
  empty,
  placeholder,
  name,
  className,
  children,
  ...trigger
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const popupId = useId();
  // A tap must not raise the on-screen keyboard; a tap on the field searches.
  // Keys, a mouse or a trackpad go straight to the field.
  const openedByTouch = useRef(false);
  const choices = empty ? [{ options: [empty] }, ...groups] : groups;
  const chosen = allOptions(choices).find((option) => option.value === value);
  const isEmpty = !chosen || chosen.value === empty?.value;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
      modal
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? popupId : undefined}
          data-slot="combobox-trigger"
          data-placeholder={isEmpty ? "" : undefined}
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
        <Command label="Search" shouldFilter={false} defaultValue={value}>
          <CommandInput placeholder="Search…" value={query} onValueChange={setQuery} />
          <Results
            groups={filterGroups(choices, query)}
            query={query}
            value={value}
            emptyValue={empty?.value}
            onPick={(next) => {
              onValueChange(next);
              setOpen(false);
            }}
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** cmdk's own Input replaces `id` and the label, so the Field's label would not name it. */
function FieldInput(props: ComponentProps<"input">) {
  const activeId = useCommandState((state) => state.selectedItemId);
  return <input {...props} aria-activedescendant={props["aria-expanded"] ? activeId : undefined} />;
}

function ComboboxField({
  value,
  onValueChange,
  groups,
  empty,
  placeholder,
  name,
  className,
  id,
  disabled,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: ComboboxProps) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState("");
  const fieldRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const chosenLabel =
    value === empty?.value
      ? ""
      : (allOptions(groups).find((option) => option.value === value)?.label ?? "");
  const query = editing ? text : "";
  const shown = filterGroups(groups, query);

  const pick = (next: string) => {
    onValueChange(next);
    setEditing(false);
    setOpen(false);
  };
  // Leaving never saves text that names no option: it goes back to the last choice.
  const leave = () => {
    if (!editing) return setOpen(false);
    if (empty && (fold(text) === "" || fold(text) === fold(empty.label))) return pick(empty.value);
    const named = allOptions(groups).find((option) => fold(option.label) === fold(text));
    if (named) return pick(named.value);
    setEditing(false);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(next) => !next && setOpen(false)}>
      <Command
        shouldFilter={false}
        vimBindings={false}
        value={highlighted}
        onValueChange={setHighlighted}
        className={cn("h-auto overflow-visible rounded-none bg-transparent", className)}
      >
        <PopoverAnchor asChild>
          <div
            ref={fieldRef}
            data-slot="combobox-trigger"
            className="border-input focus-within:border-ring focus-within:ring-ring/50 has-aria-invalid:border-destructive has-disabled:opacity-50 dark:bg-input/30 flex h-9 w-full items-stretch rounded-md border bg-transparent text-control transition-colors focus-within:ring-[3px]"
          >
            <FieldInput
              id={id}
              role="combobox"
              aria-label={ariaLabel}
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid}
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-autocomplete="list"
              disabled={disabled}
              placeholder={empty?.label ?? placeholder}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="done"
              className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-3 outline-none"
              value={editing ? text : chosenLabel}
              onChange={(event) => {
                setText(event.target.value);
                setEditing(true);
                setOpen(true);
                setHighlighted(
                  allOptions(filterGroups(groups, event.target.value))[0]?.value ?? ""
                );
              }}
              onClick={() => setOpen(true)}
              onFocus={(event) => {
                event.currentTarget.select();
                // Room for the list above the on-screen keyboard.
                fieldRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
              onBlur={leave}
              onKeyDown={(event) => {
                // Like a select, Enter opens the closed list rather than submitting.
                if ((event.key === "ArrowDown" || event.key === "Enter") && !open) {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpen(true);
                }
                // In a text field, Home and End move the caret, not cmdk's highlight.
                if (event.key === "Home" || event.key === "End") event.stopPropagation();
              }}
            />
            {empty && (editing ? text : chosenLabel) !== "" && (
              <button
                type="button"
                aria-label="Clear selection"
                disabled={disabled}
                className="text-muted-foreground flex w-11 shrink-0 items-center justify-center"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(empty.value)}
              >
                <XIcon className="size-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              tabIndex={-1}
              aria-label="Show all options"
              disabled={disabled}
              className="text-muted-foreground flex w-11 shrink-0 items-center justify-center"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setEditing(false);
                setOpen(!open);
              }}
            >
              <ChevronDownIcon className="size-4" aria-hidden />
            </button>
          </div>
        </PopoverAnchor>
        {name && <input type="hidden" name={name} value={value} />}
        <div aria-live="polite" className="sr-only">
          {open && query.trim()
            ? `${allOptions(shown).length} ${allOptions(shown).length === 1 ? "result" : "results"}`
            : ""}
        </div>
        <PopoverContent
          id={listId}
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Keep focus in the field, and let the list scroll inside a dialog's scroll lock.
          onMouseDown={(event) => event.preventDefault()}
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onInteractOutside={(event) => {
            if (event.target instanceof Node && fieldRef.current?.contains(event.target))
              event.preventDefault();
          }}
        >
          <Results groups={shown} query={query} value={value} onPick={pick} />
        </PopoverContent>
      </Command>
    </Popover>
  );
}
