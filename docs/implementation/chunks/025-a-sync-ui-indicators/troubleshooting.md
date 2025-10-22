# Troubleshooting: Sync UI Indicators

Common issues and solutions when working with sync UI components.

---

## Component Rendering Issues

### Problem: Sync status badge not visible

**Symptoms**:

- Badge component doesn't appear in header
- No console errors
- Other header elements render fine

**Cause 1**: Component not imported in layout

**Solution**:

Check layout file:

```typescript
// In src/routes/__root.tsx or AppLayout.tsx
import { SyncStatus } from "@/components/SyncStatus";

// Verify it's rendered
<header>
  {/* ... */}
  <SyncStatus /> {/* Should be here */}
</header>
```

**Cause 2**: Missing shadcn Badge component

**Solution**:

Install Badge component:

```bash
npx shadcn-ui@latest add badge
```

Verify import:

```typescript
import { Badge } from "@/components/ui/badge";
```

**Cause 3**: CSS not loaded

**Solution**:

Check Tailwind classes applied:

```typescript
// In SyncStatus.tsx
<Badge variant="outline" className="gap-1.5">
  {/* Should have styles */}
</Badge>
```

Verify Tailwind config includes badge component.

---

### Problem: Icons not displaying (blank squares)

**Symptoms**:

- Badge renders but icons show as blank squares
- Text displays correctly

**Cause**: lucide-react not installed or icons not imported

**Solution**:

Install lucide-react:

```bash
npm install lucide-react
```

Verify imports:

```typescript
import { Loader2, Cloud, CloudOff, CheckCircle2, RefreshCw, AlertCircle, X } from "lucide-react";
```

Check icon usage:

```typescript
<CheckCircle2 className="h-3 w-3" /> {/* Should specify size */}
```

---

### Problem: Components overlap or misaligned

**Symptoms**:

- Badge overlaps with other header elements
- Buttons don't align properly
- Mobile layout broken

**Cause**: Missing flexbox/grid layout

**Solution**:

Fix header layout:

```typescript
<header className="flex items-center justify-between p-4">
  <div>{/* Left side */}</div>

  <div className="flex items-center gap-3">
    <SyncStatus />
    <SyncButton />
  </div>
</header>
```

Check responsive classes:

```typescript
// Stack on mobile
<div className="flex flex-col sm:flex-row items-center gap-2">
  <SyncStatus />
  <SyncButton />
</div>
```

---

## State Update Issues

### Problem: Pending count always shows 0

**Symptoms**:

- Create offline transactions
- Badge still shows "Synced" or 0 pending
- Console shows items in sync_queue

**Cause 1**: Query not enabled

**Solution**:

Check `useSyncStatus` hook:

```typescript
const { data: pendingCount = 0 } = useQuery({
  queryKey: ["sync-status", "pending-count"],
  queryFn: () => (user?.id ? getQueueCount(user.id) : 0),
  enabled: !!user?.id && isOnline, // CRITICAL: Must be true
  refetchInterval: 10000,
});

console.log("Query enabled:", !!user?.id && isOnline);
console.log("Pending count:", pendingCount);
```

**Cause 2**: User not authenticated

**Solution**:

Verify auth state:

```typescript
const user = useAuthStore((state) => state.user);
console.log("User:", user); // Should have id

if (!user?.id) {
  console.error("User not authenticated - query won't run");
}
```

**Cause 3**: getQueueCount not querying correctly

**Solution**:

Test query directly:

```typescript
// In console
const count = await getQueueCount(userId);
console.log("Direct count:", count); // Should match queue items

// Check Supabase query
const { data } = await supabase
  .from("sync_queue")
  .select("count")
  .eq("user_id", userId)
  .eq("status", "queued")
  .single();

console.log("Database count:", data?.count);
```

---

### Problem: Badge doesn't update after sync completes

**Symptoms**:

- Sync runs successfully
- Badge still shows "3 pending"
- Have to refresh page to see "Synced"

**Cause**: Query cache not invalidated

**Solution**:

Ensure invalidation in sync hook:

