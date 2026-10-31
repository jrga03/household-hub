/**
 * PROTOTYPE (#284), throwaway. Three picker variants, switched by the floating bar
 * (or `?variant=A|B|C` on load). Lives on branch prototype/284-picker only.
 *  A: list with a search box in a popover (the current feature branch).
 *  B: an editable text field; the list opens under it.
 *  C: phones open a full-screen search view; wider screens use B.
 */
import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Command as CommandPrimitive, useCommandState } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ChevronDownIcon, ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useIsCompact } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { Combobox, type ComboboxGroup } from "./Combobox";

// ---- variant store ---------------------------------------------------------

const VARIANTS = {
  A: "List with search box",
  B: "Editable field",
  C: "Full-screen on phones",
} as const;
type Variant = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Variant[];
const STORAGE = "prototype-284-variant";
const isVariant = (value: unknown): value is Variant => KEYS.includes(value as Variant);

const listeners = new Set<() => void>();
let current: Variant = (() => {
  const fromUrl = new URLSearchParams(window.location.search).get("variant");
  if (isVariant(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem(STORAGE);
    return isVariant(stored) ? stored : "A";
  } catch {
    return "A";
  }
})();
function setVariant(next: Variant) {
  current = next;
  try {
    localStorage.setItem(STORAGE, next);
  } catch {
    // private mode
  }
  listeners.forEach((listener) => listener());
}
export const usePickerVariant = () =>
  useSyncExternalStore(
    (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    () => current
  );

export function PrototypeSwitcher() {
  const variant = usePickerVariant();
  const step = (by: number) =>
    setVariant(KEYS[(KEYS.indexOf(variant) + by + KEYS.length) % KEYS.length] ?? "A");
  return (
    <div className="fixed bottom-16 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground p-1 text-background shadow-float">
      <button
        type="button"
        aria-label="Previous variant"
        className="rounded-full p-2"
        onClick={() => step(-1)}
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-2 text-label font-medium whitespace-nowrap">
        {variant} · {VARIANTS[variant]}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        className="rounded-full p-2"
        onClick={() => step(1)}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

// ---- shared ----------------------------------------------------------------

export interface PickerProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-label"?: string;
  name?: string;
  value: string;
  onValueChange: (value: string) => void;
  groups: ComboboxGroup[];
  /** The value an empty field means, and how it reads. Omit when a value is required. */
  empty?: { value: string; label: string };
  placeholder?: string;
  className?: string;
}

const lower = (text: string) => text.toLowerCase();

function filterGroups(groups: ComboboxGroup[], query: string) {
  const q = lower(query.trim());
  if (!q) return groups;
  return groups
    .map((group) => ({
      ...group,
      options:
        group.label && lower(group.label).includes(q)
          ? group.options
          : group.options.filter((option) => lower(option.label).includes(q)),
    }))
    .filter((group) => group.options.length > 0);
}

function Highlight({ text, query }: { text: string; query: string }) {
  const at = query.trim() ? lower(text).indexOf(lower(query.trim())) : -1;
  if (at < 0) return <>{text}</>;
  const end = at + query.trim().length;
  return (
    <span>
      {text.slice(0, at)}
      <strong className="font-bold">{text.slice(at, end)}</strong>
      {text.slice(end)}
    </span>
  );
}

function labelOf(groups: ComboboxGroup[], value: string) {
  return groups.flatMap((group) => group.options).find((option) => option.value === value)?.label;
}

function Results({
  groups,
  query,
  value,
  onPick,
}: {
  groups: ComboboxGroup[];
  query: string;
  value: string;
  onPick: (value: string) => void;
}) {
  const shown = filterGroups(groups, query);
  return (
    <>
      <div aria-live="polite" className="sr-only">
        {query.trim() ? `${shown.flatMap((group) => group.options).length} results` : ""}
      </div>
      {shown.length === 0 && <CommandEmpty>No matches</CommandEmpty>}
      {shown.map((group, index) => (
        <CommandGroup
          key={group.label ?? index}
          heading={group.label && <Highlight text={group.label} query={query} />}
        >
          {group.options.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              onSelect={() => onPick(option.value)}
            >
              <Highlight text={option.label} query={query} />
              {option.value === value && (
                <span className="ml-auto text-caption text-muted-foreground">Current</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  );
}

const fieldClasses =
  "border-input focus-within:border-ring focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-destructive dark:bg-input/30 flex h-9 w-full items-center rounded-md border bg-transparent text-control focus-within:ring-[3px]";

function FieldButtons({
  showClear,
  onClear,
  onToggle,
  label,
}: {
  showClear: boolean;
  onClear: () => void;
  onToggle: () => void;
  label: string;
}) {
  return (
    <>
      {showClear && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          className="flex size-9 shrink-0 items-center justify-center text-muted-foreground"
          onClick={onClear}
        >
          <XIcon className="size-4" />
        </button>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Show all ${label} choices`}
        className="flex size-9 shrink-0 items-center justify-center text-muted-foreground"
        onClick={onToggle}
      >
        <ChevronDownIcon className="size-4" />
      </button>
    </>
  );
}

// ---- B: editable field -----------------------------------------------------

/** A plain input, so the Field's label names it; cmdk's own Input replaces id and label. */
function FieldInput(props: ComponentProps<"input">) {
  const activeId = useCommandState(
    (state) => (state as { selectedItemId?: string }).selectedItemId
  );
  return <input {...props} aria-activedescendant={props["aria-expanded"] ? activeId : undefined} />;
}

function EditableCombobox({
  id,
  name,
  value,
  onValueChange,
  groups,
  empty,
  placeholder,
  className,
  ...aria
}: PickerProps) {
  const valueLabel = value === empty?.value ? "" : (labelOf(groups, value) ?? "");
  const [text, setText] = useState(valueLabel);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const shownText = editing ? text : valueLabel;
  const query = editing ? text : "";

  const pick = (next: string) => {
    onValueChange(next);
    setEditing(false);
    setOpen(false);
  };
  const leave = () => {
    if (!editing) return setOpen(false);
    if (text.trim() === "" && empty) return pick(empty.value);
    const exact = groups
      .flatMap((group) => group.options)
      .find((option) => lower(option.label) === lower(text.trim()));
    if (exact) return pick(exact.value);
    setEditing(false); // shortcut: invalid text reverts to the last valid value
    setOpen(false);
  };
  const fieldName = aria["aria-label"] ?? "category";

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : leave())}>
      <Command
        shouldFilter={false}
        label={fieldName}
        className={cn("h-auto overflow-visible bg-transparent", className)}
      >
        <PopoverAnchor asChild>
          <div className={fieldClasses}>
            <FieldInput
              ref={inputRef}
              id={id}
              {...aria}
              role="combobox"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-autocomplete="list"
              enterKeyHint="done"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              placeholder={empty?.label ?? placeholder}
              className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-muted-foreground"
              value={shownText}
              onChange={(event) => {
                setText(event.target.value);
                setEditing(true);
                setOpen(true);
              }}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={leave}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && !open) setOpen(true);
                // cmdk eats Enter; with the list closed, let it submit the form.
                if (event.key === "Enter" && !open) event.stopPropagation();
              }}
            />
            <FieldButtons
              label={fieldName}
              showClear={Boolean(empty) && shownText !== ""}
              onClear={() => pick(empty?.value ?? "")}
              onToggle={() => {
                setEditing(false);
                setOpen(!open);
              }}
            />
          </div>
        </PopoverAnchor>
        {name && <input type="hidden" name={name} value={value} />}
        <PopoverContent
          id={listId}
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-56 p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onInteractOutside={(event) => {
            if (
              event.target instanceof Node &&
              inputRef.current?.parentElement?.contains(event.target)
            )
              event.preventDefault();
          }}
        >
          <CommandList>
            <Results groups={groups} query={query} value={value} onPick={pick} />
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}

// ---- C: full-screen search view on phones ----------------------------------

function FullScreenPicker({
  id,
  name,
  value,
  onValueChange,
  groups,
  empty,
  placeholder,
  className,
  trigger,
  ...aria
}: PickerProps & { trigger?: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const valueLabel = value === empty?.value ? "" : (labelOf(groups, value) ?? "");
  const fieldName = aria["aria-label"] ?? "category";
  const pick = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };
  const show = () => {
    setQuery("");
    setOpen(true);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {trigger ? (
        trigger(show)
      ) : (
        <div className={cn(fieldClasses, className)}>
          <button
            type="button"
            id={id}
            {...aria}
            aria-haspopup="dialog"
            onClick={show}
            className={cn(
              "h-full min-w-0 flex-1 truncate px-3 text-left outline-none",
              !valueLabel && "text-muted-foreground"
            )}
          >
            {valueLabel || empty?.label || placeholder}
          </button>
          <FieldButtons
            label={fieldName}
            showClear={Boolean(empty) && valueLabel !== ""}
            onClear={() => pick(empty?.value ?? "")}
            onToggle={show}
          />
        </div>
      )}
      {name && <input type="hidden" name={name} value={value} />}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[60] flex flex-col bg-background pt-[var(--safe-area-top,0px)]"
        >
          <DialogPrimitive.Title className="sr-only">Choose {fieldName}</DialogPrimitive.Title>
          <Command
            shouldFilter={false}
            label={`Search ${fieldName}`}
            className="flex-1 rounded-none bg-background"
          >
            <div className="flex items-center gap-1 border-b px-1">
              <DialogPrimitive.Close
                aria-label="Back"
                className="flex size-11 items-center justify-center"
              >
                <ArrowLeft className="size-5" />
              </DialogPrimitive.Close>
              <CommandPrimitive.Input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the search view exists to search
                autoFocus
                enterKeyHint="done"
                autoCapitalize="off"
                placeholder={`Search ${fieldName}`}
                value={query}
                onValueChange={setQuery}
                className="h-14 min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="flex size-11 items-center justify-center text-muted-foreground"
                  onClick={() => setQuery("")}
                >
                  <XIcon className="size-5" />
                </button>
              )}
            </div>
            <CommandList className="max-h-none flex-1 pb-[var(--safe-area-bottom,0px)]">
              {empty && !query && (
                <CommandGroup>
                  <CommandItem value={`__empty`} onSelect={() => pick(empty.value)}>
                    <span className="text-muted-foreground">{empty.label}</span>
                  </CommandItem>
                </CommandGroup>
              )}
              <Results groups={groups} query={query} value={value} onPick={pick} />
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---- the switch ------------------------------------------------------------

/** Form pickers. In A, `empty` turns back into a list item. */
export function PickerPrototype(props: PickerProps) {
  const variant = usePickerVariant();
  const compact = useIsCompact();
  if (variant === "C" && compact) return <FullScreenPicker {...props} />;
  if (variant === "B" || variant === "C") return <EditableCombobox {...props} />;
  const { empty, groups, ...rest } = props;
  return (
    <Combobox
      {...rest}
      groups={
        empty ? [{ options: [{ value: empty.value, label: empty.label }] }, ...groups] : groups
      }
    />
  );
}

/** The phone filter chip in C opens the full-screen view; otherwise the given chip. */
export function ChipPrototype({
  chip,
  ...props
}: PickerProps & { chip: (open: () => void) => ReactNode; fallback: ReactNode }) {
  const variant = usePickerVariant();
  const compact = useIsCompact();
  if (variant === "C" && compact) return <FullScreenPicker {...props} trigger={chip} />;
  return <>{props.fallback}</>;
}
