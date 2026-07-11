# Layout Components (`/src/components/layout/`)

## Purpose

Application shell and navigation components providing responsive layouts across mobile, tablet, and desktop breakpoints. Handles authentication protection, keyboard shortcuts, active route tracking, and accessible navigation patterns.

## Directory Contents

**Component files:**

- **`AppLayout.tsx`** (~230 lines) - Main layout orchestrator with responsive breakpoint logic; also mounts the shared quick-add transaction dialog (`QuickAddTransactionDialog`)
- **`AppSidebar.tsx`** (~400 lines) - Desktop/tablet collapsible sidebar navigation
- **`MobileNav.tsx`** (~250 lines) - Mobile drawer navigation
- **`PageShell.tsx`** (~90 lines) - Route-level layout primitive (variants: centered, rail, split, nav-content, triple; see /CLAUDE.md "PageShell layout primitive")
- **`QuickActionButton.tsx`** (~65 lines) - Single-action floating action button (FAB) for mobile that opens the quick-add transaction dialog

## Component Overview

### AppLayout.tsx

**Purpose:** Root layout component that renders different UI structures based on screen size and authentication state.

**Excellent inline documentation:** Lines 17-33 provide comprehensive module documentation covering all layout modes, features, and integration points.

**Three responsive layouts:**

1. **Mobile** (<768px):
   - Sticky header with hamburger menu
   - Slide-in drawer navigation (MobileNav)
   - Floating Action Button (QuickActionButton)
   - No sidebar

2. **Tablet** (768px - 1024px):
   - Collapsible sidebar (default: collapsed to icons)
   - Optional minimal header with page title
   - Sidebar trigger button

3. **Desktop** (>1024px):
   - Collapsible sidebar (default: expanded with labels)
   - No header (navigation via sidebar)
   - More horizontal space for content

**Key features:**

**1. Authentication Protection** (lines 62-73):

```typescript
if (!user && !isAuthRoute) {
  sessionStorage.setItem("redirectUrl", currentPath);
  navigate({ to: "/login" });
}
```

- Redirects unauthenticated users to /login
- Stores intended destination in sessionStorage
- After login, redirects to original destination

**2. No-Nav Routes** (line 36):

```typescript
const NO_NAV_ROUTES = ["/login", "/signup"];
```

- Authentication pages render without navigation
- Clean, distraction-free auth experience

**3. Loading States:**

- Shows `LoadingScreen` while auth initializes
- Shows `LoadingScreen` during redirect
- Prevents flash of unauthorized content

**4. Accessibility:**

- **Skip-to-content link** (lines 100-105, 153-158)
- Visible on keyboard focus only (`sr-only focus:not-sr-only`)
- Jumps to `#main-content` for screen readers
- WCAG 2.1 AA compliant

**5. Keyboard Shortcuts:**

- Enabled via `useKeyboardShortcuts()` hook (line 50)
- Global shortcuts work across entire app
- Displayed in sidebar navigation items

**6. Active Route Tracking:**

- Updates `navStore.activeRoute` on route change (lines 53-55)
- Used for active state highlighting in navigation

**Props:** None (consumes data from stores and hooks)

**Helper components** (bottom of file):

- `QuickAddTransactionDialog` - Single consumer of `navStore.quickAddOpen`; renders the shared `TransactionFormDialog` for whichever layout branch is mounted (FAB, sidebar/drawer CTAs, ⌘N, and `/transactions/new` all set the flag)
- `PageTitle` - Tablet header helper (maps route paths to display titles)

### AppSidebar.tsx

**Purpose:** Desktop and tablet sidebar navigation with collapsible functionality and section-based organization.

**Excellent inline documentation:** Lines 45-59 provide comprehensive feature list and integration references.

**Navigation structure:**

Three main sections:

1. **Core Financial**
   - Dashboard (⌘D)
   - Transactions (⌘T)
   - Accounts (⌘A)

