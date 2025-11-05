# State Management (`/src/stores/`)

## Purpose

The stores directory contains **Zustand client state stores** for managing lightweight UI state. Zustand provides a minimal, hook-based state management solution that's simpler than Redux or Context API.

## Why Zustand?

**Benefits:**

- **Minimal boilerplate:** No providers, actions, or reducers
- **Hook-based API:** Natural React integration
- **TypeScript-friendly:** Full type inference
- **DevTools:** Redux DevTools support
- **Small bundle:** ~1KB gzipped
- **No Context:** No re-render issues

**When to Use:**

- Client-side UI state (navigation, modals, selections)
- Global app state (auth, sync status)
- Ephemeral state (doesn't need persistence)

**When NOT to Use:**

- Server data → Use TanStack Query instead
- Persistent local data → Use IndexedDB (Dexie) instead
- Component-local state → Use `useState` instead

## Available Stores

### authStore.ts (178 lines)

**Purpose:** Authentication state and user management

**State:**

- `user` - Current authenticated user
- `loading` - Auth initialization loading state

**Actions:**

- `initialize()` - Check for existing session on mount
- `signIn(email, password)` - Email/password login
- `signUp(email, password)` - Create new account
- `signOut()` - Logout and clear session
- `setUser(user)` - Update user state

**Usage:**

```typescript
import { useAuthStore } from "@/stores/authStore";

const user = useAuthStore((state) => state.user);
const signOut = useAuthStore((state) => state.signOut);
```

**Persistence:** Session managed by Supabase (not in Zustand)

### syncStore.ts (41 lines)

**Purpose:** Sync status and indicator state

**State:**

- `isSyncing` - Whether sync is currently active

**Actions:**

- `setIsSyncing(value)` - Update sync status

**Usage:**

```typescript
import { useSyncStore } from "@/stores/syncStore";

const isSyncing = useSyncStore((state) => state.isSyncing);
```

**Integration:** Updated by sync processor during queue processing

### navStore.ts (69 lines)

**Purpose:** Navigation UI state (sidebar collapse)

**State:**

- `isOpen` - Whether sidebar is expanded or collapsed

**Actions:**

- `toggleSidebar()` - Toggle open/closed
- `openSidebar()` - Expand sidebar
- `closeSidebar()` - Collapse sidebar

**Usage:**

```typescript
import { useNavStore } from "@/stores/navStore";

const isOpen = useNavStore((state) => state.isOpen);
const toggle = useNavStore((state) => state.toggleSidebar);
```

**Persistence:** Optional localStorage persistence for user preference

### conflictStore.ts (133 lines)

**Purpose:** Conflict resolution state (Phase B)

**State:**

- `conflicts` - Array of detected conflicts
- `selectedConflict` - Currently selected conflict for resolution

**Actions:**

- `addConflict(conflict)` - Add new conflict
- `removeConflict(id)` - Remove resolved conflict
- `selectConflict(id)` - Select conflict for resolution
- `clearConflicts()` - Clear all conflicts

**Usage:**

```typescript
import { useConflictStore } from "@/stores/conflictStore";

const conflicts = useConflictStore((state) => state.conflicts);
const addConflict = useConflictStore((state) => state.addConflict);
```

### syncIssuesStore.ts (135 lines)

**Purpose:** Track sync issues and errors

**State:**

- `issues` - Array of sync issues
- `unreadCount` - Number of unread issues

**Actions:**

- `addIssue(issue)` - Add new sync issue
- `resolveIssue(id)` - Mark issue as resolved
- `markAsRead(id)` - Mark issue as read
- `clearResolvedIssues()` - Remove resolved issues

**Usage:**

```typescript
import { useSyncIssuesStore } from "@/stores/syncIssuesStore";

const issues = useSyncIssuesStore((state) => state.issues);
const unreadCount = useSyncIssuesStore((state) => state.unreadCount);
```

### importStore.ts (148 lines)

**Purpose:** CSV import process state

**State:**

- `step` - Current import step (upload | map | resolve | import)
- `file` - Uploaded CSV file
- `columns` - Detected columns
- `mapping` - Column mapping configuration
- `duplicates` - Detected duplicate transactions
- `progress` - Import progress percentage

**Actions:**

- `setStep(step)` - Navigate between import steps
- `setFile(file)` - Store uploaded file
- `setMapping(mapping)` - Store column mapping
- `setDuplicates(duplicates)` - Store detected duplicates
- `reset()` - Reset import state

**Usage:**

```typescript
import { useImportStore } from "@/stores/importStore";

const step = useImportStore((state) => state.step);
const setStep = useImportStore((state) => state.setStep);
```

## Zustand Pattern

### Store Definition

**Basic Pattern:**

```typescript
import { create } from "zustand";

interface MyState {
  count: number;
  increment: () => void;
  decrement: () => void;
}

export const useMyStore = create<MyState>((set) => ({
  // State
  count: 0,

  // Actions
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
}));
```

### Usage in Components

**Select State:**

```typescript
// Select single value (recommended)
const count = useMyStore((state) => state.count);

// Select multiple values
const { count, increment } = useMyStore((state) => ({
  count: state.count,
  increment: state.increment,
}));

// Select entire store (causes re-render on any change)
const store = useMyStore(); // ⚠️ Use sparingly
```

**Call Actions:**

```typescript
const increment = useMyStore((state) => state.increment);

const handleClick = () => {
  increment();
};
```

### Advanced Patterns

**Async Actions:**

```typescript
export const useAuthStore = create<AuthState>((set) => ({
  user: null,

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    set({ user: data.user });
  },
}));
```

**Computed Values:**

```typescript
export const useImportStore = create<ImportState>((set, get) => ({
  duplicates: [],

  // Computed value
  get duplicateCount() {
    return get().duplicates.length;
  },
}));
```

**Middleware (DevTools):**

```typescript
import { devtools } from "zustand/middleware";

export const useMyStore = create<MyState>()(
  devtools(
    (set) => ({
      // Store definition
    }),
    { name: "MyStore" }
  )
);
```

## Common Development Tasks

### Creating a New Store

**1. Create store file:**

```typescript
// src/stores/myStore.ts
import { create } from "zustand";

interface MyState {
  value: string;
  setValue: (value: string) => void;
}

export const useMyStore = create<MyState>((set) => ({
  value: "",
  setValue: (value) => set({ value }),
}));
```

**2. Use in component:**

```typescript
import { useMyStore } from "@/stores/myStore";

function MyComponent() {
  const value = useMyStore((state) => state.value);
  const setValue = useMyStore((state) => state.setValue);

  return (
    <input value={value} onChange={(e) => setValue(e.target.value)} />
  );
}
```

### Adding Persistence

**With localStorage:**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useMyStore = create<MyState>()(
  persist(
    (set) => ({
      // Store definition
    }),
    {
      name: "my-store", // localStorage key
    }
  )
);
```

**Custom Storage:**

```typescript
import { persist } from "zustand/middleware";

export const useMyStore = create<MyState>()(
  persist(
    (set) => ({
      // Store definition
    }),
    {
      name: "my-store",
      getStorage: () => sessionStorage, // or custom storage
    }
  )
);
```

### Accessing Store Outside React

**Direct Access:**

```typescript
import { useMyStore } from "@/stores/myStore";

// Get current state
const currentValue = useMyStore.getState().value;

// Call action
useMyStore.getState().setValue("new value");

// Subscribe to changes
const unsub = useMyStore.subscribe((state) => {
  console.log("State changed:", state);
});
```

## Testing Stores

### Unit Tests

**Pattern:**

```typescript
import { act, renderHook } from "@testing-library/react";
import { useMyStore } from "./myStore";

test("increments count", () => {
  const { result } = renderHook(() => useMyStore());

  act(() => {
    result.current.increment();
  });

  expect(result.current.count).toBe(1);
});

// Reset store between tests
beforeEach(() => {
  useMyStore.setState({ count: 0 });
});
```

### Integration Tests

**Test Scenarios:**

- Store updates trigger component re-renders
- Actions update state correctly
- Persistence works (localStorage)
- Multiple components share state

## Performance Considerations

**Selector Optimization:**

```typescript
// ✅ Good: Only re-renders when count changes
const count = useMyStore((state) => state.count);

// ❌ Bad: Re-renders on any store change
const { count } = useMyStore();
```

**Shallow Equality:**

```typescript
import { shallow } from "zustand/shallow";

// Only re-renders if count OR title changes
const { count, title } = useMyStore(
  (state) => ({ count: state.count, title: state.title }),
  shallow
);
```

**Derived State:**
Compute derived values in selectors, not in store:

```typescript
// ✅ Good: Computed in component
const total = useMyStore((state) => state.items.reduce((sum, item) => sum + item.price, 0));

// ❌ Bad: Stored in state (can get out of sync)
const total = useMyStore((state) => state.total);
```

## Related Documentation

### Parent README

- [../README.md](../README.md) - Source code overview

### Related Directories

- [../components/README.md](../components/README.md) - Components that use stores
- [../hooks/README.md](../hooks/README.md) - Hooks for server state (use TanStack Query, not Zustand)

### External Resources

- [Zustand Documentation](https://docs.pmnd.rs/zustand) - Official docs
- [Zustand vs Redux](https://docs.pmnd.rs/zustand/getting-started/comparison) - Comparison guide
- [React State Management](https://react.dev/learn/managing-state) - React docs

### Project Documentation

- [/CLAUDE.md](../../CLAUDE.md) - Project quick reference
- [/docs/initial plan/ARCHITECTURE.md](../../docs/initial%20plan/ARCHITECTURE.md) - State management architecture
