# Reports chart approach

Research for [#257](https://github.com/jrga03/household-hub/issues/257) (map [#256](https://github.com/jrga03/household-hub/issues/256)). Date: 2026-10-28.

## Question

Which chart approach should the Reports screen use for spending by group and category, months compared, and a trend, where a tap on a bar or point opens the transactions behind it? Candidates: Recharts loaded only on the Reports route, a small library, and hand-written SVG.

## Recommendation

Hand-write the charts as React components with no chart dependency. Spending by group and category is an HTML list of horizontal bars (each row a link to the filtered transactions), and months compared and the trend are small inline SVGs whose bars and points are focusable links. Use `d3-scale` (about 10 KB gz) only if writing the band and linear scales by hand turns out to be fiddly.

The trade-off: we give up the axes, tooltips, responsive container and animation a library ships, and write and test a few hundred lines ourselves. In return we get the smallest chunk, every bar as a real keyboard and screen-reader target that drills down, theming through the existing token classes (`fill-primary`, `text-muted-foreground`) with no extra wiring, and no React or lint friction. The Reports data is small (a dozen or so categories, a few months, about 12 trend points), so a library's scale and performance features buy us nothing.

If the charts later need much more (stacked series, brushing, many chart types), the fallback is visx, not Recharts: it is SVG and React, so the same token classes and drill links carry over.

## Constraints from this repo

- **Bundle budget.** `scripts/check-bundle-size.mjs` walks only the static import graph from the Vite manifest, so a dependency imported from the Reports route alone does not count against the 378 KB gz budget. TanStack Router's `autoCodeSplitting: true` (`vite.config.ts`) already makes each route its own chunk. A chart library's real cost is the Reports route's first load and the precache, not the budget.
- **Offline.** The PWA uses `injectManifest` with `globPatterns: ["**/*.{js,css,…}"]` (`vite.config.ts`), so every built JS chunk, lazy ones included, is precached on service-worker install. Every candidate works offline without config; a larger chunk only makes install heavier.
- **Theming.** Dark mode is a `.dark` class (`@custom-variant dark (&:is(.dark *))` in `src/index.css`, set by next-themes). Color literals and inline color styles fail lint in TSX (`arch/no-color-literal`, `arch/no-inline-color-style` in `eslint.config.js`); the lint message says to "use a token class, or read the token with getComputedStyle". `var(--color-…)` strings pass the regex.
- **Chart colors.** `DESIGN.md` says "Charts have no color roles yet. They get their own session; do not invent chart colors." Every approach needs that session first: one or more chart role tokens in `src/index.css`, their dark values, and a line in `DESIGN.md`.

## Measured sizes

Each entry imports only what Reports needs (bar, line, scales, axes, tooltip where the library has one), bundled with esbuild (minified, ESM, browser, `NODE_ENV=production`), with React and React DOM external because the app shell already ships them. gzip level 9. The measuring script lived in a scratchpad and is not committed.

| Candidate                                                            | Version       | Min (KB) | Gz (KB) |
| -------------------------------------------------------------------- | ------------- | -------: | ------: |
| ECharts core (Bar, Line, Grid, Tooltip, Aria, SVG renderer)          | 6.1.0         |      536 |   184.7 |
| Recharts (Bar, Line, axes, grid, Tooltip, Cell, ResponsiveContainer) | 3.10.1        |      385 |   112.2 |
| Recharts, bar only (no Line, grid, Tooltip)                          | 3.10.1        |      313 |    94.6 |
| Chart.js tree-shaken + react-chartjs-2                               | 4.6.1 / 5.3.1 |      162 |    57.0 |
| visx (shape, scale, group, axis)                                     | 4.0.0         |       65 |    23.4 |
| uPlot (no React wrapper)                                             | 1.6.32        |       51 |    22.6 |
| visx without axis                                                    | 4.0.0         |       43 |    15.6 |
| d3-scale + d3-shape `line`                                           | latest        |       25 |     9.9 |
| Hand-written SVG                                                     | n/a           |        0 |       0 |

Recharts 3 is heavy because it bundles a state store: its dependencies include `@reduxjs/toolkit`, `react-redux`, `immer`, `reselect`, `es-toolkit`, `decimal.js-light` and `victory-vendor` (d3) (`npm view recharts@3.10.1 dependencies`). These sizes are library code only; the Reports components add a few KB on top for every option.

## Comparison

| Criterion           | Recharts on the route                 | Chart.js                                                  | uPlot               | visx                          | Hand-written SVG              |
| ------------------- | ------------------------------------- | --------------------------------------------------------- | ------------------- | ----------------------------- | ----------------------------- |
| Gz as a route chunk | 112 KB                                | 57 KB                                                     | 23 KB               | 16 to 23 KB                   | 0 (10 KB with d3-scale)       |
| Offline             | Precached                             | Precached                                                 | Precached           | Precached                     | Precached                     |
| Keyboard            | One tab stop, arrows move the tooltip | None                                                      | None                | What we build                 | What we build                 |
| Screen reader       | `role="application"` surface          | Canvas, needs fallback content                            | Canvas, nothing     | What we build                 | What we build                 |
| Token theming       | `fill="var(--color-…)"` props         | Read tokens with `getComputedStyle`, redraw on theme flip | Same as Chart.js    | Token classes on SVG          | Token classes on SVG and HTML |
| React 19            | Peer `^19.0.0`                        | Wrapper peer `^19.0.0`                                    | No official wrapper | Peer `^18 \|\| ^19` since 4.0 | Native                        |
| Tap to drill        | `onClick` on `Bar` gets the entry     | `getElementAtEvent` on the canvas                         | Cursor hooks        | `onClick` on any shape        | A link per bar or point       |

### Recharts on the Reports route

- Size: 112 KB gz, the second largest measured. It stays out of the 378 KB budget but is the Reports route's first-visit cost and grows the precache.
- Accessibility: Recharts 3 turns `accessibilityLayer` on by default (`accessibilityLayer: true` in `lib/chart/CartesianChart.js`; [3.0.0 release notes](https://newreleases.io/project/npm/recharts/release/3.0.0)). The surface gets `tabIndex=0` and `role="application"` (`lib/container/RootSurface.js`). `lib/state/keyboardEventsMiddleware.js` handles only ArrowLeft, ArrowRight and Enter: arrows move the active tooltip index and Enter toggles the tooltip. Enter does not fire `onClick`, so keyboard drill-down needs our own key handler reading the active index. The maintainers chose one tab stop over a tab stop per point ([discussion #4484](https://github.com/recharts/recharts/discussions/4484)), and VoiceOver's QuickNav can fight the arrow keys ([discussion #4662](https://github.com/recharts/recharts/discussions/4662)). A table fallback is still on us.
- Theming: shadcn's chart component is built on Recharts v3 and themes with `var(--chart-1)` in `:root` and `.dark`, passed as `fill="var(--color-KEY)"` ([shadcn chart docs](https://ui.shadcn.com/docs/components/chart)). That pattern passes our lint, and the variables flip with the `.dark` class with no redraw.
- React 19: the peer range includes `^19.0.0` (`npm view recharts peerDependencies`); it also needs `react-is` as a peer.
- Drill: `onClick` on `Bar` and `Line` dots gets the data entry, so a pointer tap can navigate. Keyboard drill is the gap above.

### Chart.js (with react-chartjs-2)

- Size: 57 KB gz tree-shaken.
- Accessibility: canvas. The [Chart.js accessibility page](https://www.chartjs.org/docs/latest/general/accessibility.html) says canvas content is not exposed to screen readers; you add `role`, `aria-label` and fallback content inside the `<canvas>` yourself. It does not cover keyboard support, and there is none.
- Theming: canvas cannot read CSS classes. Colors come from `getComputedStyle`, and the chart must redraw when next-themes toggles `.dark`.
- React 19: `react-chartjs-2` 5.3.1 peers `^19.0.0`.
- Drill: `getElementAtEvent` maps a click to a data index. Pointer only.

### uPlot

- Size: 23 KB gz, plus its stylesheet.
- It is a "Canvas 2D-based chart for plotting time series", with bars as a path renderer ([README](https://github.com/leeoniya/uPlot)). Its strength is huge time series, which Reports does not have.
- No official React wrapper (only a third-party one), no accessibility section in the README, and the same canvas theming and redraw problem as Chart.js. Last release 1.6.32 on 2025-03-14.

### visx

- Size: 16 KB gz without axes, 23 KB with `@visx/axis`.
- Low-level React SVG primitives over d3 (`Bar`, `LinePath`, scales, `Group`, axes). Keyboard and screen-reader support are whatever we render, as with hand-written SVG, but we keep its scales and axis tick logic.
- Theming: SVG elements take `className`, so `fill-primary` and the other token classes work and flip with `.dark` for free.
- React 19: 4.0.0 (2026-06-11) adds React 19 to every package's peers and requires React 18 or 19 ([visx releases](https://github.com/airbnb/visx/releases)).
- Drill: `onClick` on any shape, or wrap a shape in a link.

### ECharts

- 185 KB gz even when tree-shaken to two chart types with the SVG renderer. Ruled out on size.

### Hand-written SVG

- Size: zero library code. Reports needs a band scale for months and categories and a linear scale for amounts, a few lines each; `d3-scale` is the drop-in if that gets fiddly.
- Accessibility: every bar or point can be a real `<Link>` to the filtered transactions, so Tab reaches it, Enter opens it, and its accessible name carries the category, month and spoken amount (`spokenMoney()`, per `DESIGN.md` Money). Spending by category as an HTML list of bars is its own table fallback; months compared and the trend get a table view with the same links.
- Theming: token classes (`fill-primary`, `stroke-border`, `text-muted-foreground`) on SVG and HTML elements, flipping with `.dark` and checked by the existing lint.
- React 19: nothing to support.
- Drill: a link per mark. Offline and two-device behaviour come from the local projections the route reads, not from the chart.
- Cost: we write axis labels, gridlines, the responsive width (a container query or a `ResizeObserver`) and any hover detail ourselves, and own their tests.

## What I did not verify

- Sizes inside this repo's real Vite build. These are esbuild measurements of library code; Vite's Rollup output and shared chunks (for example `clsx`, already in the app) would shift them by a few KB.
- How much the precache grows, or its current total.
- Recharts' screen-reader output in a real VoiceOver or TalkBack session; the claims above come from its source and its maintainers' discussions.
- visx 4 inside this repo's TS 7 and lint setup.

## Decisions needed

- **Chart approach.** Recommended default: hand-written SVG and HTML bars, no chart dependency. Alternative: visx if the build finds axes and scales too much to write.
- **Chart color roles.** `DESIGN.md` forbids inventing chart colors. Recommended default: settle chart roles (or reuse `primary` for the current month and a muted role for the rest) in `src/index.css` with dark values and a contrast-test pair, before the Reports UI ticket.
- **Table fallback.** Recommended default: the category view is itself an HTML list (no separate table); months compared and the trend get a "Show as table" toggle with the same drill links.
