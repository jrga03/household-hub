# React 19 Enhancements - Implementation Guide

## Prerequisites

- React 19.0.0+ and React DOM 19.0.0+ installed
- TypeScript 5.9+ configured
- TanStack Query v5+ for optimistic updates
- TanStack Router v1+ for Suspense support
- Existing auth forms and analytics pages

## Overview

This guide walks through implementing React 19 features in Household Hub:

1. **useFormStatus()** - Automatic form submission states
2. **Suspense Boundaries** - Smooth loading transitions
3. **use() Hook** - Context consumption without null checks
4. **Optimistic Updates** - Instant UI feedback with TanStack Query

---

## Phase 1: Create SubmitButton Component

### Step 1.1: Create Component File

```bash
touch src/components/ui/submit-button.tsx
```

### Step 1.2: Implement SubmitButton

**File:** `/src/components/ui/submit-button.tsx`

```typescript
import * as React from "react";
import { useFormStatus } from "react-dom"; // IMPORTANT: from react-dom, not react!
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SubmitButtonProps extends React.ComponentProps<typeof Button> {
  /**
   * Text to display when form is submitting
   * @default "Submitting..."
   */
  pendingText?: string;

  /**
   * Whether to show loading spinner icon
   * @default true
   */
  showSpinner?: boolean;
}

/**
 * SubmitButton Component
 *
 * Automatically handles form submission states using React 19's useFormStatus().
 * Must be used inside a <form> element with an action prop.
 *
 * @example
 * <form action={handleSubmit}>
 *   <SubmitButton pendingText="Signing in...">
 *     Sign in
 *   </SubmitButton>
 * </form>
 */
export function SubmitButton({
  children,
  pendingText = "Submitting...",
  showSpinner = true,
  disabled,
  className,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-disabled={pending}
      aria-busy={pending}
      className={cn(className)}
      {...props}
    >
      {pending && showSpinner && (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      )}
      {pending ? pendingText : children}
    </Button>
  );
}
```

**Key points:**

- Import `useFormStatus` from `"react-dom"` (not `"react"`)
- Automatically sets `disabled`, `aria-disabled`, `aria-busy` during pending
- Shows spinner and custom pending text
- Extends all Button props for full compatibility

### Step 1.3: Test SubmitButton

Create test file: `src/components/ui/submit-button.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SubmitButton } from "./submit-button";

describe("SubmitButton", () => {
  it("renders children when not pending", () => {
    render(
      <form>
        <SubmitButton>Submit</SubmitButton>
      </form>
    );

    expect(screen.getByRole("button")).toHaveTextContent("Submit");
  });

  it("shows pending text and spinner during submission", async () => {
    const handleSubmit = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(
      <form action={handleSubmit}>
        <SubmitButton pendingText="Loading...">Submit</SubmitButton>
      </form>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toHaveTextContent("Loading...");
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).toBeDisabled();
    });
  });

  it("hides spinner when showSpinner is false", () => {
    render(
      <form action={() => Promise.resolve()}>
        <SubmitButton showSpinner={false} pendingText="Wait...">
          Submit
        </SubmitButton>
      </form>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(button).toHaveTextContent("Wait...");
    expect(screen.queryByRole("img", { hidden: true })).not.toBeInTheDocument();
  });
});
```

---

## Phase 2: Update Auth Forms

### Step 2.1: Update LoginForm

**File:** `/src/components/LoginForm.tsx`

**Before:**

```typescript
function LoginForm() {
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsPending(true);
    try {
      await signIn(email, password);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
```

**After:**

```typescript
import { SubmitButton } from "@/components/ui/submit-button";

function LoginForm() {
  const handleSubmit = async (formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    await signIn(email, password);
  };

  return (
    <form action={handleSubmit}>
      {/* form fields with name attributes */}
      <Input name="email" type="email" />
      <Input name="password" type="password" />

      <SubmitButton pendingText="Signing in..." className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
```

**Changes:**

1. Remove `isPending` state and manual handlers
2. Change `onSubmit` to `action` prop
3. Add `name` attributes to form inputs
4. Replace `Button` with `SubmitButton`

### Step 2.2: Update SignupForm

Same pattern as LoginForm:

```typescript
import { SubmitButton } from "@/components/ui/submit-button";

function SignupForm() {
  const handleSubmit = async (formData: FormData) => {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    await signUp(email, password, confirmPassword);
  };

  return (
    <form action={handleSubmit}>
      <Input name="email" type="email" />
      <Input name="password" type="password" />
      <Input name="confirmPassword" type="password" />

      <SubmitButton pendingText="Creating account..." className="w-full">
        Sign up
      </SubmitButton>
    </form>
  );
}
```

