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

- Show every amount with `Money` (`src/components/app/Money.tsx`). Its `kind` decides the sign, the color and what a screen reader says, so a page never decides them itself. It formats with `formatPHP` (`src/lib/currency.ts`): peso sign, thousands separators, two decimals. Never format cents by hand _(lint: `formatPHP` rendered in JSX)_; `formatPHP` stays for plain strings such as toasts and confirm titles.
- `income` marks money coming in, with a `+` sign (`kind="income"`).
- Expenses and transfers stay neutral: no money color. An expense takes the surrounding text color with a `−` sign (U+2212, `kind="expense"`). A transfer is neither in nor out, so it carries no sign and is muted, with its transfer icon (`kind="transfer"`). In a single-account view a transfer leg shows which way it moved for that account with a neutral `−` or `+` (`leg="out"` or `leg="in"`), never the income color.
- A signed total, such as a change or a month's net, is `kind="net"`: a positive total shows `+` in `income`, a negative one a neutral `−`.
- `shortfall` marks money that is short: an overspent category, a negative bank, cash or e-wallet balance, over budget, a "This leaves X at −₱…" note. A balance or what's left is `kind="balance"`, which shows a negative amount with `−` in `shortfall`. An overspent amount is the caller's copy around it ("₱1,230.00 over"), not a kind. Spending exactly the budget counts as fine, not short.
- A credit card's figure is the amount owed. Leave it uncolored, even when negative (that is a credit, not money short): `<Money kind="balance" owed>`.
- `Money` reads aloud with its sign: "−₱250.00" is "minus ₱250.00". A row that is muted (a pending transaction) mutes the amount through `className`.
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

