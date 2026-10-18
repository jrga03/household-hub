# Semantic tokens only, shadcn primitives are private

The theme defines only role tokens. Tailwind's default palette, `white`, `black`, its font-size scale, its shadow scale (except one `shadow-float`) and the font weights outside the type roles are reset in `src/index.css`, so `text-green-600`, `text-sm` or `shadow-lg` produce no CSS. Color has meaning (`income`, `shortfall`, `warning`, `destructive`), type is a named role (`text-body`, `text-figure`), and DESIGN.md says when each one applies. Because Tailwind silently ignores a class it doesn't know, `eslint-plugin-better-tailwindcss` flags unknown classes; without that rule the resets would hide mistakes instead of catching them.

shadcn primitives in `src/components/ui` are importable only from the app-component layer, never from routes or feature components. The 61 files that imported them when this was decided sit on a shrink-only allowlist in `eslint.config.js`, so new code is held to the rule at once and migration removes entries.

We did this so pages Claude builds stay consistent without anyone reviewing every class: an agent that skips DESIGN.md still can't reach for an off-palette color, an arbitrary size or a raw primitive. Token names follow shadcn's (`primary`, `muted`, `accent`, `-foreground`) so `npx shadcn add` drops into layer 1 without translation.

## Considered options

- **Guidance only (DESIGN.md, no resets or import rule):** cheapest, but it depends on every session reading and obeying the doc, which is the failure that left the app looking like stock shadcn. Rejected.
- **Resetting the spacing scale too:** in Tailwind v4 spacing also drives sizing (`h-9`, `size-4.5`, `max-w-*`), so a reset would break primitives and every size off the step set. Spacing is held to its step set by a lint rule on padding, margin, gap, space and inset in app code instead, with `ui/` exempt.
- **Our own token vocabulary** (`surface`, `action`, `text-subtle`): clearer than shadcn's `accent`, which means a hover background, but every added shadcn component would need translating. Rejected; DESIGN.md calls out the `accent` trap.
- **Lint the import boundary only after migration:** would leave pages built in the meantime on raw primitives. Rejected for the ratchet.

## Consequences

- Adding a color, size or shadow means adding a role token in `src/index.css` and a line in DESIGN.md, not using a utility.
- `shortfall` (money that is short) and `destructive` (an action that deletes) share a red but stay separate tokens, so they can diverge without a sweep.
- The resets land together with a mechanical codemod of existing classes; page redesign is separate work.