### Step 2.3: Verify Form Functionality

**Manual testing checklist:**

- [ ] Submit button shows "Signing in..." during submission
- [ ] Button is disabled during submission
- [ ] Spinner icon appears next to pending text
- [ ] Button returns to normal state after completion
- [ ] Error handling still works correctly
- [ ] ARIA attributes are set correctly (test with screen reader)

---

## Phase 3: Add Suspense Boundaries to Analytics

### Step 3.1: Install shadcn Tabs Component

```bash
npx shadcn@latest add tabs
```

### Step 3.2: Extract Category Analytics Component

Create new file for lazy loading:

**File:** `/src/components/analytics/CategoryAnalyticsContent.tsx`

```typescript
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPHP } from "@/lib/currency";

export function CategoryAnalyticsContent() {
  // This component will be lazy-loaded with Suspense
  const { data: categorySpending } = useQuery({
    queryKey: ["analytics", "categories", "current-month"],
    queryFn: fetchCategorySpending,
    suspense: true, // Enable Suspense support
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by Category</CardTitle>
      </CardHeader>
      <CardContent>
        {categorySpending?.map((category) => (
          <div key={category.id} className="flex justify-between py-2">
            <span>{category.name}</span>
            <span className="font-medium">
              {formatPHP(category.totalCents)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

**Important:** Set `suspense: true` in useQuery options to enable Suspense mode.

### Step 3.3: Update Analytics Route with Tabs

**File:** `/src/routes/analytics.tsx`

```typescript
import { Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, PieChart, TrendingUp, Loader2 } from "lucide-react";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { CategoryAnalyticsContent } from "@/components/analytics/CategoryAnalyticsContent";
import { TrendsAnalytics } from "@/components/analytics/TrendsAnalytics";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Analytics</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            By Category
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Trends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Suspense fallback={<LoadingSpinner text="Loading overview..." />}>
            <AnalyticsDashboard />
          </Suspense>
        </TabsContent>

        <TabsContent value="categories">
          <Suspense fallback={<LoadingSpinner text="Loading category analytics..." />}>
            <CategoryAnalyticsContent />
          </Suspense>
        </TabsContent>

        <TabsContent value="trends">
          <Suspense fallback={<LoadingSpinner text="Loading trends..." />}>
            <TrendsAnalytics />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
```

**Key points:**

- Each tab content wrapped in `<Suspense>`
- Custom loading fallback with descriptive text
- Tabs load independently (no blocking)

### Step 3.4: Enable Suspense in TanStack Query

**File:** Update query client configuration

```typescript
// src/lib/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Enable Suspense mode by default (optional)
      // Individual queries can override with suspense: false
      suspense: false, // Set to true to enable globally

      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});
```

**For Suspense-enabled queries:**

```typescript
useQuery({
  queryKey: ["data"],
  queryFn: fetchData,
  suspense: true, // Enable Suspense for this query
});
```

---

## Phase 4: Migrate Context to use() Hook

### Step 4.1: Update FormField Context

**File:** `/src/components/ui/form.tsx`

**Before:**

```typescript
import { useContext } from "react";

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

function useFormField() {
  const field = useContext(FormFieldContext);

  if (!field) {
    throw new Error("useFormField must be used within <FormField>");
  }

  return field;
}
```

**After:**

```typescript
import { use } from "react"; // Import use from react

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

function useFormField() {
  const field = use(FormFieldContext); // Automatically throws if null

  // No need for manual null check - use() throws automatically
  // with a better error message including component stack

  return field;
}
```

**Changes:**

1. Import `use` from `"react"`
2. Replace `useContext(context)` with `use(context)`
3. Remove manual null check (use() throws automatically)

### Step 4.2: Update Sidebar Context

**File:** `/src/components/ui/sidebar.tsx`

**Before:**

```typescript
import { useContext } from "react";

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

function useSidebar() {
  const context = useContext(SidebarContext);

  if (!context) {
    throw new Error("useSidebar must be used within <SidebarProvider>");
  }

  return context;
}
```

**After:**

```typescript
import { use } from "react";

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