```typescript
export function useSyncProcessor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return syncProcessor.processQueue(user.id);
    },
    onSuccess: (result) => {
      // CRITICAL: Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["offline"] });

      console.log("Queries invalidated");
    },
  });
}
```

Force refetch:

```typescript
// After sync completes
queryClient.invalidateQueries({ queryKey: ["sync-status", "pending-count"] });
await queryClient.refetchQueries({ queryKey: ["sync-status", "pending-count"] });
```

---

### Problem: Status updates lag (5-10 second delay)

**Symptoms**:

- Create offline item
- Badge updates slowly
- Real-time feel missing

**Cause**: refetchInterval too long

**Solution**:

Reduce refetch interval:

```typescript
const { data: pendingCount } = useQuery({
  queryKey: ["sync-status", "pending-count"],
  queryFn: () => getQueueCount(userId),
  refetchInterval: 5000, // Changed from 10000 to 5000 (5 seconds)
  refetchOnWindowFocus: true, // Refetch when window gains focus
});
```

Or use optimistic updates:

```typescript
// When creating offline item
onSuccess: () => {
  // Optimistically increment pending count
  queryClient.setQueryData(["sync-status", "pending-count"], (old) => (old || 0) + 1);
};
```

---

## Online/Offline Detection Issues

### Problem: Badge doesn't change when going offline

**Symptoms**:

- Disable network in DevTools
- Badge still shows "Synced" (should show "Offline")
- No console logs

**Cause**: `useOnlineStatus` hook not listening to events

**Solution**:

Check event listeners:

```typescript
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      console.log("Online event fired");
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log("Offline event fired");
      setIsOnline(false);
    };

    // CRITICAL: Add listeners
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
```

Test manually:

```typescript
// Trigger offline event manually
window.dispatchEvent(new Event("offline"));
// Badge should update

// Trigger online event manually
window.dispatchEvent(new Event("online"));
// Badge should update
```

---

### Problem: `navigator.onLine` unreliable

**Symptoms**:

- Says online but can't reach Supabase
- Says offline but network works fine
- Browser quirks (Firefox vs Chrome)

**Cause**: `navigator.onLine` only detects network interface, not internet connectivity

**Solution**:

Enhance detection with connectivity check:

```typescript
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Also check with actual network request
  const checkConnectivity = async () => {
    try {
      const { data, error } = await supabase.from("transactions").select("id").limit(1);

      setIsOnline(!error);
    } catch {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      checkConnectivity(); // Verify with real request
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check periodically
    const interval = setInterval(checkConnectivity, 30000); // 30s

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}
```

---

## Offline Banner Issues

### Problem: Banner doesn't appear when offline

**Symptoms**:

- Network disabled
- Badge shows "Offline"
- But banner doesn't appear

**Cause 1**: Banner component not rendered in layout

**Solution**:

Check layout:

```typescript
// In AppLayout or main route
import { OfflineBanner } from "@/components/OfflineBanner";

<main>
  <OfflineBanner /> {/* Should be here, above content */}
  {children}
</main>
```

**Cause 2**: Banner dismissed

**Solution**:

Check dismissed state:

```typescript
// In OfflineBanner component
const [dismissed, setDismissed] = useState(false);

console.log("Banner dismissed:", dismissed);
console.log("Is online:", isOnline);
console.log("Should show:", !isOnline && !dismissed);

// Reset dismissed when online
useEffect(() => {
  if (isOnline) {
    console.log("Back online - resetting dismissed");
    setDismissed(false);
  }
}, [isOnline]);
```

---

### Problem: Banner appears even when online

**Symptoms**:

- Network enabled
- Badge shows "Synced"
- Banner still visible

**Cause**: Stale online status

**Solution**:

Check render condition:

```typescript
export function OfflineBanner() {
  const { isOnline, pendingCount } = useSyncStatus();
  const [dismissed, setDismissed] = useState(false);

  // Debug logs
  console.log("OfflineBanner render:", { isOnline, dismissed });

  // Should return null when online OR dismissed
  if (isOnline || dismissed) {
    return null; // CRITICAL: Early return
  }

  return (
    <Alert variant="destructive">
      {/* ... */}
    </Alert>
  );
}
```

