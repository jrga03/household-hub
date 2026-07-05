# Dark Mode Switcher Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dark mode switcher that defaults to the user's system preference, with a manual override in Settings.

**Architecture:** Wrap the app in `next-themes` ThemeProvider (already installed) with `attribute="class"` to toggle `.dark` on `<html>`. The existing CSS variables in `src/index.css` already define light/dark color schemes. Add an Appearance card to Settings with light/dark/system options.

**Tech Stack:** next-themes v0.4.6, React, shadcn/ui, Tailwind CSS v4

**Design doc:** `docs/plans/2026-04-03-dark-mode-switcher-design.md`

---

### Task 1: Wire up ThemeProvider in App.tsx

**Files:**

- Modify: `src/App.tsx`

**Step 1: Add ThemeProvider import and wrap the component tree**

Add the import at the top of `src/App.tsx`:

```tsx
import { ThemeProvider } from "next-themes";
```

In the `return` block, wrap the existing `<ErrorBoundary>` content with `ThemeProvider`. The provider must be **inside** `ErrorBoundary` but **outside** everything else:

```tsx
return (
  <ErrorBoundary>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="household-hub-theme"
    >
      <TooltipProvider>{/* ... existing children unchanged ... */}</TooltipProvider>
    </ThemeProvider>
  </ErrorBoundary>
);
```

Key props:

- `attribute="class"` - toggles `.dark` class on `<html>`, matching the `@custom-variant dark (&:is(.dark *))` in `src/index.css`
- `defaultTheme="system"` - respects OS preference on first visit
- `enableSystem` - listens for `prefers-color-scheme` changes
- `disableTransitionOnChange` - prevents flickering color transitions during theme switch
- `storageKey="household-hub-theme"` - namespaced localStorage key

**Step 2: Verify the app runs and Sonner theme works**

Run: `npm run dev`

Verify:

1. App loads without errors in the console
2. If your OS is in dark mode, the app should now render in dark mode automatically
3. Check browser DevTools: `<html>` element should have `class="dark"` (or no class if OS is light mode)
4. The Sonner toaster in `src/components/ui/sonner.tsx` already calls `useTheme()` — it should now work correctly since the provider exists

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire up next-themes ThemeProvider with system preference default"
```

---

### Task 2: Add Appearance card to Settings page

**Files:**

- Modify: `src/routes/settings.tsx`

**Step 1: Add imports**

Add to the top of `src/routes/settings.tsx`:

```tsx
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
```

**Step 2: Add the theme hook inside `SettingsPage` component**

At the top of the `SettingsPage` function body, add:

```tsx
const { theme, setTheme } = useTheme();
```

**Step 3: Add the Appearance card**

Insert this card as the **first** card inside `<main>`, before the Data Export card:

```tsx
{
  /* Appearance Section */
}
<Card>
  <CardHeader>
    <CardTitle>Appearance</CardTitle>
    <CardDescription>Choose how Household Hub looks to you</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-3 gap-3">
      <Button
        variant={theme === "light" ? "default" : "outline"}
        className="flex flex-col items-center gap-2 h-auto py-4"
        onClick={() => setTheme("light")}
      >
        <Sun className="h-5 w-5" />
        <span className="text-xs font-medium">Light</span>
      </Button>
      <Button
        variant={theme === "dark" ? "default" : "outline"}
        className="flex flex-col items-center gap-2 h-auto py-4"
        onClick={() => setTheme("dark")}
      >
        <Moon className="h-5 w-5" />
        <span className="text-xs font-medium">Dark</span>
      </Button>
      <Button
        variant={theme === "system" ? "default" : "outline"}
        className="flex flex-col items-center gap-2 h-auto py-4"
        onClick={() => setTheme("system")}
      >
        <Monitor className="h-5 w-5" />
        <span className="text-xs font-medium">System</span>
      </Button>
    </div>
  </CardContent>
</Card>;
```

**Step 4: Verify manually**

Run: `npm run dev` and navigate to `/settings`

Verify:

1. Appearance card appears above Data Export card
2. The currently active theme button is highlighted (filled/default variant)
3. Clicking "Dark" switches the app to dark mode immediately
4. Clicking "Light" switches back to light mode
5. Clicking "System" follows OS preference
6. Refresh the page — the chosen theme persists (stored in localStorage under `household-hub-theme`)
7. Check that existing Settings features (Data Export, Storage Management) still work

**Step 5: Commit**

```bash
git add src/routes/settings.tsx
git commit -m "feat: add appearance theme switcher to settings page"
```

---

### Task 3: Build verification

**Step 1: Run lint**

Run: `npm run lint`
Expected: No new lint errors

**Step 2: Run type check and build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 3: Run unit tests**

Run: `npm test`
Expected: All existing tests pass (no regressions)
