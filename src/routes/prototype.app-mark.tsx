// PROTOTYPE (throwaway, branch prototype/app-mark): six app-mark variants at /prototype/app-mark,
// switchable with ?variant= and ?tile=rounded|square|none. Never merge into main.
/* eslint-disable arch/no-color-literal, better-tailwindcss/no-unknown-classes -- throwaway prototype: light-token copy and the .dark scope class */
import { useEffect, type CSSProperties } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";

type MarkPath = { d: string; evenOdd?: boolean };
type Variant = { key: string; name: string; paths: MarkPath[] };
type Tile = "rounded" | "square" | "none";

const n = (value: number) => +value.toFixed(2);
const poly = (points: [number, number][]) =>
  `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L")} Z`;
const circle = (cx: number, cy: number, r: number) =>
  `M${n(cx - r)} ${n(cy)} a${r} ${r} 0 1 0 ${n(2 * r)} 0 a${r} ${r} 0 1 0 ${n(-2 * r)} 0 Z`;
const edge = (x1: number, y1: number, x2: number, y2: number, width: number) => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const nx = (-(y2 - y1) / length) * (width / 2);
  const ny = ((x2 - x1) / length) * (width / 2);
  return poly([
    [x1 + nx, y1 + ny],
    [x2 + nx, y2 + ny],
    [x2 - nx, y2 - ny],
    [x1 - nx, y1 - ny],
  ]);
};

type Satellite = { angle: number; distance: number; r: number };

// One closed outline for a hub circle, its links and its satellite circles, so an evenodd
// cut-out never overlaps itself. Satellites must be sorted by angle (degrees, clockwise from +x).
const hubNetwork = (cx: number, cy: number, hubR: number, sats: Satellite[], linkWidth: number) => {
  const half = linkWidth / 2;
  const at = (x: number, y: number, r: number, radians: number) =>
    `${n(x + r * Math.cos(radians))} ${n(y + r * Math.sin(radians))}`;
  const hubSpread = Math.asin(half / hubR);
  const spokes = sats.map((sat) => ({ ...sat, theta: (sat.angle * Math.PI) / 180 }));
  const parts: string[] = [];
  spokes.forEach((sat, index) => {
    const sx = cx + sat.distance * Math.cos(sat.theta);
    const sy = cy + sat.distance * Math.sin(sat.theta);
    const satSpread = Math.asin(half / sat.r);
    const start = sat.theta - hubSpread;
    parts.push(
      index === 0
        ? `M${at(cx, cy, hubR, start)}`
        : `A${hubR} ${hubR} 0 0 1 ${at(cx, cy, hubR, start)}`
    );
    parts.push(`L${at(sx, sy, sat.r, sat.theta + Math.PI + satSpread)}`);
    parts.push(`A${sat.r} ${sat.r} 0 1 1 ${at(sx, sy, sat.r, sat.theta + Math.PI - satSpread)}`);
    parts.push(`L${at(cx, cy, hubR, sat.theta + hubSpread)}`);
  });
  const first = spokes[0];
  const last = spokes[spokes.length - 1];
  if (first && last) {
    const span = first.theta + 2 * Math.PI - last.theta - 2 * hubSpread;
    parts.push(
      `A${hubR} ${hubR} 0 ${span > Math.PI ? 1 : 0} 1 ${at(cx, cy, hubR, first.theta - hubSpread)}`
    );
  }
  return `${parts.join(" ")} Z`;
};

const HOUSE = poly([
  [12, 3],
  [21, 10.5],
  [21, 21],
  [3, 21],
  [3, 10.5],
]);