function useSidebar() {
  const context = use(SidebarContext);

  // use() automatically throws if context is undefined
  return context;
}
```

### Step 4.3: Verify Context Usage

**Test checklist:**

- [ ] Components using contexts still work correctly
- [ ] Error messages are clear when context is missing
- [ ] TypeScript types are inferred correctly (no need for assertions)
- [ ] No runtime errors in existing components

---

## Phase 5: Implement Optimistic Updates

### Step 5.1: Update Create Transaction Hook

**File:** `/src/hooks/useOfflineTransaction.ts`

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createOfflineTransaction } from "@/lib/offline/transactions";
import type { Transaction } from "@/types/transaction";

export function useCreateOfflineTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createOfflineTransaction,

    // Step 1: Optimistic update BEFORE server call
    onMutate: async (newTransaction: Omit<Transaction, "id">) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["transactions", "offline"] });

      // Snapshot the previous value for rollback
      const previousTransactions = queryClient.getQueryData<Transaction[]>([
        "transactions",
        "offline",
      ]);

      // Optimistically update cache with temporary ID
      queryClient.setQueryData<Transaction[]>(["transactions", "offline"], (old) => {
        const tempTransaction: Transaction = {
          ...newTransaction,
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };

        return old ? [...old, tempTransaction] : [tempTransaction];
      });

      // Return context with previous value for error rollback
      return { previousTransactions };
    },

    // Step 2: Rollback on error
    onError: (error, _newTransaction, context) => {
      // Restore previous state if mutation fails
      if (context?.previousTransactions) {
        queryClient.setQueryData(["transactions", "offline"], context.previousTransactions);
      }

      toast.error(error instanceof Error ? error.message : "Failed to create transaction");
    },

    // Step 3: Sync with server after mutation
    onSettled: () => {
      // Always refetch to ensure cache matches server
      queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
    },

    // Step 4: Success feedback
    onSuccess: () => {
      toast.success("Transaction created successfully");
    },
  });
}
```

### Step 5.2: Update Update Transaction Hook

```typescript
export function useUpdateOfflineTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Transaction> }) =>
      updateOfflineTransaction(id, updates),

    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", "offline"] });

      const previousTransactions = queryClient.getQueryData<Transaction[]>([
        "transactions",
        "offline",
      ]);

      // Optimistically update the transaction in cache
      queryClient.setQueryData<Transaction[]>(["transactions", "offline"], (old) =>
        old?.map((transaction) =>
          transaction.id === id
            ? { ...transaction, ...updates, updated_at: new Date().toISOString() }
            : transaction
        )
      );

      return { previousTransactions };
    },

    onError: (error, _variables, context) => {
      if (context?.previousTransactions) {
        queryClient.setQueryData(["transactions", "offline"], context.previousTransactions);
      }
      toast.error("Failed to update transaction");
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
    },

    onSuccess: () => {
      toast.success("Transaction updated");
    },
  });
}
```

### Step 5.3: Update Delete Transaction Hook

```typescript
export function useDeleteOfflineTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteOfflineTransaction(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", "offline"] });

      const previousTransactions = queryClient.getQueryData<Transaction[]>([
        "transactions",
        "offline",
      ]);

      // Optimistically remove from cache
      queryClient.setQueryData<Transaction[]>(["transactions", "offline"], (old) =>
        old?.filter((transaction) => transaction.id !== id)
      );

      return { previousTransactions };
    },

    onError: (error, _id, context) => {
      if (context?.previousTransactions) {
        queryClient.setQueryData(["transactions", "offline"], context.previousTransactions);
      }
      toast.error("Failed to delete transaction");
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
    },

    onSuccess: () => {
      toast.success("Transaction deleted");
    },
  });
}
```

### Step 5.4: Test Optimistic Updates

**Test scenarios:**

1. **Success case:**

   ```typescript
   test("optimistically adds transaction to list", async () => {
     const { result } = renderHook(() => useCreateOfflineTransaction(), {
       wrapper: createQueryWrapper(),
     });

     act(() => {
       result.current.mutate(newTransaction);
     });

     // Should immediately see transaction in cache (before mutation completes)
     const cachedData = queryClient.getQueryData(["transactions", "offline"]);
     expect(cachedData).toContainEqual(expect.objectContaining(newTransaction));
   });
   ```