---

### Problem: Dismiss button doesn't work

**Symptoms**:

- Click X button
- Banner doesn't disappear
- No console errors

**Cause**: onClick handler not wired correctly

**Solution**:

Verify button handler:

```typescript
<Button
  size="sm"
  variant="ghost"
  onClick={() => {
    console.log("Dismiss clicked");
    setDismissed(true);
  }}
>
  <X className="h-4 w-4" />
</Button>
```

Check state update:

```typescript
const [dismissed, setDismissed] = useState(false);

console.log("Dismissed state:", dismissed);

// After clicking
// Should see: "Dismissed state: true"
```

---

## Sync Button Issues

### Problem: Button always disabled

**Symptoms**:

- Have offline items (verified in queue)
- Button grayed out
- Can't click

**Cause 1**: Disabled condition too strict

**Solution**:

Check button logic:

```typescript
<Button
  onClick={() => sync()}
  disabled={!isOnline || isPending || pendingCount === 0}
>
  {/* ... */}
</Button>

// Debug each condition
console.log("Online:", isOnline);
console.log("Syncing:", isPending);
console.log("Pending count:", pendingCount);
console.log("Should be enabled:", isOnline && !isPending && pendingCount > 0);
```

**Cause 2**: Pending count query not returning value

**Solution**:

Check query state:

```typescript
const {
  data: pendingCount,
  isLoading,
  error,
} = useQuery({
  queryKey: ["sync-status", "pending-count"],
  queryFn: () => getQueueCount(userId),
});

console.log("Query loading:", isLoading);
console.log("Query error:", error);
console.log("Pending count:", pendingCount);

// Should not be undefined
if (pendingCount === undefined) {
  console.error("Query returning undefined - check getQueueCount");
}
```

---

### Problem: Button click doesn't trigger sync

**Symptoms**:

- Button enabled
- Click has no effect
- No console logs
- No spinner

**Cause**: onClick handler not calling mutation

**Solution**:

Verify mutation wiring:

```typescript
export function SyncButton() {
  const { mutate: sync, isPending } = useSyncProcessor();

  const handleClick = () => {
    console.log("Sync button clicked");
    sync(); // CRITICAL: Call mutation
  };

  return (
    <Button onClick={handleClick} disabled={isPending}>
      <RefreshCw className={isPending ? "animate-spin" : ""} />
      Sync
    </Button>
  );
}
```

Check mutation definition:

```typescript
export function useSyncProcessor() {
  return useMutation({
    mutationFn: async () => {
      console.log("Mutation function called");
      return syncProcessor.processQueue(userId);
    },
    onSuccess: () => {
      console.log("Sync succeeded");
    },
    onError: (error) => {
      console.error("Sync failed:", error);
    },
  });
}
```

---

### Problem: Spinner doesn't animate

**Symptoms**:

- Button shows spinner icon
- But icon doesn't rotate
- Static image

**Cause**: Missing `animate-spin` class

**Solution**:

Add animation conditionally:

```typescript
<RefreshCw
  className={cn(
    "h-4 w-4",
    isPending && "animate-spin" // CRITICAL: Conditional animation
  )}
/>
```