- Two layers. `src/components/ui` holds shadcn primitives (layer 1). `src/components/app` holds the app components that wrap them (layer 2). `src/components/layout` (the shell, nav and header) also counts as layer 2.
- Routes and feature components import from layer 2, never from `ui/` _(lint: arch/no-direct-primitive-import)_. The rule has no allowlist: only tests and the three layer folders are exempt.
- Layer 2 knows money (`Cents`, `formatPHP`) but no domain entities: no Transaction, Budget or Account. A mapping from a domain state to a tone (a budget's status to a `StatusBadge` tone) lives in the feature folder. `VisibilityField` is the one exception.
- One flat PascalCase file per component in `src/components/app`, imported by its own path. There is no barrel.
- When a page needs a primitive, add or extend a layer 2 component that wraps it. Re-export a primitive as it is (one `export *` line, no wrapper logic) only when no pattern below covers it.
- `npx shadcn add` writes into `src/components/ui`. Its output may use Tailwind defaults the theme removed; lint flags them. Map them onto the roles: `text-sm` → `text-body`, `text-xs` → `text-caption` (or `text-label` with `font-medium`), `shadow-*` → `shadow-float` or none, raw palette → a role.

| Component                                                       | Use it for                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Money`                                                         | Every amount. See [Money](#money).                                                                                                                                                                                                                                                                |
| `HeroFigure`                                                    | The one large number on a screen: a `label`, a `value` (usually a `Money`) and an optional `caption`.                                                                                                                                                                                             |
| `SectionHeader`                                                 | A section's `text-heading` title, with an optional right-aligned link or amount (`action`). `sticky` pins it under the app header. Use sections with hairlines instead of cards.                                                                                                                  |
| `ListRow`                                                       | A row in a list: one stretched target (`link`, such as `?open=<id>`, or `onClick`), a `label` with a trailing `amount`, a muted `detail` line, and quick `actions` shown on hover or focus (none on phones). `open` marks the row the detail shows; `pressed` marks a picked row while selecting. |
| `DataTable`                                                     | A plain table on the laptop. Each column can `hideBelow` a container width and take a `className` (`w-full max-w-0` makes it the one that truncates); rows take the same target, open state and actions as `ListRow`.                                                                             |
| `EmptyState`                                                    | An empty list: one muted sentence saying what is missing, and an optional next step.                                                                                                                                                                                                              |
| `StatusBadge`                                                   | A short status in one of a few tones (below). Text is required; `icon` is optional.                                                                                                                                                                                                               |
| `Notice`                                                        | A boxed message in the page, `neutral` or `warning`, with an optional `title`.                                                                                                                                                                                                                    |
| `ProgressBar`                                                   | Progress toward a target, such as a category's spend against its budget. `label` is its accessible name; `value` is a percent.                                                                                                                                                                    |
| `SegmentedControl`                                              | Two to four mutually exclusive options shown inline, such as a view switch. A radio group by keyboard.                                                                                                                                                                                            |
| `FilterChips`, `FilterChip`, `FilterChipSelect`, `FilterSelect` | The phone filter row: toggle chips that scroll sideways, each pressed or not. `FilterChipSelect` is a chip that picks one value from a list and then reads it. `FilterSelect` is the same grouped choice list with any trigger, such as a laptop rail's field.                                    |
| `Field`                                                         | A form control with its `label`, `hint` and `error`, wired for screen readers. Pass a function child to reach a nested control (a Select trigger).                                                                                                                                                |
| `FormSheet`, `FormFooter`, `advanceOnEnter`                     | Every form's container: a bottom sheet on phones, a dialog on wider screens. Its buttons go in `FormFooter`; `advanceOnEnter` makes Enter move to the next field on phones; `FULL_ROW` spans a field across the form grid.                                                                        |
| `ConfirmDialogHost`                                             | Mounted once. Pages call `confirm()` from `src/lib/confirm.ts`, only for what cannot be undone.                                                                                                                                                                                                   |
| `VisibilityField`                                               | The Household or Personal choice when adding an account, group or category.                                                                                                                                                                                                                       |
| `ActionForm`, `SubmitButton`                                    | Every form that submits. A failed save keeps what the person typed; the button shows that it is running.                                                                                                                                                                                          |
| `CurrencyInput`                                                 | Every amount a person types.                                                                                                                                                                                                                                                                      |
| `FormError`                                                     | The message when submitting a form failed. A field's own error goes in `Field`.                                                                                                                                                                                                                   |
| Re-exported as they are                                         | `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Label`, `Tabs`, `Tooltip`, `Popover`, `Toaster`.                                                                                                                                                                                  |

- A `ListRow` with no target only shows its content (a Member, a join request). Controls that must work on phones sit beside it, not in `actions`.
- Some primitives have no re-export, because a pattern replaces them: Badge (`StatusBadge`), Dialog, Drawer and Sheet (`FormSheet`), AlertDialog (`ConfirmDialogHost`), Card (`SectionHeader` sections), Table (`DataTable`), Alert (`Notice`), Progress (`ProgressBar`). DropdownMenu, DatePicker, Command, Separator, Skeleton, RadioGroup and ScrollArea are re-exported when a page first needs them (Knip flags a re-export no page imports).
- Status badge tones: `neutral` (secondary), `outline`, `warning`, `shortfall` and `success`, never `destructive`. Over budget is `shortfall`; close to it is `warning`; pending is `outline` with the Info icon; review is `neutral`; no budget is `outline`; "Already imported" is `warning`; cleared has no badge.
- Progress bar tones: `primary` while spending is fine, `warning` when it is close to the target, `shortfall` (on a `shortfall/20` track) once it passes the target. Spending exactly the budget is not past it.

## Layout

Why: one shared model (Material 3 window size classes) keeps navigation, columns and panes the same on every page and every device.

### Window size classes

Global chrome switches on the window width. `useWindowClass()` (`src/hooks/useMediaQuery.ts`) returns the class; the Tailwind breakpoints `medium:`, `expanded:` and `large:` (`src/index.css`) match it in classes.

| Class    | Width       | Navigation                                                         | Add transaction |
| -------- | ----------- | ------------------------------------------------------------------ | --------------- |
| Compact  | below 600   | Tab bar (Home, Transactions) and the drawer for the rest           | Floating button |
| Medium   | 600-839     | Collapsed rail; the menu icon opens it as a modal expanded rail    | Header          |
| Expanded | 840-1199    | Collapsed rail by default; it expands to a standard rail beside it | Header          |
| Large    | 1200 and up | Expanded rail by default                                           | Header          |

- The sidebar cookie (the person's rail toggle) wins over the class default, from expanded up. The medium modal rail ignores it.
- The tab bar and the rail never show together.
- Give every collapsed rail link an `aria-label`, since only its icon shows.
- Use `medium:`, `expanded:` and `large:` only for global chrome (`AppLayout`, the header, the rail). Page content uses container queries. Tailwind's `sm:`, `md:`, `lg:`, `xl:` and `2xl:` fail in app code _(lint: restricted classes)_; they stay in the theme only for the shadcn primitives.
- There is no larger class. Wide windows cap content at `max-w-7xl` instead.
- Pin bottom-edge elements with the `--bottom-chrome` offset so nothing lands under the tab bar. It is the tab bar's height at compact and the safe area elsewhere.
- Pin sticky content below the app header with the `--app-header` offset (`SectionHeader sticky` does this). Never hard-code the header's height.

### Pane thresholds

Inside the shell, panes, rails and sheets, use container queries (`@[600px]:`), not viewport breakpoints. The `PageShell` container is the window minus the rail, so a pane's width, not the window's, decides its layout.

- Below 600: one stack.
- 600: widen the layout inside a pane.
- 840: a second pane may show.
- 1200: the fixed detail pane widens from 360 to 412px.
- Use only these three thresholds for page layout. Never add a third pane.
- One more threshold, 480, lives inside a form or a narrow pane: a form grid goes to two (or three) columns, `FormFooter` lays its buttons in a row, and a `DataTable` column can `hideBelow` it. Span a field across a two-column form grid with `FULL_ROW` (`src/components/app/FormSheet.tsx`); never retype the class.

At 1366 with the expanded rail the shell is about 1110px, so the detail pane is 360px; it reaches 412px when the rail is collapsed.

### PageShell variants

Every route renders `<PageShell variant="…">` (`src/components/layout/PageShell.tsx`) and puts its content in the variant's slots.

| Variant            | Slots                                | Use it for                                                                                              |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `single` (default) | `PageShell.Main`                     | A page that reads top to bottom: one centered column, `max-w-3xl`.                                      |
| `supporting-pane`  | `PageShell.Main`, `PageShell.Side`   | A main column with related context beside it, about 2:1 from 840, stacked below. `max-w-7xl`, centered. |
| `list-detail`      | `PageShell.List`, `PageShell.Detail` | A list whose items open for review or edit. The list flexes; `Detail` is fixed. `max-w-7xl`, centered.  |

Home is the `supporting-pane` page. Inside either wide variant, `useTwoPanes()` (`src/components/layout/pane.ts`) says whether the two columns sit side by side; use it when the stacked order differs from the two-column one, and render one arrangement rather than hiding the other with CSS.

| Route                                  | Variant now                         | Final variant (owner) |
| -------------------------------------- | ----------------------------------- | --------------------- |
| Transactions, Budget, Import, Accounts | `list-detail`                       | same                  |
| Plan, Review, Categories, Assistant    | `single`                            | same                  |
| Home                                   | `supporting-pane`                   | same                  |
| Settings                               | `list-detail`, one page below 840px | same                  |
| Create or join                         | `single`, narrowed with `max-w-md`  | same                  |
| Login, signup                          | `single`, narrowed with `max-w-md`  | same                  |

### DetailPane

A `list-detail` page shows its open item with `DetailPane` (`src/components/layout/DetailPane.tsx`). The page supplies a `title`, an optional `description`, the `item` from the local projections, and the item's content; `DetailPane` decides where it shows.

- The open item lives in the URL as `?open=<id>`. Spread `readOpenItem(search)` into the route's `validateSearch`, and open or close with `useOpenItem()` inside the shell. Never keep the open item in component state.
- From a shell width of 840 it shows in `PageShell.Detail`, sticky under the header and scrolling on its own. Below 840 it shows in a bottom sheet over the list, which keeps its scroll position on close.
- Show the pane only while an item is open. Closed, the list takes the full width: no placeholder, no default selection.
- With one pane, opening pushes a history entry, so back closes the sheet. With two panes, opening replaces the entry, so back leaves the page.
- Crossing 840 moves the open item between sheet and pane; it stays open. A stale id (the item was removed or synced away) closes it.
- The sheet's header is the title alone. The `description` shows only in the pane.

## Enforcement

Why: an agent that skips this doc still cannot ship an off-system class.

| Rule                                                                                                            | Lint rule (in `eslint.config.js`)               |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Only theme classes exist: no palette, `white`, `black`, old text sizes, extra weights, removed shadows or radii | `better-tailwindcss/no-unknown-classes`         |
| No arbitrary colors, font sizes, radii or shadows in a class                                                    | `better-tailwindcss/no-restricted-classes`      |
| Spacing on the step set in app code                                                                             | `better-tailwindcss/no-restricted-classes`      |
| No `transition-all`                                                                                             | `better-tailwindcss/no-restricted-classes`      |
| No `sm:`/`md:`/`lg:`/`xl:`/`2xl:` in app code                                                                   | `better-tailwindcss/no-restricted-classes`      |
| No color literals (hex, `rgb()`, `oklch()`…) in TSX                                                             | `arch/no-color-literal`                         |
| No inline color styles                                                                                          | `arch/no-inline-color-style`                    |
| Routes and features never import `ui/` primitives                                                               | `arch/no-direct-primitive-import`               |
| Amounts render through `Money`, not `formatPHP` in JSX                                                          | `arch/no-hand-made-amount`                      |
| Semantic, accessible markup                                                                                     | `jsx-a11y/*` (recommended set)                  |
| Contrast pairs pass in both themes                                                                              | `src/theme-contrast.test.ts` (Vitest, not lint) |