const VARIANTS: Variant[] = [
  {
    key: "A1",
    name: "Outline house, hub dot",
    paths: [
      {
        d: `${HOUSE} ${poly([
          [12, 5.6],
          [19, 11.43],
          [19, 19],
          [5, 19],
          [5, 11.43],
        ])} ${circle(12, 14.25, 2.5)}`,
        evenOdd: true,
      },
    ],
  },
  {
    key: "A2",
    name: "Solid house, hub cut-out",
    paths: [{ d: `${HOUSE} ${circle(12, 14.5, 3)}`, evenOdd: true }],
  },
  {
    key: "A5",
    name: "Solid house, hub with 3 satellites",
    paths: [
      {
        d: `${HOUSE} ${hubNetwork(
          12,
          14,
          2.5,
          [
            { angle: -90, distance: 5.5, r: 1.25 },
            { angle: 30, distance: 5.5, r: 1.5 },
            { angle: 160, distance: 5.5, r: 1 },
          ],
          1
        )}`,
        evenOdd: true,
      },
    ],
  },
  {
    key: "A6",
    name: "Solid house, hub with 4 satellites",
    paths: [
      {
        d: `${HOUSE} ${hubNetwork(
          12,
          14.5,
          2.75,
          [
            { angle: -100, distance: 6, r: 1.5 },
            { angle: -20, distance: 5.5, r: 1 },
            { angle: 50, distance: 5, r: 1.25 },
            { angle: 150, distance: 5.5, r: 1.75 },
          ],
          1.25
        )}`,
        evenOdd: true,
      },
    ],
  },
  {
    key: "A3",
    name: "Roof over a hub",
    paths: [
      {
        d: poly([
          [12, 3.5],
          [21, 11.15],
          [21, 14.43],
          [12, 6.78],
          [3, 14.43],
          [3, 11.15],
        ]),
      },
      { d: circle(12, 16.5, 4) },
    ],
  },
  {
    key: "A4",
    name: "House of connected nodes",
    paths: [
      { d: edge(12, 4.5, 5, 19, 1.75) },
      { d: edge(12, 4.5, 19, 19, 1.75) },
      { d: edge(5, 19, 19, 19, 1.75) },
      { d: edge(12, 13.5, 12, 4.5, 1.75) },
      { d: edge(12, 13.5, 5, 19, 1.75) },
      { d: edge(12, 13.5, 19, 19, 1.75) },
      { d: circle(12, 4.5, 2.5) },
      { d: circle(5, 19, 2.5) },
      { d: circle(19, 19, 2.5) },
      { d: circle(12, 13.5, 3) },
    ],
  },
  {
    key: "B1",
    name: "H joined by a hub",
    paths: [
      {
        d: poly([
          [4.5, 4],
          [8.5, 4],
          [8.5, 20],
          [4.5, 20],
        ]),
      },
      {
        d: poly([
          [15.5, 4],
          [19.5, 4],
          [19.5, 20],
          [15.5, 20],
        ]),
      },
      { d: circle(12, 12, 3.75) },
    ],
  },
  {
    key: "B2",
    name: "Gabled H",
    paths: [
      {
        d: poly([
          [4, 8.75],
          [9, 4.75],
          [9, 19.25],
          [4, 19.25],
        ]),
      },
      {
        d: poly([
          [15, 4.75],
          [20, 8.75],
          [20, 19.25],
          [15, 19.25],
        ]),
      },
      {
        d: poly([
          [8.5, 10.75],
          [15.5, 10.75],
          [15.5, 13.75],
          [8.5, 13.75],
        ]),
      },
    ],
  },
];

const TILES: Tile[] = ["rounded", "square", "none"];

// Light tokens from src/index.css, so the light panes stay light when the app runs dark.
const LIGHT = {
  "--background": "oklch(0.975 0.007 80)",
  "--foreground": "oklch(0.23 0.018 262)",
  "--primary": "oklch(0.42 0.12 262)",
  "--primary-foreground": "oklch(0.985 0.005 80)",
  "--border": "oklch(0.3 0.03 70 / 0.14)",
  "--muted-foreground": "oklch(0.5 0.018 70)",
} as CSSProperties;

export const Route = createFileRoute("/prototype/app-mark")({
  validateSearch: (search: Record<string, unknown>): { variant: string; tile: Tile } => ({
    variant: typeof search.variant === "string" ? search.variant : "A1",
    tile: TILES.includes(search.tile as Tile) ? (search.tile as Tile) : "rounded",
  }),
  component: AppMarkPrototype,
});