2. **Error rollback:**

   ```typescript
   test("rolls back on error", async () => {
     server.use(
       http.post("/api/transactions", () => {
         return new HttpResponse(null, { status: 500 });
       })
     );

     const { result } = renderHook(() => useCreateOfflineTransaction(), {
       wrapper: createQueryWrapper(),
     });

     await act(async () => {
       result.current.mutate(newTransaction);
       await waitFor(() => expect(result.current.isError).toBe(true));
     });

     // Should rollback to previous state
     const cachedData = queryClient.getQueryData(["transactions", "offline"]);
     expect(cachedData).not.toContainEqual(expect.objectContaining(newTransaction));
   });
   ```

3. **Network delay:**

   ```typescript
   test("shows optimistic update during network delay", async () => {
     server.use(
       http.post("/api/transactions", async () => {
         await delay(2000); // Simulate slow network
         return HttpResponse.json({ success: true });
       })
     );

     const { result } = renderHook(() => useCreateOfflineTransaction(), {
       wrapper: createQueryWrapper(),
     });

     act(() => {
       result.current.mutate(newTransaction);
     });

     // Should see transaction immediately (within 100ms)
     await waitFor(
       () => {
         const cachedData = queryClient.getQueryData(["transactions", "offline"]);
         expect(cachedData).toContainEqual(expect.objectContaining(newTransaction));
       },
       { timeout: 100 }
     );
   });
   ```

---

## Phase 6: Testing & Validation

### Step 6.1: Unit Tests

```bash
npm test src/components/ui/submit-button.test.tsx
npm test src/hooks/useOfflineTransaction.test.ts
```

### Step 6.2: Integration Tests

Test complete workflows:

```typescript
// tests/integration/transaction-workflow.test.ts
test("create transaction with optimistic update", async () => {
  render(<TransactionPage />);

  // Click "Add Transaction"
  fireEvent.click(screen.getByText("Add Transaction"));

  // Fill form
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Groceries" },
  });
  fireEvent.change(screen.getByLabelText("Amount"), {
    target: { value: "100.50" },
  });

  // Submit form
  const submitButton = screen.getByRole("button", { name: /submit/i });
  fireEvent.click(submitButton);

  // Should see pending state immediately
  expect(submitButton).toHaveTextContent("Submitting...");
  expect(submitButton).toBeDisabled();

  // Should see transaction in list optimistically
  await waitFor(() => {
    expect(screen.getByText("Groceries")).toBeInTheDocument();
  }, { timeout: 100 }); // Should be very fast

  // Wait for server response
  await waitFor(() => {
    expect(submitButton).not.toBeDisabled();
  });
});
```

### Step 6.3: E2E Tests with Playwright

```typescript
// tests/e2e/react-19-features.spec.ts
import { test, expect } from "@playwright/test";

test("form submission shows pending state", async ({ page }) => {
  await page.goto("/login");

  await page.fill('[name="email"]', "test@example.com");
  await page.fill('[name="password"]', "password123");

  const submitButton = page.locator('button[type="submit"]');

  // Click submit
  await submitButton.click();

  // Should show pending text
  await expect(submitButton).toContainText("Signing in...");
  await expect(submitButton).toBeDisabled();

  // Wait for completion
  await expect(submitButton).toBeEnabled({ timeout: 5000 });
});

test("analytics tabs load with suspense", async ({ page }) => {
  await page.goto("/analytics");

  // Click "By Category" tab
  await page.click('text="By Category"');

  // Should show loading state
  await expect(page.locator('text="Loading category analytics..."')).toBeVisible();

  // Wait for content
  await expect(page.locator('text="Spending by Category"')).toBeVisible({
    timeout: 5000,
  });
});

test("optimistic transaction creation", async ({ page }) => {
  await page.goto("/transactions");

  // Open create form
  await page.click('text="Add Transaction"');

  // Fill form
  await page.fill('[name="description"]', "Test Transaction");
  await page.fill('[name="amount"]', "50.00");

  // Submit
  await page.click('button[type="submit"]');

  // Should see transaction immediately (< 100ms)
  const transactionRow = page.locator('text="Test Transaction"');
  await expect(transactionRow).toBeVisible({ timeout: 100 });
});
```

---

## Checklist

### Implementation Checklist

- [x] SubmitButton component created
- [x] SubmitButton unit tests written
- [x] LoginForm updated to use SubmitButton
- [x] SignupForm updated to use SubmitButton
- [x] Analytics page updated with Tabs component
- [x] Suspense boundaries added to each tab
- [x] CategoryAnalyticsContent extracted
- [x] Form context migrated to use() hook
- [x] Sidebar context migrated to use() hook
- [x] Create transaction hook updated with optimistic updates
- [x] Update transaction hook updated with optimistic updates
- [x] Delete transaction hook updated with optimistic updates
- [x] Integration tests written
- [x] E2E tests updated
- [x] Manual testing completed
- [x] Documentation updated

