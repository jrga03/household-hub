// PROTOTYPE (#194): open /prototype.html. ←/→ cycle variants; the bar picks screen, view and theme.
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "@/index.css";
import { cn } from "@/lib/utils";
import { Shell } from "./Shell";
import { SCREEN_KEYS, SCREENS, type ScreenKey } from "./screens";

type View = "both" | "phone" | "laptop";
type Theme = "light" | "dark";

const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1280, height: 800 };

interface State {
  screen: ScreenKey;
  variant: string;
  view: View;
  theme: Theme;
}

function readState(): State {
  const params = new URLSearchParams(window.location.search);
  const screen = SCREEN_KEYS.find((key) => key === params.get("screen")) ?? "home";
  const variants = SCREENS[screen].variants;
  const variant =
    variants.find((option) => option.key === params.get("variant"))?.key ?? variants[0]?.key ?? "A";
  const view = (["both", "phone", "laptop"] as const).find((v) => v === params.get("view")) ?? "both";
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  return { screen, variant, view, theme };
}

const queryOf = (state: State, frame?: "phone" | "laptop") =>
  new URLSearchParams({ ...state, ...(frame ? { frame } : {}) }).toString();

function Frame() {
  const { screen, variant, theme } = readState();
  document.documentElement.classList.toggle("dark", theme === "dark");
  const { title, variants } = SCREENS[screen];
  const chosen = variants.find((option) => option.key === variant);
  if (!chosen) return null;
  return (
    <Shell screen={screen} title={title} actions={chosen.actions?.()}>
      <chosen.Body />
    </Shell>
  );
}

function Gallery() {
  const [state, setState] = useState(readState);
  const variants = SCREENS[state.screen].variants;
  const index = Math.max(
    0,
    variants.findIndex((option) => option.key === state.variant)
  );
  const current = variants[index];

  const update = (next: Partial<State>) =>
    setState((previous) => {
      const merged = { ...previous, ...next };
      if (next.screen && next.screen !== previous.screen) {
        merged.variant = SCREENS[next.screen].variants[0]?.key ?? "A";
      }
      window.history.replaceState(null, "", `?${queryOf(merged)}`);
      return merged;
    });

  const step = (by: number) => {
    const target = variants[(index + by + variants.length) % variants.length];
    if (target) update({ variant: target.key });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-dvh flex-col bg-muted">
      <div className="flex min-h-0 flex-1 items-start justify-center gap-6 overflow-auto p-6">
        {state.view !== "laptop" && <Device size={PHONE} src={`?${queryOf(state, "phone")}`} />}
        {state.view !== "phone" && (
          <Device size={LAPTOP} src={`?${queryOf(state, "laptop")}`} fit={state.view === "both"} />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 border-t bg-popover p-3 text-popover-foreground">
        <Segmented
          options={SCREEN_KEYS.map((key) => ({ key, label: SCREENS[key].title }))}
          value={state.screen}
          onChange={(screen) => update({ screen })}
        />
        <div className="flex items-center gap-1 rounded-full bg-foreground px-1 text-background">
          <button type="button" aria-label="Previous variant" className="p-2" onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-56 text-center text-body font-medium">
            {current ? `${current.key} · ${current.name}` : "No variants"}
          </span>
          <button type="button" aria-label="Next variant" className="p-2" onClick={() => step(1)}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <Segmented
          options={[
            { key: "both", label: "Both" },
            { key: "phone", label: "Phone" },
            { key: "laptop", label: "Laptop" },
          ]}
          value={state.view}
          onChange={(view) => update({ view })}
        />
        <Segmented
          options={[
            { key: "light", label: "Light" },
            { key: "dark", label: "Dark" },
          ]}
          value={state.theme}
          onChange={(theme) => update({ theme })}
        />
      </div>
    </div>
  );
}

function Device({
  size,
  src,
  fit = false,
}: {
  size: { width: number; height: number };
  src: string;
  fit?: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = holder.current;
    if (!element || !fit) return setScale(1);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1, entry.contentRect.width / size.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit, size.width]);

  return (
    <div ref={holder} className={cn("min-w-0", fit ? "flex-1" : "shrink-0")}>
      <div style={{ width: size.width * scale, height: size.height * scale }}>
        <iframe
          title="Prototype screen"
          src={src}
          width={size.width}
          height={size.height}
          className="origin-top-left rounded-lg border bg-background"
          style={{ transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}

function Segmented<Key extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: Key; label: string }[];
  value: Key;
  onChange: (key: Key) => void;
}) {
  return (
    <div className="flex rounded-md border p-0.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={option.key === value}
          className={cn(
            "rounded-sm px-3 py-1 text-body font-medium text-muted-foreground",
            option.key === value && "bg-secondary text-secondary-foreground"
          )}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  const isFrame = new URLSearchParams(window.location.search).has("frame");
  createRoot(root).render(<StrictMode>{isFrame ? <Frame /> : <Gallery />}</StrictMode>);
}