function svgSource(variant: Variant) {
  const paths = variant.paths
    .map(({ d, evenOdd }) => `  <path${evenOdd ? ' fill-rule="evenodd"' : ""} d="${d}"/>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">\n${paths}\n</svg>`;
}

function Mark({ variant, size }: { variant: Variant; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      {variant.paths.map(({ d, evenOdd }) => (
        <path key={d} d={d} fillRule={evenOdd ? "evenodd" : undefined} />
      ))}
    </svg>
  );
}

// The mark fills 60% of the tile, which keeps every variant inside the 80% maskable safe circle.
function MarkTile({ variant, size, tile }: { variant: Variant; size: number; tile: Tile }) {
  if (tile === "none") {
    return (
      <span className="text-primary">
        <Mark variant={variant} size={size} />
      </span>
    );
  }
  return (
    <div
      className="grid shrink-0 place-items-center bg-primary text-primary-foreground"
      style={{ width: size, height: size, borderRadius: tile === "rounded" ? size * 0.225 : 0 }}
    >
      <Mark variant={variant} size={size * 0.6} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-body font-medium text-muted-foreground">{title}</h2>
      <div className="flex flex-wrap items-end gap-6">{children}</div>
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col items-center gap-2">
      {children}
      <figcaption className="text-caption text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function DrawerHeader({ variant, tile, dark }: { variant: Variant; tile: Tile; dark: boolean }) {
  return (
    <div
      className={`w-80 border bg-background text-foreground ${dark ? "dark" : ""}`}
      style={dark ? undefined : LIGHT}
    >
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <MarkTile variant={variant} size={40} tile={tile} />
          <span className="text-title font-semibold">Household Hub</span>
        </div>
        <X className="h-4 w-4" />
      </div>
    </div>
  );
}

function StartupScreen({ variant, tile, dark }: { variant: Variant; tile: Tile; dark: boolean }) {
  return (
    <div
      className={`grid h-[390px] w-[180px] place-items-center rounded-lg border bg-background ${dark ? "dark" : ""}`}
      style={dark ? undefined : LIGHT}
    >
      <MarkTile variant={variant} size={64} tile={tile} />
    </div>
  );
}

function AppMarkPrototype() {
  const { variant: variantKey, tile } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const index = Math.max(
    0,
    VARIANTS.findIndex((candidate) => candidate.key === variantKey)
  );
  const variant = VARIANTS[index] ?? VARIANTS[0];

  const go = (step: number) => {
    const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length];
    if (next) void navigate({ search: { variant: next.key, tile }, replace: true });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!variant) return null;

  return (
    <div className="min-h-dvh space-y-12 bg-background p-6 pb-16 text-foreground">
      <header className="space-y-1">
        <h1 className="text-title font-semibold">
          {variant.key}: {variant.name}
        </h1>
        <p className="text-body text-muted-foreground">Tile: {tile}</p>
      </header>

      <Section title="Sizes">
        {[512, 192, 32, 16].map((size) => (
          <Labeled key={size} label={`${size}px`}>
            <MarkTile variant={variant} size={size} tile={tile} />
          </Labeled>
        ))}
      </Section>

      <Section title="Maskable (full-bleed source, then the 80% safe-zone circle) and monochrome badge">
        <Labeled label="source 192">
          <MarkTile variant={variant} size={192} tile="square" />
        </Labeled>
        <Labeled label="circle crop 80%">
          <div style={{ clipPath: "circle(40%)" }}>
            <MarkTile variant={variant} size={192} tile="square" />
          </div>
        </Labeled>
        <Labeled label="badge 72 / 24">
          <div className="flex items-center gap-4 rounded-lg bg-foreground p-3 text-background">
            <Mark variant={variant} size={72} />
            <Mark variant={variant} size={24} />
          </div>
        </Labeled>
      </Section>

      <Section title="Drawer header">
        <DrawerHeader variant={variant} tile={tile} dark={false} />
        <DrawerHeader variant={variant} tile={tile} dark />
      </Section>

      <Section title="Start-up screen">
        <StartupScreen variant={variant} tile={tile} dark={false} />
        <StartupScreen variant={variant} tile={tile} dark />
      </Section>

      <Section title="SVG">
        <pre className="max-w-full overflow-x-auto rounded-lg border p-3 text-caption">
          {svgSource(variant)}
        </pre>
      </Section>

      {import.meta.env.DEV && (
        <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-2 py-1 text-background shadow-float">
          <button className="size-10 rounded-full hover:bg-background/10" onClick={() => go(-1)}>
            ←
          </button>
          <span className="text-center text-body" style={{ minWidth: 224 }}>
            {variant.key} ({variant.name})
          </span>
          <button className="size-10 rounded-full hover:bg-background/10" onClick={() => go(1)}>
            →
          </button>
          <span className="mx-1 h-6 w-px bg-background/20" />
          {TILES.map((option) => (
            <button
              key={option}
              className={`rounded-full px-3 py-2 text-caption ${option === tile ? "bg-background text-foreground" : "hover:bg-background/10"}`}
              onClick={() =>
                void navigate({ search: { variant: variant.key, tile: option }, replace: true })
              }
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
