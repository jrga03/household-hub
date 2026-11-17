# Dark Mode Switcher Design

**Date:** 2026-04-03
**Status:** Approved

## Overview

Add a dark mode switcher to the Household Hub app using the already-installed `next-themes` library. On initial load, the app respects the user's OS preference (`prefers-color-scheme`). Users can override to light, dark, or system via the Settings page.

## Current State

- CSS variables for light and dark modes already defined in `src/index.css` (`:root` and `.dark` selectors)
- Tailwind v4 custom variant configured: `@custom-variant dark (&:is(.dark *));`
- `next-themes` v0.4.6 installed but not wired up (no `ThemeProvider`)
- `useTheme()` imported in `src/components/ui/sonner.tsx` but non-functional without provider
- Database `profiles.theme_preference` column exists (`'light' | 'dark' | 'system'`)

## Approach

Use `next-themes` ThemeProvider with class-based toggling. It handles system preference detection, localStorage persistence, and FOUC prevention via a blocking inline script.

## Design

### 1. ThemeProvider in App.tsx

Wrap the existing component tree in `ThemeProvider`:

```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  storageKey="household-hub-theme"
>
  {/* existing app tree */}
</ThemeProvider>
```

- `attribute="class"` toggles `.dark` on `<html>`, matching existing CSS variable selectors
- `defaultTheme="system"` uses OS preference on first load
- `storageKey` persists user choice to localStorage

### 2. Settings Page Appearance Card

Add an "Appearance" card to `src/routes/settings.tsx` with three options:

- **Light** - always light mode
- **Dark** - always dark mode
- **System** - follows OS preference (default)

Uses `useTheme()` from `next-themes` to read/set the theme. Placed above the Data Export card.

### 3. FOUC Prevention

Handled automatically by `next-themes` - it injects a blocking script that reads localStorage and applies the `.dark` class before first paint. No `index.html` changes needed.

### 4. Out of Scope

- Syncing `theme_preference` to Supabase `profiles` table (deferred to when profile settings sync is implemented)
- Theme toggle in the header/nav (Settings page only per requirements)

## Files Changed

| File                      | Change                                  |
| ------------------------- | --------------------------------------- |
| `src/App.tsx`             | Wrap tree in `ThemeProvider`            |
| `src/routes/settings.tsx` | Add Appearance card with theme selector |

## Dependencies

No new dependencies - `next-themes` v0.4.6 is already installed.
