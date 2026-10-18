# Design foundations

Status: grilling done 2026-10-18, ready to implement (start at the Rollout checklist). Spec: #162. ADR 0011 is written; the rollout's step 5 only links it from DESIGN.md. Covers visual identity, design tokens, DESIGN.md and its enforcement. Component patterns, adaptive layouts and migration are later sessions. Event sourcing and sync are untouched.

## Context

- The app looks like stock shadcn (`new-york`, `neutral` base color, near-black primary, system font).
- Colors are already mostly semantic: 519 token uses vs 20 raw palette uses in 6 files (amber, green), plus `text-white` ×4 and `bg-black/50` ×4 overlays.
- `--income`, `--expense` and `--warning` exist (review R40); `text-expense` is unused. Negative and overspent amounts use `text-destructive`, the same red as delete actions.
- No type tokens; sizes are mostly `text-sm`.
- 61 files outside `src/components/ui` import shadcn primitives directly.
- Conflicting guidance: `.claude/agents/household-ui-designer.md` prescribes raw `green-600`/`red-600` and `font-mono` amounts; `src/components/ui/README.md` describes removed components.
- No styling lint rules; pre-push runs eslint with `--max-warnings=0`.

## Decisions & Deferrals

- **Personality: calm and trustworthy.** Muted neutrals, one restrained accent, color saved for meaning. Why: it holds the household's money. Revisit: never.
- **Identity covers color, type, shape, density and motion only.** Logo, app icon and illustration are parked. Revisit: a brand pass.
- **Light and dark are both first-class**, system default plus manual override. Revisit: never.
- **Devices: phone is the everyday device; the laptop is used 1-2 times a week** for real work, not only review. Revisit: never.
- **DESIGN.md is a rulebook for agents** at the repo root: short, imperative, one "why" line per section, each lint-enforced rule names its rule, under ~300 lines, linked from CLAUDE.md. Why: agents must read all of it. Revisit: never.
- **Sources distilled into rules, not linked:** Refactoring UI, Vercel Web Interface Guidelines, Material 3 adaptive guidance only (not M3's visual language). Revisit: never.
- **Semantic-only color.** The default Tailwind palette, `white` and `black` are removed from the theme; only role tokens exist. Spacing stays on Tailwind's numeric scale. Revisit: never.
- **"Short money" is its own role** (working name `shortfall`: overspent, negative balance, over budget), separate from `destructive` (delete/remove actions). Revisit: never.
- **Two-layer library, enforced as a ratchet now.** `src/components/ui/*` becomes importable only from the app-component layer; today's 61 importers sit on a shrink-only allowlist in `eslint.config.js`. Layer 2's contents are parked for the component-patterns session. Revisit: allowlist reaches zero in migration.
- **DESIGN.md is the single source of truth.** `household-ui-designer.md` is rewritten to defer to it, `src/components/ui/README.md` is deleted, and the R40 comment in `index.css` folds into DESIGN.md. Revisit: never.
- **Type is named roles.** Tailwind's `text-xs…9xl` scale is reset; about 6 roles bundle size, line-height and weight, plus an amount treatment (tabular figures). Revisit: never.
- **Token names follow shadcn** (`background`, `primary`, `muted`, `accent`…) plus our roles (`income`, `shortfall`, `warning`, `warning-surface`, `success`, `scrim`), with shadcn's `-foreground` suffix for text on a filled role (`destructive-foreground`). Why: primitives are private, and `npx shadcn add` drops in without translation. DESIGN.md flags that shadcn's `accent` is a hover background; the brand accent is `primary`. Revisit: never.
- **Class lint:** `eslint-plugin-better-tailwindcss` (needs Tailwind ≥4.1.17) flags unknown classes and bans arbitrary color, font-size, radius and shadow values; arbitrary sizing and `calc()` stay allowed. `no-restricted-syntax` bans color literals and `style={{ color }}` in TSX. Why: with the palette reset, a removed class otherwise renders nothing, silently. Fallback: a custom class check against the theme. Revisit: if the plugin can't read the theme.
- **No `expense` color token.** Expenses and transfers render neutral; money roles are `income` and `shortfall`. Why: color marks exceptions, and most rows are expenses. Revisit: never.
- **`shortfall` and `destructive` share a red hue** as separate tokens. Why: context (amount text vs action) already separates them. Revisit: if the specimen shows them confused.
- **Token values live only in `src/index.css`.** DESIGN.md names roles and when to use them, never values. Revisit: never.
- **ADR 0011** records semantic-only tokens and private primitives when the session closes.
- **Direction: Ink and paper** (decided 2026-10-18 from the specimen): warm paper neutrals (hue 80), deep ink-blue `primary` (hue 262). Why: it is the only tested accent clearly apart from `income` green (ΔE 21 light, 19 dark); Forest's green accent read as income (ΔE 5-8.5) and teal was borderline. Token values for both themes are in the specimen summary (vault note "Visual identity specimen") and go into `src/index.css`. Revisit: never.
- **Font: Source Sans 3**, variable wght 200-900, self-hosted as a Latin + U+20B1 woff2 subset (25.4 KB), from google/fonts `ofl/sourcesans3`, OFL-1.1. Its digits are always tabular (no proportional figures). Why: smallest of the fonts that passed the ₱ and tabular checks, humanist. Revisit: if proportional figures are needed in running text (fallback: Noto Sans, 37.1 KB).
- **Radius base 6px**: `--radius-sm` = base − 3px, `--radius-lg` = base + 4px for cards, dialogs and popovers; nested corners are concentric (inner = outer − inset). Why: the user preferred 6px over the recommended 10px. Revisit: never.
- **Elevation: tone plus hairline borders.** Surfaces step in tone and carry a 1px inset border in the semi-transparent `--border` token; no shadows. Why: tone alone barely separates surfaces in light mode, and shadows mostly disappear in dark mode. Revisit: never.
- **Specimen confirmed `shortfall` and `destructive` as one red in two tokens**: amount text with a minus sign and a filled button didn't read as confusable side by side. Dark `destructive` is lighter (`oklch(0.68 0.18 27)`) with a dark label so error text passes on cards.
- **Contrast fixes from the specimen:** `input` lightness 0.78 → 0.65 (light) and 0.40 → 0.52 (dark) so field outlines reach 3:1; dark `destructive` raised as above. All 26 checked pairs pass WCAG AA in both themes.
- **Open: dark-mode APCA.** Pairs pass WCAG but sit under Lc 60 in dark: `muted-foreground` on surfaces (about 48), `shortfall` on surfaces (about 50), `destructive` on card (43), and the dark button labels (46-57). Revisit: when the tokens land in `src/index.css`.
- **One density token set for both devices.** Laptop and phone get different layouts, but the laptop doesn't need tighter controls; the `pointer: coarse` 44px touch-target rule stays. Revisit: in the adaptive-layout session if laptop screens feel sparse.
- **Spacing is held to a step set by lint, not by reset**: 0, 0.5, 1, 2, 3, 4, 6, 8, 12, 16 on padding, margin, gap, space and inset, in app code and layer 2; `ui/` is exempt. Sizing keeps the full scale. Why: v4 spacing also drives sizing, so a reset breaks `h-9`, `size-4.5` and the primitives. The 9 app-code files off the set are fixed in step 3. Verify in step 1 that the plugin's restricted-classes option can target utility prefixes; fallback is a `no-restricted-syntax` regex on class strings (weaker inside `cn()`). Revisit: if the plugin option can't scope by prefix.
- **Spacing restriction uses the plugin, not the fallback** (verified in #163, 2026-10-18): `better-tailwindcss/no-restricted-classes` matches each class (variants included) against a regex, so a pattern anchored on the utility prefix (`(?:^|:)-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|…)-<off-set step>`) flags `md:px-7` and `-mt-5` inside `cn()` and conditionals while leaving sizing (`h-5`, `size-4.5`) alone; scoping to app code and layer 2 is an ESLint `files`/`ignores` block with `src/components/ui/**` ignored. The `no-restricted-syntax` regex fallback is not needed. Revisit: if a plugin upgrade changes the option.
- **ADR 0011 written** (`docs/adr/0011-semantic-tokens-and-private-primitives.md`), 2026-10-18.
- **Token values sit in the appendix below until they land in `src/index.css`**, then the appendix is deleted. Why: the implementing session must not depend on the Obsidian vault. Revisit: when step 2 of the rollout merges.
- **Form controls get a `text-input` role at 16/24** (input, textarea, select trigger, currency input); body stays 15/22. Why: iOS Safari zooms on focus below 16px. Revisit: never.
- **Shadows: one `shadow-float` (two-layer) for non-modal floating layers only** (popover, dropdown, toast). The rest of the shadow scale is reset. Modals (dialog, sheet) rely on `scrim`. Why: a dropdown over a dark card is only 0.035 lightness apart. Revisit: never.
- **Font weights limited to the role weights:** `font-normal` 400, `font-medium` 550, `font-semibold` 600, `font-bold` 650; others reset. Revisit: never.
- **The hero-number role is `figure`** (34/40 600), not `amount`: inline amounts take the surrounding role. `tabular-nums` stays on amounts for the system-font fallback. Why: "amount" is in every row; the name would invite 34px row amounts. Revisit: never.
- **The form-control type role is `text-control`** (16/24), not `text-input`: Tailwind resolves `text-input` to the `--color-input` border color, so the role class never applied. Why: `input` stays a shadcn color name. Revisit: never.
- **Font subset range** is Google Fonts' Latin range minus the combining marks (U+0304, U+0308, U+0329), plus U+20B1 and arrows U+2190-2193: 25.5 KB. Why: the combining marks alone added ~3 KB of mark positioning; text with them falls back to the system font. Revisit: if names with combining marks render mixed.
- **Contrast: WCAG 2 AA is the hard gate.** APCA Lc ≥ 60 is a target for `muted-foreground` and `shortfall` only; their dark values get nudged lighter when the tokens land. Button labels and `destructive` stay WCAG-only. Revisit: never.
- **Token housekeeping:** `chart-1..5` deleted (charts get tokens in their own session); `sidebar-*` kept but aliased to base tokens; `ThemeColorSync` reads the computed `--background` instead of hex literals. Revisit: a charts session.
- **Motion:** `--duration-quick` ~150ms (hover, press, fade) and `--duration-move` ~250ms (sheets, dialogs entering), one ease-out curve, transform and opacity only, no `transition-all` (lint-enforced), interruptible; reduced motion turns movement into fades. Revisit: never.
- **DESIGN.md outline:** 1 how to use this doc; 2 principles; 3 color roles; 4 money; 5 type roles; 6 spacing and density; 7 shape and elevation; 8 motion; 9 interaction and accessibility; 10 writing in the UI (glossary terms, never their _Avoid_ words, sentence case); 11 components (two layers, import boundary, `shadcn add` lands in layer 1, patterns TBD); 12 layout (`PageShell`, container queries, adaptive TBD); 13 enforcement table. Revisit: never.
- **Discovery:** CLAUDE.md gets a Code conventions line ("Any UI change follows `DESIGN.md`; read it in full first") and a Load-on-demand row; not added to SessionStart. Why: lint catches tokens, the line catches judgment; SessionStart would load it into non-UI sessions. Revisit: if UI work keeps skipping it.
- **Rollout: one PR, five steps.** (1) Tailwind ≥4.1.17 and the lint plugin, rules in report mode; (2) `index.css` rewrite: tokens, palette/type/shadow/weight resets, Source Sans 3 self-hosted (already precached by the `woff2` glob in `vite.config.ts`); (3) mechanical codemod: 224 `text-*` sizes to roles, 28 raw colors to roles, weights and shadows mapped, `text-destructive` on money to `shortfall`; (4) rules to error, plus the `ui/` import ratchet with 61 allowlisted files; (5) DESIGN.md, CLAUDE.md, designer-agent rewrite, stale README deleted, ADR 0011. Layout-baseline e2e snapshots get regenerated in that PR. Page redesign stays in the migration session. Why: the resets would silently un-style 224 places without step 3. Revisit: never.
- **Role mapping (#168):** page titles (shell header h1) take `title`; dialog, sheet, drawer and card titles and section headings take `heading`; buttons, nav items and links take `body` plus `font-medium`; form labels and legends take `label`; `text-xs` takes `caption`, or `label` where it carried `font-medium`; the tab bar's 11px labels take `caption`. Nothing uses `figure` yet: no screen shows a hero number today. Why: dialogs at 22px crowd phone sheets, and 13px buttons read too small. Revisit: the component-patterns session.
- **`cn` knows the type roles** (#168): `tailwind-merge` is extended with the role names as font sizes. Why: unextended, it reads `text-body` as a color and drops `text-muted-foreground` beside it. Revisit: when roles change.
- **#164 contrast scope:** `input` must reach 3:1 on `muted` and `popover` as well as background and card (fields sit in popovers and muted panels), so both themes' `input` darkened/lightened slightly; dark `shortfall` chroma dropped to 0.12 because the specimen value was outside sRGB and lightening it at 0.16 clipped. Revisit: never.
- **#164 radius:** `rounded-md` is the 6px base, `rounded-sm` 3px, `rounded-lg` and `rounded-xl` both 10px (xl kept as an alias so today's cards keep the large step); bare `rounded` stays Tailwind's 4px until #170 resets it. Revisit: #170.
- **#164 motion:** durations are Tailwind's `--transition-duration-*` namespace (`duration-quick`, `duration-move`); the curve redefines `ease-out`. The default transition duration and timing function are unchanged; moving primitives onto them is #169. Revisit: #169.
- **#167 shortfall scope:** the non-blocking "This leaves X at -₱…" notes (Move money, Pay card, Distribute) and `NegativeNote` use `shortfall`, since they describe money going short; validation errors (e.g. a retired funding account) and the sync "attention" state stay `destructive`. Revisit: never.
- **#167 warning style:** inline warnings are `text-warning`; a boxed warning (import duplicate flags) is `border-warning/50 bg-warning-surface`. Status badges (`Already imported`, `destructive` variant) were left as they are. Revisit: #171 when DESIGN.md writes the pattern down.
- **#167 negative balances:** a negative bank, cash or e-wallet balance on Accounts and Home's Balances uses `shortfall` (spec #162 story 4). Credit cards stay uncolored: their figure is the amount owed ("Owed ₱X"), and a negative one is a credit, not money short. Revisit: never.
- **#167 splash and manifest:** theme-color metas, the manifest `theme_color`/`background_color` and the iOS splash set (regenerated) use the token backgrounds `#f9f6f2` / `#161311`. Revisit: if `--background` changes.
- **The app-component layer lives in `src/components/app/`** (#166), held open by a `.gitkeep` until the component-patterns session fills it. The boundary is `arch/no-direct-primitive-import` (its own rule ID so it stacks with the existing `no-restricted-imports` blocks) over all of `src/**` except `ui/`, `app/` and tests; its allowlist is `directPrimitiveImporters` in `eslint.config.js` (61 files, including `src/App.tsx`). Why: "app" matches ADR 0011's "app-component layer" and sits beside `ui/`. Revisit: the component-patterns session.

- **Theme-color meta carries the computed `oklch(...)` value** (#163), not hex. Why: it reads the token directly; Chromium accepts it. Revisit: #172, if a phone's status bar ignores it (then convert to hex at runtime).
- **Color-literal ban covers TSX only** (#163), as the spec says. Why: `.ts` holds data-layer code with no styling. Revisit: if a color literal shows up in a `.ts` file.
- **`success-foreground` added** (#164) beyond the spec's role list, for the filled success badge's label. Revisit: never.
- **#169 spacing lint counts `top/right/bottom/left/start/end` as inset**, and `p-px` as off-set. Why: `inset-*` is their shorthand, so leaving them free would let `top-1.5` bypass the set. Revisit: if a layout needs an off-set offset (use calc()).
- **#169 arbitrary spacing:** plain lengths (`p-[3px]`, `mt-[0.4rem]`) fail in app code; `calc()` and `var()` (safe areas, chrome heights) pass. Why: a literal is just an off-set step in disguise. Revisit: never.
- **#169 spacing fixes rounded to context, not always down:** 1.5 → 2 for rows, stacks and gaps, 2.5 → 3 on 44px nav rows, `px-1.5` → `px-1` on the review count pill, `pl-5` → `pl-6` for reply lists, `space-y-5` → `space-y-6`. Revisit: never.
- **#169 motion defaults:** Tailwind's default transition duration and curve now read `--transition-duration-quick` and `ease-out`, so a bare `transition-colors` is quick. Movement names `duration-move`; dialogs and sheets enter on `duration-move` and leave on `duration-quick`. tw-animate's 150ms default already matches quick, so overlays were left as they are. Revisit: never.
- **#169 shadows:** `shadow-float` on popover, select, toast (sonner's own shadow is unlayered, so `shadow-float!`), the floating FAB, the install prompt, the storage warning, the sticky selection bar and the skip link; inputs, buttons, cards, tabs, dialogs and sheets lost theirs. The sidebar's broken `hsl()` outline shadows became `inset-ring` in the sidebar tokens. The arbitrary-shadow lint ban stays with #170. Revisit: never.
- **#169 `cn` knows `shadow-float` and `duration-quick/move`** (tailwind-merge theme and class group), so `shadow-none` overrides `shadow-float` and a later duration replaces an earlier one. Revisit: when a token is added to those scales.
- **#170 radius scale is sm/md/lg only:** bare `rounded`, `rounded-xs`, `rounded-xl` and up are reset; the three `rounded-xl` uses (card, sidebar inset, ReviewBanner) moved to `rounded-lg` (same 10px), ErrorBoundary's bare `rounded` to `rounded-md`, and the checkbox and tooltip-arrow arbitrary radii to `rounded-sm`. `rounded-[inherit]` (scroll-area viewport) stays allowed. Why: one class per step. Revisit: if a fourth step is needed.
- **#170 shadow reset covers every shadow namespace:** `shadow-*`, `inset-shadow-*`, `drop-shadow-*`, `text-shadow-*` and the bare `shadow`/`drop-shadow`; `shadow-none` and `shadow-float` remain. Revisit: never.
- **#170 `no-unknown-classes` is on for all of `src/**/*.{ts,tsx}` with no allowlist.** The one non-Tailwind class found (`toaster` on sonner's Toaster, no CSS targets it) was dropped instead. Proof nothing lost styling: Tailwind's scanner candidates compiled before and after the reset; every lost class lives in docs, READMEs, comments or tests, none in source. Revisit: when a real non-Tailwind class is needed (add it to `ignore` with a reason).
- **#170 `cn` mirrors the reset theme** with a tailwind-merge `override` of `text`, `font-weight`, `radius` and `shadow`, replacing #168's font-size class-group extension. Revisit: when a token is added to those scales.

### Rollout checklist

Ticketed 2026-10-18 as sub-issues of #162, expand → migrate → contract. Each lint rule switches on at error in the ticket that clears its last violation (pre-push has no report mode). Frontier at start: #163, #164, #165, #166.

- [x] #163 Class lint plugin, with color literals banned (blocked by: none)
- [x] #164 Ink and paper color tokens, with a contrast test (none)
- [x] #165 Type roles and Source Sans 3 (none)
- [x] #166 Primitives private: import boundary (none)
- [x] #167 Money and status colors onto roles (#164)
- [x] #168 Text sizes and weights onto roles (#165)
- [x] #169 Shadows, motion and spacing onto the system (#163, #164)
- [ ] #170 Remove Tailwind's defaults (#163, #167, #168, #169)
- [ ] #171 DESIGN.md and agent guidance (#166, #170)
- [ ] #172 Integrate and verify design foundations (#170, #171)
- **Deferred: adaptive layout** (more columns on the laptop, M3 window size classes). Revisit: the adaptive-layout session.
- **Parked:** component patterns, adaptive layouts (M3 window size classes), migration of existing pages.

## Appendix: specimen token values (delete once in `src/index.css`)

From the specimen, 2026-10-18. Additions decided after it are not yet valued: `text-input` (16/24).

Color, radius, shadow and motion landed in `src/index.css` in #164 (2026-10-18); the values below are the final ones, and `src/theme-contrast.test.ts` checks them. Changed from the specimen: light `input` 0.65 → 0.62 and dark `input` 0.52 → 0.55 (3:1 on `muted` and `popover` too, not only background and card); dark `muted-foreground` 0.7 → 0.78 and dark `shortfall` `0.72 0.16 25` → `0.79 0.12 25` (APCA Lc 60 on background, card and muted; chroma lowered to stay inside sRGB); `success-foreground` added for filled success badges. Motion: `duration-quick` 150ms, `duration-move` 250ms, `ease-out` `cubic-bezier(0.2, 0, 0, 1)`. `shadow-float` reads `--elevation-float`, set per theme below.

Type roles (size/line-height, weight): display 30/36 650, title 22/28 600, heading 17/24 600, body 15/22 400, label 13/18 550, caption 12/16 400, figure 34/40 600 tabular.

Font: Source Sans 3, Google Fonts (google/fonts `ofl/sourcesans3`, OFL-1.1). Latin + U+20B1 woff2 subset, 25.4 KB, features kern liga calt tnum lnum pnum case ccmp locl mark mkmk. Fallback `system-ui, sans-serif`.

Radius: `--radius: 6px`; `--radius-sm` = radius − 3px; `--radius-lg` = radius + 4px.

```css
/* light */
--background: oklch(0.975 0.007 80);
--foreground: oklch(0.23 0.018 262);
--card: oklch(0.99 0.004 80);
--card-foreground: oklch(0.23 0.018 262);
--popover: oklch(0.997 0.002 80);
--popover-foreground: oklch(0.23 0.018 262);
--primary: oklch(0.42 0.12 262);
--primary-foreground: oklch(0.985 0.005 80);
--secondary: oklch(0.935 0.01 80);
--secondary-foreground: oklch(0.25 0.018 262);
--muted: oklch(0.945 0.009 80);
--muted-foreground: oklch(0.5 0.018 70);
--accent: oklch(0.93 0.012 80);
--accent-foreground: oklch(0.23 0.018 262);
--destructive: oklch(0.52 0.18 27);
--destructive-foreground: oklch(0.985 0.005 80);
--border: oklch(0.3 0.03 70 / 0.14);
--input: oklch(0.62 0.012 75);
--ring: oklch(0.52 0.13 262);
--income: oklch(0.5 0.12 150);
--shortfall: oklch(0.52 0.18 27);
--warning: oklch(0.52 0.11 70);
--warning-surface: oklch(0.955 0.04 85);
--success: oklch(0.5 0.12 150);
--success-foreground: oklch(0.985 0.005 80);
--scrim: oklch(0.2 0.02 262 / 0.42);
--elevation-float: 0 1px 2px oklch(0.2 0.02 262 / 0.06), 0 6px 16px -2px oklch(0.2 0.02 262 / 0.12);

/* dark */
--background: oklch(0.19 0.006 70);
--foreground: oklch(0.93 0.01 85);
--card: oklch(0.225 0.007 70);
--card-foreground: oklch(0.93 0.01 85);
--popover: oklch(0.26 0.008 70);
--popover-foreground: oklch(0.93 0.01 85);
--primary: oklch(0.74 0.1 262);
--primary-foreground: oklch(0.19 0.03 262);
--secondary: oklch(0.29 0.008 70);
--secondary-foreground: oklch(0.93 0.01 85);
--muted: oklch(0.26 0.007 70);
--muted-foreground: oklch(0.78 0.012 80);
--accent: oklch(0.29 0.008 70);
--accent-foreground: oklch(0.93 0.01 85);
--destructive: oklch(0.68 0.18 27);
--destructive-foreground: oklch(0.18 0.02 25);
--border: oklch(0.95 0.01 85 / 0.1);
--input: oklch(0.55 0.008 75);
--ring: oklch(0.7 0.1 262);
--income: oklch(0.78 0.13 152);
--shortfall: oklch(0.79 0.12 25);
--warning: oklch(0.82 0.13 80);
--warning-surface: oklch(0.27 0.035 75);
--success: oklch(0.78 0.13 152);
--success-foreground: oklch(0.19 0.03 150);
--scrim: oklch(0.05 0 0 / 0.62);
--elevation-float: 0 1px 2px oklch(0 0 0 / 0.3), 0 8px 24px -4px oklch(0 0 0 / 0.45);
```
