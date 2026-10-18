# Design foundations

Status: grilling in progress, started 2026-10-18. Covers visual identity, design tokens, DESIGN.md and its enforcement. Component patterns, adaptive layouts and migration are later sessions. Event sourcing and sync are untouched.

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
- **Token names follow shadcn** (`background`, `primary`, `muted`, `accent`…) plus our roles (`income`, `shortfall`, `warning`, `success`, `scrim`, `on-*`). Why: primitives are private, and `npx shadcn add` drops in without translation. DESIGN.md flags that shadcn's `accent` is a hover background; the brand accent is `primary`. Revisit: never.
- **Class lint:** `eslint-plugin-better-tailwindcss` (needs Tailwind ≥4.1.17) flags unknown classes and bans arbitrary color, font-size, radius and shadow values; arbitrary sizing and `calc()` stay allowed. `no-restricted-syntax` bans color literals and `style={{ color }}` in TSX. Why: with the palette reset, a removed class otherwise renders nothing, silently. Fallback: a custom class check against the theme. Revisit: if the plugin can't read the theme.
- **No `expense` color token.** Expenses and transfers render neutral; money roles are `income` and `shortfall`. Why: color marks exceptions, and most rows are expenses. Revisit: never.
- **`shortfall` and `destructive` share a red hue** as separate tokens. Why: context (amount text vs action) already separates them. Revisit: if the specimen shows them confused.
- **Token values live only in `src/index.css`.** DESIGN.md names roles and when to use them, never values. Revisit: never.
- **ADR 0011** records semantic-only tokens and private primitives when the session closes.
- **Pending the prototype session:** accent hue, neutral temperature, font (self-hosted variable sans, precached, tabular figures, has `₱`), radius, elevation approach. The user brings the chosen values back here.
- **Pending:** density. The user rejected one density for both devices (2026-10-18); detail to settle.
- **Deferred: adaptive layout** (more columns on the laptop, M3 window size classes). Revisit: the adaptive-layout session.
- **Parked:** component patterns, adaptive layouts (M3 window size classes), migration of existing pages.