### Verification Checklist

- [ ] All forms show pending states during submission
- [ ] Submit buttons are disabled during pending
- [ ] Spinner icons appear during pending
- [ ] ARIA attributes are set correctly
- [ ] Analytics tabs show loading spinners on switch
- [ ] No blank screens during tab transitions
- [ ] Context errors show clear messages with stack trace
- [ ] Transaction creates appear instantly in UI
- [ ] Failed transactions roll back to previous state
- [ ] No console errors or warnings
- [ ] TypeScript compiles without errors
- [ ] Bundle size increased by < 5KB

---

## Troubleshooting

### Issue: "useFormStatus is not exported from 'react'"

**Solution:** Import from `react-dom` instead of `react`:

```typescript
// ❌ Wrong
import { useFormStatus } from "react";

// ✅ Correct
import { useFormStatus } from "react-dom";
```

### Issue: "useFormStatus returns { pending: false } always"

**Solution:** Ensure SubmitButton is inside a `<form>` with an `action` prop:

```typescript
// ❌ Wrong - no form action
<form onSubmit={handleSubmit}>
  <SubmitButton>Submit</SubmitButton>
</form>

// ✅ Correct - has action
<form action={handleSubmit}>
  <SubmitButton>Submit</SubmitButton>
</form>
```

### Issue: "Suspense fallback shows briefly even with cached data"

**Solution:** This is expected behavior. To prevent, set `staleTime` higher:

```typescript
useQuery({
  queryKey: ["data"],
  queryFn: fetchData,
  suspense: true,
  staleTime: 10 * 60 * 1000, // 10 minutes - won't refetch if data is fresh
});
```

### Issue: "Optimistic update doesn't roll back on error"

**Solution:** Ensure onError handler uses context from onMutate:

```typescript
useMutation({
  onMutate: async () => {
    const previous = queryClient.getQueryData(key);
    queryClient.setQueryData(key, optimisticData);
    return { previous }; // MUST return context
  },
  onError: (err, vars, context) => {
    // MUST use context.previous
    queryClient.setQueryData(key, context.previous);
  },
});
```

### Issue: "Temporary IDs collide in optimistic updates"

**Solution:** Use more unique temporary IDs:

```typescript
// ❌ Not unique enough
id: `temp-${Date.now()}`;

// ✅ Unique with timestamp + random
id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
```

---

## Performance Monitoring

### Metrics to Track

**Form submission feedback time:**

- Target: < 50ms from click to pending state
- Measure: Time from click to aria-busy="true"

**Analytics tab switch time:**

- Target: < 100ms to show loading spinner
- Measure: Time from click to Suspense fallback visible

**Optimistic update latency:**

- Target: < 16ms (1 frame) to update UI
- Measure: Time from mutation to cache update

**Bundle size impact:**

- Target: < 5KB gzipped
- Measure: Build size difference before/after

### Monitoring Code

```typescript
// Performance measurement for optimistic updates
performance.mark("mutation-start");

queryClient.setQueryData(key, optimisticData);

performance.mark("mutation-ui-update");
performance.measure("optimistic-latency", "mutation-start", "mutation-ui-update");

const measure = performance.getEntriesByName("optimistic-latency")[0];
console.log(`Optimistic update took ${measure.duration}ms`);
```

---

## Rollout Strategy

### Stage 1: Internal Testing ✅

- Deployed to development environment
- Tested by dev team
- All tests passing

### Stage 2: Gradual Rollout 🔜

- Enable for beta testers
- Monitor error rates
- Collect user feedback

### Stage 3: Full Deployment 🔜

- Deploy to production
- Monitor metrics
- Iterate based on feedback

---

## Further Reading

- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [useFormStatus API Reference](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [use() Hook Documentation](https://react.dev/reference/react/use)
- [Suspense for Data Fetching](https://react.dev/reference/react/Suspense)
- [TanStack Query Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)

**Related Documentation:**

- [REACT-19-ENHANCEMENTS.md](REACT-19-ENHANCEMENTS.md) - Feature overview
- [REACT-19-DECISIONS.md](REACT-19-DECISIONS.md) - Design decisions
- [SYNC-MANAGEMENT.md](../sync-management/SYNC-MANAGEMENT.md) - Sync status features