Check Tailwind config includes animations:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      animation: {
        spin: "spin 1s linear infinite",
      },
    },
  },
};
```

---

## React Hook Errors

### Problem: "Rendered more hooks than during the previous render"

**Symptoms**:

- Console error about hooks
- App crashes
- Component unmounts unexpectedly

**Cause**: Conditional hook call

**Solution**:

**INCORRECT**:

```typescript
export function SyncStatus() {
  const { isOnline } = useSyncStatus();

  if (!isOnline) {
    // DON'T DO THIS - conditional hook
    const someHook = useSomeHook();
  }
}
```

**CORRECT**:

```typescript
export function SyncStatus() {
  const { isOnline } = useSyncStatus();
  const someHook = useSomeHook(); // Always call hooks

  if (!isOnline) {
    // Use hook result conditionally
    const value = someHook.data;
  }
}
```

---

### Problem: "Maximum update depth exceeded"

**Symptoms**:

- Infinite render loop
- Browser hangs
- Console floods with warnings

**Cause**: State update in render

**Solution**:

**INCORRECT**:

```typescript
export function SyncStatus() {
  const { pendingCount } = useSyncStatus();

  // DON'T DO THIS - updates state on every render
  if (pendingCount > 0) {
    setShowBadge(true);
  }
}
```

**CORRECT**:

```typescript
export function SyncStatus() {
  const { pendingCount } = useSyncStatus();

  // Use useEffect
  useEffect(() => {
    if (pendingCount > 0) {
      setShowBadge(true);
    }
  }, [pendingCount]);
}
```

---

## Accessibility Issues

### Problem: Screen reader doesn't announce status changes

**Symptoms**:

- Status changes (synced → syncing → synced)
- Screen reader silent
- No announcements

**Cause**: Missing `aria-live` or `role="status"`

**Solution**:

Add ARIA attributes:

```typescript
<Badge
  role="status"
  aria-live="polite"
  aria-label={`Sync status: ${isOnline ? 'synced' : 'offline'}`}
>
  {/* ... */}
</Badge>
```

For alerts (offline banner):

```typescript
<Alert role="alert" aria-live="assertive">
  <AlertDescription>You're offline.</AlertDescription>
</Alert>
```

---

### Problem: Keyboard navigation broken

**Symptoms**:

- Can't tab to sync button
- Enter key doesn't work
- No focus indicators

**Cause**: Missing tabindex or focus styles

**Solution**:

Ensure buttons are keyboard accessible:

```typescript
<Button
  onClick={handleSync}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSync();
    }
  }}
  className="focus-visible:ring-2 focus-visible:ring-offset-2"
>
  Sync
</Button>
```

Check focus styles visible:

```css
/* In global CSS or component */
.sync-button:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

---

### Problem: Color contrast fails WCAG

**Symptoms**:

- aXe audit shows contrast errors
- Text hard to read
- Failed accessibility compliance

**Cause**: Badge colors don't meet 4.5:1 ratio

**Solution**:

Check contrast:

```typescript
// Use shadcn destructive variant for offline (high contrast)
<Badge variant="destructive">Offline</Badge>

// Use outline with darker text for synced
<Badge variant="outline" className="text-green-700 dark:text-green-400">
  Synced
</Badge>
```

Test with browser DevTools:

1. Inspect element
2. Check "Accessibility" tab
3. View contrast ratio
4. Should be ≥4.5:1

---

## Performance Issues

### Problem: Components re-render excessively

**Symptoms**:

- Status badge flickers
- CPU usage high
- DevTools Profiler shows many renders
- App feels sluggish

**Cause**: Parent component re-renders trigger child re-renders

**Solution**:

Memoize components:

```typescript
export const SyncStatus = React.memo(() => {
  const { isOnline, pendingCount } = useSyncStatus();

  // Only re-renders when isOnline or pendingCount change
  return (
    <Badge>
      {/* ... */}
    </Badge>
  );
});
```

Optimize hook with useMemo:

```typescript
export function useSyncStatus() {
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["sync-status", "pending-count"],
    queryFn: () => getQueueCount(userId),
    // Prevent refetch on window focus if not needed
    refetchOnWindowFocus: false,
  });

  return useMemo(
    () => ({
      isOnline,
      pendingCount,
      isSyncing,
    }),
    [isOnline, pendingCount, isSyncing]
  );
}
```

---

### Problem: Polling causes performance issues

**Symptoms**:

- High network activity
- Many database queries
- Battery drain on mobile

**Cause**: Refetch interval too short

**Solution**:

Increase interval or use smarter polling:

```typescript
const { data: pendingCount } = useQuery({
  queryKey: ["sync-status", "pending-count"],
  queryFn: () => getQueueCount(userId),
  refetchInterval: (data) => {
    // Poll faster when items pending
    return data > 0 ? 5000 : 30000; // 5s if pending, 30s if not
  },
});
```