2. **Planning & Analysis**
   - Budgets (⌘B)
   - Categories (⌘C)
   - Analytics (with nested "By Category" submenu)

3. **Operations**
   - Transfers
   - Import

**Sidebar anatomy:**

**1. SidebarHeader** (lines 162-201):

- Logo and app title ("HH" badge + "Household Hub")
- Collapse toggle (ChevronLeft icon, only when expanded)
- **"Add Transaction" button** (Quick add, ⌘N shortcut)
- **Sync status indicator** (shows online/offline, sync progress)

**2. SidebarContent** (lines 203-254):

- Scrollable navigation sections
- Section labels (hidden when collapsed)
- Navigation menu items with active states
- Settings link (always at bottom, ⌘S shortcut)
- Separators between sections

**3. SidebarFooter** (lines 257-282):

- User profile (avatar + email)
- Sign out button

**Collapsible behavior:**

- **Expanded mode:** Full labels, shortcuts, section headers
- **Icon mode:** Icons only, tooltips on hover, no labels
- **State persistence:** Via SidebarProvider context
- **Default:** Desktop expanded, Tablet collapsed

**Lines 293-377** - `NavMenuItem` subcomponent handles individual nav items with support for:

- Active state highlighting
- Keyboard shortcut display
- Badge counts (e.g., unread notifications)
- Nested children (collapsible submenu)
- Tooltips in icon-only mode

**Lines 70-138** - Navigation configuration with `navSections` array (centralized nav structure)

**Lines 147-153** - `isActiveRoute` logic: Exact match for "/" home, prefix match for all others

### MobileNav.tsx

**Purpose:** Full-height slide-in drawer navigation for mobile devices using Sheet component (slides from left).

**Features:**

**1. Sheet Structure:**

- Width: 320px (w-80)
- Side: Left
- Auto-closes on navigation (smooth UX)
- Touch-friendly target sizes

**2. Header Section** (lines 113-136):

- Logo + "Household Hub" title
- Close button (X icon)

**3. User Profile Section** (lines 138-149):

- Avatar (muted circle with User icon)
- Username (from email prefix)
- Full email address

**4. Quick Actions** (lines 151-156):

- "Add Transaction" button (full width)
- Closes drawer after action

**5. Sync Status** (lines 158-161):

- `GlobalSyncStatus` (detailed variant)
- Shows online/offline, pending/failed counts, and sync progress; tap opens the sync queue viewer

**6. Navigation Items** (lines 163-201):

- Same 3 sections as AppSidebar
- Larger touch targets (py-2.5)
- Active state: Background highlight + blue accent bar
- Badge support for counts
- Section separators

**7. Settings & Sign Out** (lines 203-231):

- Settings link (same as nav items)
- Sign out button (always at bottom)
- Separated with dividers

**Auto-close behavior** (lines 94-97):

```typescript
const handleNavigation = () => {
  onOpenChange(false); // Close drawer on any navigation
};
```

**Navigation items** (lines 54-78): Same structure as AppSidebar but without keyboard shortcuts (not relevant on mobile)

### QuickActionButton.tsx

**Purpose:** Single-action floating action button (FAB) for mobile, positioned bottom-right. One tap opens the quick-add transaction dialog. There is no dropdown, long-press menu, or secondary action.

**How it works:**

- `onClick` calls `navStore.setQuickAddOpen(true)` — the same path used by MobileNav's "Add Transaction" CTA, the sidebar button, and the ⌘N shortcut
- The FAB does NOT own a dialog: AppLayout mounts a single `QuickAddTransactionDialog` that consumes `navStore.quickAddOpen` and renders `TransactionFormDialog`

**Visual design:**

