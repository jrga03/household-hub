import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const stepByKey: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/** A few mutually exclusive options side by side, operated as a radio group. */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
  className?: string;
}) {
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    radios.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  }

  function handleKeyDown(event: KeyboardEvent, index: number) {
    const lastIndex = options.length - 1;
    const step = stepByKey[event.key];
    let target: number;
    if (step !== undefined) target = (index + step + options.length) % options.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = lastIndex;
    else return;
    event.preventDefault();
    select(target);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-md border p-0.5", className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              radios.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "rounded-sm px-3 py-1 text-body font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
              checked && "bg-secondary text-secondary-foreground hover:text-secondary-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
