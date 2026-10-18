// PROTOTYPE (#177): throwaway variant switcher. Never merge to main.
import { useEffect } from "react";

interface PrototypeSwitcherProps<Key extends string> {
  variants: readonly { key: Key; name: string }[];
  current: Key;
  onChange: (key: Key) => void;
}

export function PrototypeSwitcher<Key extends string>({
  variants,
  current,
  onChange,
}: PrototypeSwitcherProps<Key>) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current)
  );
  const step = (by: number) => {
    const next = variants[(index + by + variants.length) % variants.length];
    if (next) onChange(next.key);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;
  const active = variants[index];

  return (
    <div
      className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-2 py-1 text-background shadow-float"
      style={{ bottom: "calc(var(--bottom-chrome) + 5rem)" }}
    >
      <button type="button" className="px-2 py-1" aria-label="Previous variant" onClick={() => step(-1)}>
        ←
      </button>
      <span className="text-label font-medium whitespace-nowrap">
        {active?.key} ({active?.name})
      </span>
      <button type="button" className="px-2 py-1" aria-label="Next variant" onClick={() => step(1)}>
        →
      </button>
    </div>
  );
}