- **Size:** 56x56px (h-14 w-14)
- **Shape:** Circular (rounded-full)
- **Color:** Primary with shadow (shadow-lg)
- **Position:** Fixed bottom-right with safe-area insets (`bottom-[calc(1.5rem+var(--safe-area-bottom))]`, `right-[calc(1.5rem+var(--safe-area-right))]`)
- **Z-index:** 50 (stays above content)
- **Feedback:** `active:scale-95` press animation, focus-visible ring

**Route hiding** (lines 34-40):

- FAB hidden on `/login` and `/signup` pages
- Configurable via `hideOnRoutes` prop

## Responsive Breakpoint Strategy

### Breakpoint Definitions

| Breakpoint | Range          | Layout Mode       | Navigation         | Main Action    |
| ---------- | -------------- | ----------------- | ------------------ | -------------- |
| Mobile     | < 768px        | Full screen       | Drawer (MobileNav) | FAB            |
| Tablet     | 768px - 1024px | Sidebar + Content | Collapsed Sidebar  | Sidebar button |
| Desktop    | > 1024px       | Sidebar + Content | Expanded Sidebar   | Sidebar button |

### Hooks Used

**`useIsMobile()`** - Detects mobile breakpoint

- Location: `src/hooks/useMediaQuery.ts`
- Returns: `true` if screen width < 768px

**`useIsTablet()`** - Detects tablet breakpoint

- Location: `src/hooks/useMediaQuery.ts`
- Returns: `true` if screen width >= 768px && < 1024px

### Layout Decision Flow

```
AppLayout mounts
  ↓
Check isMobile
  ↓
Yes → Mobile Layout:
  - Header with hamburger
  - MobileNav drawer
  - FAB for quick actions
  ↓
No → Check isTablet
  ↓
Yes → Tablet Layout:
  - Collapsed sidebar (default)
  - Minimal header with page title
  - Sidebar trigger button
  ↓
No → Desktop Layout:
  - Expanded sidebar (default)
  - No header
  - Full sidebar with labels
```

## Data Flow Architecture

### Authentication Flow

```
App loads
  ↓
AppLayout checks authStore.initialized
  ↓
Show LoadingScreen while checking
  ↓
Auth initialized
  ↓
Check user exists
  ↓
No user + not auth route?
  ↓
Save redirectUrl to sessionStorage
  ↓
Navigate to /login
  ↓
User logs in
  ↓
Read redirectUrl from sessionStorage
  ↓
Navigate to original destination
```

### Navigation Flow

```
User clicks nav item
  ↓
TanStack Router navigate()
  ↓
Route changes
  ↓
AppLayout useEffect detects change
  ↓
Updates navStore.activeRoute
  ↓
Sidebar/MobileNav re-renders
  ↓
Active state highlights current route
  ↓
(MobileNav only) Drawer auto-closes
```

### Sidebar Collapse Flow

```
User clicks collapse toggle
  ↓
SidebarProvider updates context
  ↓
Sidebar collapses to icon-only mode
  ↓
Labels hidden
  ↓
Tooltips enabled
  ↓
Section headers hidden
  ↓
User profile simplified
  ↓
Preference persisted in context
```

## Integration Points

### Stores

**`useAuthStore`** - Authentication state

- Location: `src/stores/authStore.ts`
- Used for: `user`, `initialized`, `signOut()`
- Read by: All layout components

**`useNavStore`** - Navigation UI state

- Location: `src/stores/navStore.ts`
- Used for: `mobileNavOpen`, `activeRoute`, `quickAddOpen`
- Updated by: AppLayout (route tracking); `quickAddOpen` set by QuickActionButton, AppSidebar, MobileNav, keyboard shortcuts, and the `/transactions/new` route
- Read by: MobileNav, AppSidebar, AppLayout's `QuickAddTransactionDialog`

### Hooks

**`useKeyboardShortcuts`** - Global keyboard shortcuts

- Location: `src/hooks/useKeyboardShortcuts.ts`
- Enabled in: AppLayout (line 50)
- Shortcuts displayed in: AppSidebar navigation items

**`useMediaQuery`** - Responsive breakpoint detection

