// PROTOTYPE (#392), throwaway: three takes on the pin toggle in the draft detail.
// Variants switch with ?variant=A|B|C; ?sim= fakes where the suggested values came from.
// Pins live in memory only. Nothing here touches the event log.
import { useEffect, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import { Button } from "@/components/app/Button";
import { Checkbox } from "@/components/app/Checkbox";
import { Label } from "@/components/app/Label";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Switch } from "@/components/app/Switch";

export const VARIANTS = {
  A: "Checkbox by the fields",
  B: "Save and remember button",
  C: "Next time section",
} as const;
type Variant = keyof typeof VARIANTS;
const VARIANT_KEYS = Object.keys(VARIANTS) as Variant[];

export const SIMS = {
  real: "As read (real sources)",
  history: "From a typed-in transaction",
  learned: "Learned from 3 imports",
  pinned: "Learned, one save remembered",
} as const;
type Sim = keyof typeof SIMS;
const SIM_KEYS = Object.keys(SIMS) as Sim[];

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
};
// The route's validateSearch drops unknown params when a draft opens, so sessionStorage backs the URL.
const read = (key: string) =>
  new URLSearchParams(window.location.search).get(key) ?? sessionStorage.getItem(`proto392:${key}`);
const write = (key: string, value: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  sessionStorage.setItem(`proto392:${key}`, value);
  window.history.replaceState(window.history.state, "", url);
  listeners.forEach((listener) => listener());
};

export function usePrototype() {
  const variantParam = useSyncExternalStore(subscribe, () => read("variant"));
  const simParam = useSyncExternalStore(subscribe, () => read("sim"));
  const variant: Variant = VARIANT_KEYS.find((key) => key === variantParam) ?? "A";
  const sim: Sim = SIM_KEYS.find((key) => key === simParam) ?? "learned";
  return { variant, sim };
}

const pins = new Map<string, boolean>();
const pinListeners = new Set<() => void>();
export function usePin(draftId: string) {
  const pinned = useSyncExternalStore(
    (listener) => {
      pinListeners.add(listener);
      return () => pinListeners.delete(listener);
    },
    () => pins.get(draftId) ?? false
  );
  const setPinned = (value: boolean) => {
    pins.set(draftId, value);
    pinListeners.forEach((listener) => listener());
  };
  return [pinned, setPinned] as const;
}

/** The badge beside a suggested field, per variant and simulated source. */
export function SourceBadge({ realSuggested }: { realSuggested: boolean }) {
  const { variant, sim } = usePrototype();
  if (sim === "real" ? !realSuggested : false) return null;
  if (variant === "B") {
    if (sim === "learned") return <Badge>Learned</Badge>;
    if (sim === "pinned")
      return (
        <StatusBadge tone="outline" icon={Pin} className="font-normal">
          Remembered
        </StatusBadge>
      );
  }
  return <Badge>Suggested</Badge>;
}

function Badge({ children }: { children: string }) {
  return (
    <StatusBadge tone="outline" className="font-normal">
      {children}
    </StatusBadge>
  );
}

/** A: one checkbox under the fields, read at save. */
export function PinCheckbox({
  draftId,
  statementText,
}: {
  draftId: string;
  statementText: string;
}) {
  const [pinned, setPinned] = usePin(draftId);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Checkbox
          id="draft-pin"
          checked={pinned}
          onCheckedChange={(checked) => setPinned(checked === true)}
        />
        <Label htmlFor="draft-pin" className="font-normal">
          Use these details next time
        </Label>
      </div>
      <p className="pl-6 text-caption text-muted-foreground">
        The next “{statementText}” gets this description and category, until newer saves differ.
      </p>
    </div>
  );
}

/** C: a section after the fields that says where the values came from, with a switch. */
export function NextTimeSection({ draftId }: { draftId: string }) {
  const [pinned, setPinned] = usePin(draftId);
  const { sim } = usePrototype();
  const provenance = {
    real: "Nothing learned for this statement text yet.",
    history: "Suggested from a transaction you typed in.",
    learned: "Suggested from your last 3 imports of this statement text.",
    pinned: "Suggested from your last 3 imports of this statement text; one was remembered.",
  }[sim];
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="text-heading">Next time</h3>
      <p className="text-body text-muted-foreground">{provenance}</p>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="draft-pin" className="font-normal">
          Remember this description and category
        </Label>
        <Switch id="draft-pin" checked={pinned} onCheckedChange={setPinned} />
      </div>
    </section>
  );
}

/** The prototype's own bar: obviously not part of the design. */
export function PrototypeBar() {
  const { variant, sim } = usePrototype();
  const cycle = (step: number) => {
    const index = VARIANT_KEYS.indexOf(variant);
    write(
      "variant",
      VARIANT_KEYS[(index + step + VARIANT_KEYS.length) % VARIANT_KEYS.length] ?? "A"
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable], [role=combobox]")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;
  return (
    <div className="fixed bottom-[calc(1rem+var(--bottom-chrome))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground p-1 text-background shadow-float">
      <Button size="icon" variant="ghost" aria-label="Previous variant" onClick={() => cycle(-1)}>
        <ChevronLeft />
      </Button>
      <span className="text-label">
        {variant} ({VARIANTS[variant]})
      </span>
      <Button size="icon" variant="ghost" aria-label="Next variant" onClick={() => cycle(1)}>
        <ChevronRight />
      </Button>
      <select
        aria-label="Simulated source"
        className="rounded-full bg-background px-2 text-label text-foreground"
        value={sim}
        onChange={(event) => write("sim", event.target.value)}
      >
        {SIM_KEYS.map((key) => (
          <option key={key} value={key}>
            {SIMS[key]}
          </option>
        ))}
      </select>
    </div>
  );
}
