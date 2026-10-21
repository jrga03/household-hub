# DESIGN.md

The rulebook for every screen in Household Hub. The identity is "Ink and paper": warm paper neutrals, a deep ink-blue primary, Source Sans 3, small radii, and surfaces separated by tone and hairline borders. Light and dark are equal.

## How to use this doc

Why: lint checks the tokens, but only this doc covers the judgment calls.

- Read it in full before any UI change: classes, components, layout or copy.
- It names roles and when to use them. Values live only in `src/index.css`. Read them there; never copy one into code or docs.
- A rule marked _(lint)_ fails `npm run lint`. The [enforcement table](#enforcement) names each rule. Everything else is yours to get right.
- When a purpose has no role, stop and add a role token in `src/index.css` plus a line here (`docs/adr/0011-semantic-tokens-and-private-primitives.md`). A new type, weight, radius, shadow or duration role also goes in the `cn` tailwind-merge config in `src/lib/utils.ts`, or `cn` drops it when merging. Never reach around the theme.

## Principles

Why: the app holds a household's money, so it must feel calm and trustworthy.

- Color carries meaning. Most of the screen is neutral; color marks income, money that is short, warnings, status and the primary action.
- Hierarchy comes from size, weight and space before color.
- One restrained accent: `primary`. Use it for the main action and the selected state, once or twice per screen.
- Phone first. The phone is the everyday device; the laptop is used once or twice a week for real work. Both get the same density.
- Speed is part of the design. Reads are local, so screens render at once; never add motion or spinners that make a person wait.

## Color roles

Why: role names keep both themes legible and keep meaning consistent across screens.

Use only these roles _(lint: unknown classes, arbitrary colors, color literals, inline color styles)_. Each works with any color utility (`text-`, `bg-`, `border-`, `ring-`, `fill-`…) and opacity modifiers (`bg-primary/90`).

| Role                                     | Use it for                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `background` / `foreground`              | The page and its normal text.                                                                 |
| `card` / `card-foreground`               | Cards, the sidebar, grouped panels.                                                           |
| `popover` / `popover-foreground`         | Popovers, menus, selects, toasts.                                                             |
| `primary` / `primary-foreground`         | The brand accent: the main action, selected and active states, links.                         |
| `secondary` / `secondary-foreground`     | Quiet filled controls and badges.                                                             |
| `muted` / `muted-foreground`             | Recessed panels; secondary text such as dates, category and account names under a row.        |
| `accent` / `accent-foreground`           | Hover and pressed backgrounds, and the selected row.                                          |
| `destructive` / `destructive-foreground` | Actions that delete or remove, and errors that block a submit.                                |
| `border`                                 | Hairline borders between surfaces (the default border color).                                 |
| `input`                                  | Form field outlines.                                                                          |
| `ring`                                   | Focus rings.                                                                                  |
| `income`                                 | Money coming in.                                                                              |
| `shortfall`                              | Money that is short. See [Money](#money).                                                     |
| `warning` / `warning-surface`            | Something needs attention but nothing is broken.                                              |
| `success` / `success-foreground`         | A finished or confirmed state, as a badge.                                                    |
| `scrim`                                  | The dimmed layer behind a dialog or sheet. It carries its own alpha; add no opacity modifier. |

- `accent` is shadcn's hover background, not a brand accent. The brand accent is `primary`.
- Text on a filled role uses that role's `-foreground` pair (`bg-destructive text-destructive-foreground`).
- `destructive` is for actions and blocking errors only. A status (a flag, a badge, a sync state) is never `destructive`: use `warning` for something to check, `success` for done, `secondary` or `outline` for neutral.
- Inline warning text is `text-warning`. A boxed warning is `border-warning/50 bg-warning-surface` with normal text inside.
- The `sidebar-*` colors alias the base roles. They exist for the shadcn sidebar; use the base roles in new code.
- Charts have no color roles yet. They get their own session; do not invent chart colors.
- Contrast is a test, not a guess. `src/theme-contrast.test.ts` holds every declared text-on-surface pair to WCAG 2 AA in both themes, and `muted-foreground` and `shortfall` to APCA Lc 60. When you put a role on a surface it has not been paired with, add the pair to that test.

## Money

Why: every amount follows one convention, so a person reads money the same way on every screen.

- Format with `formatPHP` (`src/lib/currency.ts`): peso sign, thousands separators, two decimals. Never format cents by hand.
- `income` marks money coming in, with a `+` sign.
- Expenses and transfers stay neutral: no money color. An expense takes the surrounding text color with a `−` sign (U+2212). A transfer is neither in nor out, so it carries no sign and may be muted, with its transfer icon.
- `shortfall` marks money that is short: an overspent category, a negative bank, cash or e-wallet balance, over budget, a "This leaves X at −₱…" note. Use `MoneyAmount` (`src/components/allocations/MoneyAmount.tsx`), which colors a negative amount.
- A credit card's figure is the amount owed. Leave it uncolored, even when negative (that is a credit, not money short).
- `shortfall` and `destructive` share a red hue but are separate tokens; their dark values differ so each keeps its contrast. An amount is never `destructive`; an action is never `shortfall`.
- Never color alone. A short amount always shows its minus sign; income shows its `+`; a pending transaction is muted and keeps its Info icon. Icon-only signals need an `aria-label`.
- Use the money roles, never a raw hue, for money intent. The theme has no palette to reach for _(lint: unknown classes)_.
- Amounts take the surrounding type role. Use `text-figure` only for the one hero number on a screen (an account balance, a month total).
- Keep `tabular-nums` on amounts. Source Sans 3's digits are already tabular; the class covers the system-font fallback. Right-align amounts in a column.

## Type roles

Why: one class sets size, line height and weight together, so text has a fixed hierarchy.

Use a role for every text size _(lint: unknown classes, arbitrary font sizes)_. The old `text-xs`…`text-9xl` scale is gone.

| Role           | Use it for                                                              |
| -------------- | ----------------------------------------------------------------------- |
| `text-display` | Rare hero headings.                                                     |
| `text-title`   | The page title (the shell header `h1`).                                 |
| `text-heading` | Dialog, sheet, drawer and card titles; section headings.                |
| `text-body`    | Running text, rows, buttons, nav items and links (the body default).    |
| `text-label`   | Form labels, legends, small UI labels, badges.                          |
| `text-caption` | Meta text: timestamps, hints, the tab bar's labels.                     |
| `text-figure`  | The hero number on a screen. Never in rows.                             |
| `text-control` | Inputs, textareas, select triggers. It keeps iOS from zooming on focus. |

- Weights are `font-normal`, `font-medium`, `font-semibold` and `font-bold` only _(lint: unknown classes)_. A role already carries its weight; add `font-*` only to change it.
- Buttons, nav items and links are `text-body font-medium`.
- Write sentence case everywhere: titles, buttons, labels, menu items.
- Merge classes with `cn` (`src/lib/utils.ts`). It knows the roles; plain string concatenation can leave two conflicting sizes.

## Spacing and density

Why: a short step set gives every page the same rhythm.

- Padding, margin, gap, space and inset (`top`, `left` and the rest included) use the steps 0, 0.5, 1, 2, 3, 4, 6, 8, 12 and 16 in app code _(lint: restricted classes)_. Round to the nearest step that fits the context.
- Arbitrary spacing lengths (`p-[3px]`) fail. `calc()` and `var()` pass, for safe areas and chrome heights (`pb-[calc(1rem+var(--safe-area-bottom))]`).
- Sizing (`h-*`, `w-*`, `size-*`, `max-w-*`) keeps the full numeric scale.
- Primitives in `src/components/ui` are exempt, so shadcn code stays as shipped.
- One density for phone and laptop. On touch devices, `src/index.css` lifts buttons, selects, tabs and menu rows to a touch-target floor; keep interactive elements on those primitives so they inherit it.
- Group related things with less space and separate groups with more. Prefer space over a divider.

## Shape and elevation

Why: tone and hairlines separate surfaces in both themes, where shadows fade in dark mode.

- Radius is `rounded-sm`, `rounded-md` (the base) or `rounded-lg` (cards, dialogs, popovers), plus `rounded-full` and `rounded-none` _(lint: unknown classes, arbitrary radii)_. `rounded-[inherit]` is allowed for a child that must follow its parent.
- Nested corners are concentric: an inner element takes a smaller step than its container.
- Separate surfaces by stepping tone (`background` → `card` → `popover`, or `muted` for recessed) and a hairline `border`.
- `shadow-float` is the only shadow _(lint: unknown classes, arbitrary shadows)_. Use it on non-modal floating layers: popovers, dropdowns, selects, toasts, the floating action button, a sticky bar over content. Modal layers (dialog, sheet) use `scrim` and no shadow. `shadow-none` removes a primitive's shadow.

## Motion

Why: motion should explain a change, never make a person wait.

- Two durations: `duration-quick` for hover, press and fades; `duration-move` for a sheet or dialog entering. Leaving uses quick. A bare `transition-colors` already runs quick with the theme's ease-out curve.
- Animate transform and opacity, or colors for a state change. Name the properties: `transition-transform`, `transition-opacity`, `transition-colors` _(lint: restricted classes bans `transition-all`)_.
- Motion is interruptible. A tap during an animation acts at once.
- Reduced motion is handled in `src/index.css`. Prefer fades for anything new so it degrades cleanly.
- No motion on page load and no decorative loops.

## Interaction and accessibility

Why: everyone in the household must be able to use every screen by touch, keyboard and screen reader.

- Everything works by keyboard. Use `<button>` for actions and `<Link>` for navigation, never a clickable `div` _(lint: jsx-a11y)_.
- Focus is always visible. Keep the primitives' `focus-visible` ring; never remove an outline without replacing it.
- Dialogs and sheets trap focus and return it on close. The primitives do this; do not build overlays by hand.
- Every input has a visible label (`text-label`). Placeholders show an example, never the label.
- Never block paste. Enter submits a form. Disable a submit only while it runs and show that it is running (`SubmitButton` inside an `ActionForm`).
- Validate on submit and put the error next to the field, saying how to fix it.
- Give icon-only buttons an `aria-label`. Hide decorative icons from screen readers.
- Announce async results with a toast (Sonner). Toasts sit in a live region; keep them to one short sentence.
- Prefer undo over a confirm dialog for removals the event log can reverse. Confirm only what cannot be undone.
- Keep the URL in step with what is shown (filters, the selected item) so back and refresh work.
- Show loading only when it lasts long enough to notice. Keep the layout stable: no jumps when data arrives.
- Underline links inside running text. Color alone fails contrast against the surrounding text (axe `link-in-text-block`).
- Use the ellipsis character (…) and curly quotes in copy.
- Contrast: WCAG 2 AA in both themes. 4.5:1 for text, 3:1 for large text and UI such as field outlines (see Color roles).

## Writing in the UI

Why: one word per idea, so a person never wonders whether two words mean the same thing.

- Use the terms in `GLOSSARY.md`. Never use a term's _Avoid_ words in the UI: Retired, not Archived; Household, not Family.
- Sentence case for every title, button, label and menu item.
- Name buttons with a verb and the thing: "Add account", "Add category".
- Write short, plain sentences. Say what happened and what to do next.
- Keep the person in charge: "You can undo this" beats "Are you sure?".

## Components

Why: building pages from one app layer keeps them consistent and lets primitives change in one place.

- Two layers. `src/components/ui` holds shadcn primitives (layer 1). `src/components/app` holds the app components that wrap them (layer 2).
- Routes and feature components import from layer 2, never from `ui/` _(lint: arch/no-direct-primitive-import)_. Files that imported primitives when the rule landed sit on the `directPrimitiveImporters` allowlist in `eslint.config.js`. It only shrinks: remove a file's entry when you migrate it; never add one.
- When a page needs a primitive, add or extend a layer 2 component that wraps it.
- `npx shadcn add` writes into `src/components/ui`. Its output may use Tailwind defaults the theme removed; lint flags them. Map them onto the roles: `text-sm` → `text-body`, `text-xs` → `text-caption` (or `text-label` with `font-medium`), `shadow-*` → `shadow-float` or none, raw palette → a role.
- Layer 2's contents and patterns (focus and state styling beyond the tokens) are decided in the component-patterns session. Until then, follow this doc and the existing primitives.

## Layout

Why: one shell per page keeps headers, padding and wide-screen behavior the same.

- Every route renders `<PageShell variant="…">` (`src/components/layout/PageShell.tsx`). Pick the variant from its doc comment.
- Inside rails, sheets and panes, use container queries (`@[600px]:`), not viewport breakpoints. A pane's width, not the window's, decides its layout.
- Pin bottom-edge elements with the `--bottom-chrome` offset so nothing lands under the tab bar.
- Pin sticky content below the app header with the `--app-header` offset (`SectionHeader sticky` does this). Never hard-code the header's height.
- Adaptive layouts (more columns on the laptop, window size classes) come in their own session.

## Enforcement

Why: an agent that skips this doc still cannot ship an off-system class.

| Rule                                                                                                            | Lint rule (in `eslint.config.js`)               |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Only theme classes exist: no palette, `white`, `black`, old text sizes, extra weights, removed shadows or radii | `better-tailwindcss/no-unknown-classes`         |
| No arbitrary colors, font sizes, radii or shadows in a class                                                    | `better-tailwindcss/no-restricted-classes`      |
| Spacing on the step set in app code                                                                             | `better-tailwindcss/no-restricted-classes`      |
| No `transition-all`                                                                                             | `better-tailwindcss/no-restricted-classes`      |
| No color literals (hex, `rgb()`, `oklch()`…) in TSX                                                             | `arch/no-color-literal`                         |
| No inline color styles                                                                                          | `arch/no-inline-color-style`                    |
| Routes and features never import `ui/` primitives                                                               | `arch/no-direct-primitive-import`               |
| Semantic, accessible markup                                                                                     | `jsx-a11y/*` (recommended set)                  |
| Contrast pairs pass in both themes                                                                              | `src/theme-contrast.test.ts` (Vitest, not lint) |