- Location: `src/hooks/useMediaQuery.ts`
- Exports: `useIsMobile()`, `useIsTablet()`
- Used by: AppLayout for layout switching

### UI Components

**shadcn/ui Sidebar** - Collapsible sidebar primitives

- Components: Sidebar, SidebarProvider, SidebarTrigger, SidebarContent, etc.
- Used by: AppSidebar
- Features: Collapse state, tooltips, rail

**shadcn/ui Sheet** - Drawer/modal overlay

- Used by: MobileNav
- Features: Slide animation, backdrop, accessibility

### Other Components

**`GlobalSyncStatus`** - Sync status display

- Location: `src/components/sync/GlobalSyncStatus.tsx`
- Used in: AppLayout header (mobile, compact), AppSidebar header (detailed when
  expanded, compact on the collapsed icon rail), MobileNav (detailed)
- Props: `variant` ("default" | "compact" | "detailed"), `className`
- Clicking it opens the `SyncQueueViewer` sheet

**`LoadingScreen`** - Full-page loading spinner

- Location: `src/components/LoadingScreen.tsx`
- Used in: AppLayout during auth initialization

**`TransactionFormDialog`** - Transaction creation form

- Location: `src/components/TransactionFormDialog.tsx`
- Mounted by: AppLayout's `QuickAddTransactionDialog` (single consumer of `navStore.quickAddOpen`)
- Opened by: QuickActionButton (FAB), AppSidebar "Add Transaction" button, MobileNav drawer CTA, ⌘N shortcut, and the `/transactions/new` PWA manifest shortcut route — all of which set `navStore.quickAddOpen`

## Key Features

### 1. Responsive Navigation

Three distinct navigation experiences optimized for each device class:

- **Mobile:** Minimal header + drawer prevents overwhelming small screens
- **Tablet:** Collapsed sidebar balances space and functionality
- **Desktop:** Full sidebar maximizes discoverability and efficiency

### 2. Authentication Protection

Automatic redirect logic ensures:

- No manual route guarding needed in individual pages
- Seamless post-login navigation to intended destination
- Clean separation of authenticated and public routes

### 3. Keyboard Shortcuts

All navigation items display keyboard shortcuts:

- ⌘D (Dashboard)
- ⌘T (Transactions)
- ⌘A (Accounts)
- ⌘B (Budgets)
- ⌘C (Categories)
- ⌘S (Settings)
- ⌘N (Add Transaction)

**Cross-platform:** `getShortcutKey()` returns Cmd on Mac, Ctrl on Windows/Linux

### 4. Active Route Highlighting

Visual feedback shows current location:

- **Sidebar:** Background accent color on active item
- **MobileNav:** Background accent + blue vertical bar
- **Consistent:** Works with nested routes (e.g., /accounts/123 highlights "Accounts")

### 5. Accessibility (WCAG 2.1 AA)

**Skip-to-content link:**

- Hidden by default (`sr-only`)
- Visible on keyboard focus
- Jumps to `#main-content` anchor
- Benefits screen reader users

**Semantic HTML:**

- `<header>`, `<nav>`, `<main>` landmarks
- Proper heading hierarchy
- `aria-label` on buttons

**Keyboard navigation:**

- All interactive elements focusable
- Logical tab order
- Escape closes drawer/dropdown

### 6. Quick Add Workflow

Multiple entry points for adding transactions:

- **Mobile:** FAB (floating bottom-right) and MobileNav drawer CTA
- **Tablet/Desktop:** "Add Transaction" button in sidebar
- **Keyboard:** ⌘N shortcut anywhere in app
- **PWA:** `/transactions/new` manifest shortcut route

**Consistent experience:** Every entry point sets `navStore.quickAddOpen`; AppLayout's `QuickAddTransactionDialog` renders the single shared `TransactionFormDialog`

### 7. Sync Status Visibility

Sync indicator present in all layouts:

