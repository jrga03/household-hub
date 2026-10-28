/**
 * PROTOTYPE (#259): throwaway. The floating variant switcher; dev builds only.
 * ← and → cycle variants unless focus is in a field or a radio group.
 */

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DataSource } from "./data";

const SOURCES: DataSource[] = ["demo", "thin", "real"];

export function PrototypeSwitcher<Key extends string>({
  variants,
  current,
  onVariantChange,
  source,
  onSourceChange,
  state,
}: {
  variants: readonly { key: Key; name: string }[];
  current: Key;
  onVariantChange: (key: Key) => void;
  source: DataSource;
  onSourceChange: (source: DataSource) => void;
  state: Record<string, unknown>;
}) {
  const [showState, setShowState] = useState(false);
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current)
  );
  const step = (by: number) => {
    const next = variants[(index + by + variants.length) % variants.length];
    if (next) onVariantChange(next.key);
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable], [role=radiogroup]")
      )
        return;
      step(event.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!import.meta.env.DEV) return null;
  const variant = variants[index];
  const nextSource = SOURCES[(SOURCES.indexOf(source) + 1) % SOURCES.length] ?? "demo";

  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--bottom-chrome)+1rem)] z-50 flex flex-col items-center gap-2 px-4">
      {showState && (
        <pre className="max-h-48 max-w-full overflow-auto rounded-md bg-foreground p-3 text-caption text-background shadow-float">
          {JSON.stringify(state, null, 2)}
        </pre>
      )}
      <div className="flex items-center gap-1 rounded-full bg-foreground p-1 text-label text-background shadow-float">
        <button
          type="button"
          aria-label="Previous variant"
          onClick={() => step(-1)}
          className="rounded-full p-2 hover:bg-background/20"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <span className="px-2 font-medium whitespace-nowrap">
          {variant ? `${variant.key} (${variant.name})` : current}
        </span>
        <button
          type="button"
          aria-label="Next variant"
          onClick={() => step(1)}
          className="rounded-full p-2 hover:bg-background/20"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onSourceChange(nextSource)}
          className="rounded-full px-3 py-2 hover:bg-background/20"
        >
          Data: {source}
        </button>
        <button
          type="button"
          aria-pressed={showState}
          onClick={() => setShowState(!showState)}
          className="rounded-full px-3 py-2 hover:bg-background/20"
        >
          State
        </button>
      </div>
    </div>
  );
}