Or disable polling when tab not visible:

```typescript
const { data: pendingCount } = useQuery({
  queryKey: ["sync-status", "pending-count"],
  queryFn: () => getQueueCount(userId),
  refetchInterval: 10000,
  refetchIntervalInBackground: false, // Don't poll when tab hidden
});
```

---

## Toast Notification Issues

### Problem: Toast doesn't appear after sync

**Symptoms**:

- Sync completes successfully
- No toast notification
- Silent operation

**Cause**: Toast not called in onSuccess

**Solution**:

Verify toast in mutation:

```typescript
export function useSyncProcessor() {
  return useMutation({
    mutationFn: async () => {
      return syncProcessor.processQueue(userId);
    },
    onSuccess: (result) => {
      // CRITICAL: Show toast
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} items`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} items failed to sync`);
      }
    },
  });
}
```

Check Sonner provider:

```typescript
// In App.tsx or root
import { Toaster } from "sonner";

<Toaster position="bottom-right" />
```

---

### Problem: Multiple toasts stack up

**Symptoms**:

- Sync triggers multiple times
- Each shows a toast
- Screen fills with toasts

**Cause**: No toast deduplication

**Solution**:

Use toast IDs:

```typescript
onSuccess: (result) => {
  // Use ID to replace previous toast
  toast.success(`Synced ${result.synced} items`, {
    id: "sync-success",
  });
};
```

Or dismiss previous:

```typescript
import { toast } from "sonner";

let lastToastId: string | number;

onSuccess: (result) => {
  if (lastToastId) {
    toast.dismiss(lastToastId);
  }
  lastToastId = toast.success(`Synced ${result.synced} items`);
};
```

---

## Testing Issues

### Problem: Can't test components in isolation

**Symptoms**:

- Tests fail with "useQuery is not a function"
- Missing providers
- Hooks error out

**Cause**: Missing query client provider in tests

**Solution**:

Wrap component in providers:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { SyncStatus } from "./SyncStatus";

it("should render sync status", () => {
  const queryClient = new QueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <SyncStatus />
    </QueryClientProvider>
  );
});
```

Mock useSyncStatus hook:

```typescript
vi.mock("@/hooks/useSyncStatus", () => ({
  useSyncStatus: () => ({
    isOnline: true,
    pendingCount: 3,
    isSyncing: false,
  }),
}));
```

---

## Prevention Tips

1. **Always use aria-live**: Help screen readers announce changes
2. **Test offline mode**: Use DevTools Network tab regularly
3. **Memoize components**: Prevent unnecessary re-renders
4. **Add loading states**: Show feedback for all async operations
5. **Use TypeScript**: Catch prop type errors early
6. **Test keyboard navigation**: Tab through all interactive elements
7. **Check color contrast**: Use browser DevTools accessibility checker
8. **Add console.logs during development**: Debug state changes easily

---

## Quick Fixes

```typescript
// Force status update
queryClient.invalidateQueries({ queryKey: ["sync-status"] });

// Check online status
console.log("Online:", navigator.onLine);

// Check pending count manually
const count = await getQueueCount(userId);
console.log("Pending:", count);

// Test offline detection
window.dispatchEvent(new Event("offline"));
console.log("Should show offline badge");

// Test online detection
window.dispatchEvent(new Event("online"));
console.log("Should show synced badge");

// Force sync
const { mutate: sync } = useSyncProcessor();
sync();

// Check badge visibility
document.querySelector(".badge"); // Should exist

// Check banner visibility
document.querySelector("[role='alert']"); // Should exist when offline
```

---

## Getting Help

If you're stuck:

1. Check this troubleshooting guide first
2. Use React DevTools to inspect component state
3. Check TanStack Query DevTools for query state
4. Use browser Accessibility audit (Lighthouse)
5. Test with keyboard navigation
6. Check console for React warnings
7. Verify all providers wrap components

---

**Remember**: UI indicators are critical for user confidence in offline-first apps. Clear, accessible feedback builds trust.