- **Mobile:** Header (compact mode)
- **Tablet/Desktop:** Sidebar header (full mode)
- **MobileNav:** Full display in drawer

**User always knows:**

- Online/offline status
- Sync in progress
- Pending changes count

## Common Use Cases

### 1. Mobile User Navigation

User on phone wants to access budgets:

1. Taps hamburger menu (top-left)
2. Drawer slides in from left
3. Scrolls to "Planning & Analysis" section
4. Taps "Budgets"
5. Drawer auto-closes
6. Budgets page loads

### 2. Desktop User Shortcuts

User on desktop wants to add transaction:

1. Presses ⌘N (or Cmd+N on Mac)
2. TransactionFormDialog opens instantly
3. Fills form and saves
4. Dialog closes, returns to previous page

### 3. Tablet User Sidebar Toggle

User on tablet wants more screen space:

1. Sidebar starts collapsed (icon-only)
2. Clicks sidebar trigger to expand
3. Sidebar shows full labels
4. Clicks collapse toggle (ChevronLeft)
5. Sidebar collapses back to icons
6. More horizontal space for content

### 4. Authentication Redirect

User tries to access /analytics while logged out:

1. AppLayout detects no user
2. Saves "/analytics" to sessionStorage
3. Redirects to /login
4. User enters credentials
5. Login successful
6. Redirects to /analytics (original destination)

## UI/UX Patterns

### Mobile Header

**Sticky positioning:**

- Stays at top during scroll
- `backdrop-blur` effect for depth
- Border bottom for separation

**Contents:**

- Hamburger icon (left)
- App logo + title (center-left)
- Sync indicator (right)

### Sidebar Collapse Animation

**Smooth transitions:**

- Width animates (240px → 64px)
- Labels fade out
- Icons stay centered
- Tooltips appear on hover

**Persistence:**

- Collapse state saved in SidebarProvider context
- Persists across page navigation
- Resets on browser refresh (default based on breakpoint)

### FAB Interaction

**Tap animation:**

```css
active: scale-95;
```

- Button scales down slightly on tap
- Provides tactile feedback
- Smooth 200ms transition

### Active State Styling

**Sidebar:**

- Background: `bg-accent`
- Font weight: Normal (already visually distinct)
- Shortcut visible (right-aligned)

**MobileNav:**

- Background: `bg-accent`
- Font weight: `font-medium`
- Blue accent bar (right edge): 4px tall, rounded

### Section Organization

**Visual hierarchy:**

- Section labels: Uppercase, muted, small text
- Nav items: Normal case, readable size
- Separators: Between sections for grouping

**Cognitive load reduction:**

- Core Financial (most used) at top
- Planning & Analysis (frequent) in middle
- Operations (occasional) at bottom
- Settings always at bottom

## Performance Considerations

### Conditional Rendering

**AppLayout only renders needed layout:**

- Mobile breakpoint → Skip sidebar rendering
- Desktop breakpoint → Skip MobileNav rendering
- Reduces React tree size

### Lazy Sidebar Content

**SidebarContent wraps in ScrollArea:**

- Only visible items rendered efficiently
- Long nav lists handle gracefully

### Media Query Hook Optimization

**`useIsMobile` and `useIsTablet`:**

- Uses `window.matchMedia` API
- Efficient event listeners
- No polling or resize throttling needed

### Dialog Lazy Loading

**Quick-add dialog (AppLayout's `QuickAddTransactionDialog`):**

- Mounted conditionally: `if (!quickAddOpen) return null;`
- `TransactionFormDialog` fetches data on mount, so it only renders when open

## Critical Implementation Notes

### 1. Authentication Must Initialize

AppLayout **blocks rendering** until auth initializes:

```typescript
if (!initialized) {
  return <LoadingScreen />;
}
```

**Why:** Prevents flicker of unauthenticated state and unnecessary redirects.

### 2. NO_NAV_ROUTES Must Be Updated

When adding new auth pages (e.g., /forgot-password):

```typescript
const NO_NAV_ROUTES = ["/login", "/signup", "/forgot-password"];
```

**Why:** Prevents navigation showing on public pages.

### 3. Active Route Exact Match for Home

Lines 149-151 in AppSidebar:

```typescript
if (path === "/") {
  return currentPath === path; // Exact match
}
return currentPath.startsWith(path + "/"); // Prefix match
```

**Why:** Prevents "/" highlighting for all routes (since all start with /).

### 4. Mobile Drawer Must Auto-Close

MobileNav `handleNavigation` must call `onOpenChange(false)`:

```typescript
const handleNavigation = () => {
  onOpenChange(false);
};
```

**Why:** Keeps drawer open after navigation is confusing UX.

### 5. FAB Z-Index Hierarchy

QuickActionButton `z-50` must be higher than:

- Content (`z-0` to `z-40`)
- Header (`z-40`)
- Dialogs (`z-50`)

**Why:** FAB must always be accessible, but dialogs must overlay it.

### 6. Skip-to-Content Link

Must be first focusable element:

```jsx
<a href="#main-content" className="sr-only focus:not-sr-only ...">
  Skip to main content
</a>
```

**Why:** Screen reader users need immediate option to skip navigation.

### 7. Sidebar Default State

Tablet sidebar defaults to **collapsed**:

```jsx
<SidebarProvider defaultOpen={!isTablet}>
```

**Why:** Tablets have limited width; collapsed sidebar maximizes content space.

## Troubleshooting

### Issue: Sidebar doesn't collapse on tablet

**Check:**

1. `useIsTablet()` hook returning correct value?
2. `SidebarProvider` receiving `defaultOpen={!isTablet}`?
3. Media query breakpoint matches Tailwind `md:` (768px)?

### Issue: Mobile drawer doesn't close after navigation

**Check:**

1. `handleNavigation()` calling `onOpenChange(false)`?
2. All Link components have `onClick={handleNavigation}`?
3. Sheet `onOpenChange` prop wired correctly?

### Issue: FAB not showing on mobile

**Check:**

1. Current route in `hideOnRoutes` array?
2. `window.location.pathname` matching correctly?
3. FAB z-index (`z-50`) being overridden?

### Issue: Auth redirect loop

**Check:**

1. `initialized` state from authStore?
2. `NO_NAV_ROUTES` includes `/login`?
3. `/login` route rendering without requiring auth?

## Related Components

### Navigation Components

- [src/components/sync/GlobalSyncStatus.tsx](../../README.md) - Sync status display
- [src/components/LoadingScreen.tsx](../../README.md) - Loading state display
- [src/components/TransactionFormDialog.tsx](../../README.md) - Transaction creation form

### UI Primitives

- [src/components/ui/sidebar.tsx](../ui/) - shadcn/ui sidebar components
- [src/components/ui/sheet.tsx](../ui/) - shadcn/ui drawer component

### Hooks

- [src/hooks/useKeyboardShortcuts.ts](../../hooks/README.md) - Global keyboard shortcuts
- [src/hooks/useMediaQuery.ts](../../hooks/README.md) - Responsive breakpoint detection

### Stores

- [src/stores/authStore.ts](../../stores/README.md) - Authentication state
- [src/stores/navStore.ts](../../stores/README.md) - Navigation UI state

## Further Context

### Project Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
- [/src/README.md](../../README.md) - Source code overview
- [/src/components/README.md](../README.md) - Component architecture

### Routing

- [/src/routes/\_\_root.tsx](../../routes/README.md) - Root route integrating AppLayout
- [/src/routes/README.md](../../routes/README.md) - TanStack Router architecture

### Architecture Decisions

- Responsive design driven by mobile-first approach
- Progressive enhancement from mobile → tablet → desktop
- Accessibility baked into layout from day one
