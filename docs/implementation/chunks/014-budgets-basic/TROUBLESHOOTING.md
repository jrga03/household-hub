# Troubleshooting: Budgets Basic

Common issues with the budget system and solutions.

---

## Data Loading Issues

### Problem: Budgets not loading

**Cause**: Query error or missing permissions

**Solution**:

```typescript
// Check query error in useBudgets:
const { data, isLoading, error } = useBudgets(currentMonth);

if (error) {
  console.error("Budget query error:", error);
}

// Verify RLS policies allow reading budgets table
// Check Supabase dashboard → Authentication → Policies
```

---

### Problem: Budget data shows but actual spending is zero

**Cause**: Transfer inclusion or wrong date range

**Solution**:

```typescript
// CRITICAL: Always exclude transfers from actual spending
const { data: transactions } = await supabase
  .from("transactions")
  .select("category_id, amount_cents")
  .in("category_id", categoryIds)
  .is("transfer_group_id", null) // ← CRITICAL
  .eq("type", "expense")
  .gte("date", monthStart)
  .lte("date", monthEnd);

// Verify date range matches selected month:
console.log("Month start:", monthStart);
console.log("Month end:", monthEnd);
console.log("Transactions found:", transactions?.length);
```

---

## Transfer Inclusion Issues

### Problem: Actual spending too high

**Cause**: Transfers being counted as expenses

**Solution**:

```typescript
// CORRECT - Exclude transfers everywhere:
const { data: expenses } = await supabase
  .from("transactions")
  .select("amount_cents")
  .is("transfer_group_id", null) // ✓ Exclude transfers
  .eq("type", "expense")
  .eq("category_id", categoryId);

// WRONG:
const { data: expenses } = await supabase
  .from("transactions")
  .select("amount_cents")
  // ❌ Missing transfer exclusion
  .eq("type", "expense")
  .eq("category_id", categoryId);
```

**Remember**: Budgets track actual spending, transfers are NOT spending!

---

## Budget Creation Issues

### Problem: Can't create budget for parent category

**Cause**: Form allows selecting parent categories

**Solution**:

```typescript
// CORRECT - Filter to child categories only:
const childCategories = categories.filter((cat) => cat.parent_id !== null);

<select>
  {parents.map((parent) => (
    <optgroup key={parent.id} label={parent.name}>
      {parent.children.map((child) => (
        <option value={child.id}>{child.name}</option>
      ))}
    </optgroup>
  ))}
</select>

// WRONG:
<select>
  {categories.map((cat) => (
    <option value={cat.id}>{cat.name}</option>
    // ❌ Includes parents
  ))}
</select>
```

---

### Problem: Duplicate budget error not showing

**Cause**: Unique constraint not caught or poor error handling

**Solution**:

```typescript
// Check for existing budget before creating:
const { data: existing } = await supabase
  .from("budgets")
  .select("id")
  .eq("household_id", householdId)
  .eq("month", monthKey)
  .eq("category_id", categoryId)
  .single();

if (existing) {
  throw new Error("Budget already exists for this category this month. Try editing instead.");
}

// Or handle Postgres unique constraint error:
try {
  await supabase.from("budgets").insert(newBudget);
} catch (error) {
  if (error.code === "23505") {
    // Unique violation
    toast.error("Budget already exists for this category");
  }
}
```

---

## Budget vs Actual Calculation Issues

### Problem: Percentage calculation wrong

**Cause**: Incorrect math or division by zero

**Solution**:

```typescript
// CORRECT - Check for zero budget:
const percentUsed = budgetAmountCents > 0 ? (actualSpentCents / budgetAmountCents) * 100 : 0; // ✓ Return 0 if no budget

const isOverBudget = actualSpentCents > budgetAmountCents;

// Test cases:
// Budget: 5000, Spent: 3000 → 60.0%
// Budget: 5000, Spent: 5000 → 100.0%
// Budget: 5000, Spent: 6000 → 120.0% (over budget)
// Budget: 0, Spent: 1000 → 0% (avoid division by zero)
```

---

### Problem: Remaining amount shows negative

**Cause**: Not handling over-budget scenario

**Solution**:

```typescript
// CORRECT - Show zero when over budget:
const remainingCents = Math.max(0, budgetAmountCents - actualSpentCents);

// Or show negative explicitly:
const remainingCents = budgetAmountCents - actualSpentCents;
const displayRemaining =
  remainingCents >= 0
    ? `${formatPHP(remainingCents)} remaining`
    : `${formatPHP(Math.abs(remainingCents))} over budget`;
```

---

## Progress Bar Issues

### Problem: Progress bar color wrong

**Cause**: Color logic inverted or wrong thresholds

**Solution**:

```typescript
// CORRECT:
const getProgressColor = (percentUsed: number, isOverBudget: boolean) => {
  if (isOverBudget) return "bg-red-500"; // ✓ Over budget = red
  if (percentUsed >= 80) return "bg-yellow-500"; // ✓ Warning = yellow
  return "bg-green-500"; // ✓ Under budget = green
};

// WRONG:
const getProgressColor = (percentUsed: number) => {
  if (percentUsed < 50) return "bg-red-500"; // ❌ Backwards!
  if (percentUsed < 80) return "bg-yellow-500";
  return "bg-green-500";
};
```

---

### Problem: Progress bar exceeds 100%

**Cause**: Not capping percentage display

**Solution**:

```typescript
// CORRECT - Cap at 100% for visual display:
<Progress
  value={Math.min(percentUsed, 100)}  // ✓ Cap at 100
  className={getProgressColor()}
/>

// Still show actual percentage in text:
<p className="text-sm">
  {percentUsed.toFixed(1)}% used  {/* Can be >100% */}
</p>
```

---

### Problem: Progress bar not updating after transactions

**Cause**: Cache not invalidating

**Solution**:

```typescript
// After transaction mutation:
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();

// Invalidate budgets cache:
await queryClient.invalidateQueries({
  queryKey: ["budgets"],
});
```

---

## Form Validation Issues

### Problem: Can submit budget with zero amount

**Cause**: Validation not enforcing minimum

**Solution**:

```typescript
// Zod schema with proper constraints:
const budgetSchema = z.object({
  categoryId: z.string().min(1, "Category required"),
  amountCents: z
    .number()
    .min(1, "Amount must be greater than zero") // ✓ Minimum 1 cent
    .max(99999999999, "Amount too large"), // ✓ Max limit
});

// In form:
const form = useForm<z.infer<typeof budgetSchema>>({
  resolver: zodResolver(budgetSchema),
  defaultValues: {
    categoryId: "",
    amountCents: 0,
  },
});
```

---

### Problem: Amount input not converting to cents

**Cause**: Missing parsePHP utility

**Solution**:

```typescript
import { parsePHP, formatPHP } from "@/lib/currency";

// Parse user input (PHP string) to cents:
<Input
  type="text"
  placeholder="5,000.00"
  onChange={(e) => {
    const cents = parsePHP(e.target.value);
    form.setValue("amountCents", cents);
  }}
/>

// Format cents back to PHP for display:
<Input
  value={formatPHP(form.watch("amountCents"))}
  // ...
/>
```

---

## Copy Previous Month Issues

### Problem: Copy button doesn't work

**Cause**: Wrong month calculation or no previous budgets

**Solution**:

```typescript
import { addMonths, subMonths, format } from "date-fns";

// CORRECT - Get previous month:
const previousMonth = subMonths(currentMonth, 1);
const previousMonthKey = format(previousMonth, "yyyy-MM");

// Fetch previous month's budgets:
const { data: previousBudgets } = await supabase
  .from("budgets")
  .select("category_id, amount_cents")
  .eq("household_id", householdId)
  .eq("month", previousMonthKey);

if (!previousBudgets || previousBudgets.length === 0) {
  toast.error("No budgets found for previous month");
  return;
}

// Copy to current month:
const newBudgets = previousBudgets.map((budget) => ({
  household_id: householdId,
  month: format(currentMonth, "yyyy-MM"),
  category_id: budget.category_id,
  amount_cents: budget.amount_cents,
}));

await supabase.from("budgets").insert(newBudgets);
```

---

### Problem: Copy button enabled when budgets already exist

**Cause**: Not checking for existing budgets

**Solution**:

```typescript
// Check if current month has budgets:
const { data: existingBudgets } = await supabase
  .from("budgets")
  .select("id")
  .eq("household_id", householdId)
  .eq("month", currentMonthKey);

const hasBudgets = existingBudgets && existingBudgets.length > 0;

// Disable button:
<Button
  onClick={copyPreviousMonth}
  disabled={hasBudgets}  // ✓ Disable if budgets exist
>
  {hasBudgets ? "Budgets Already Set" : "Copy Previous Month"}
</Button>
```

---

## Parent Category Grouping Issues

### Problem: Budgets not grouped by parent

**Cause**: Not organizing budgets hierarchically

**Solution**:

```typescript
// Group budgets by parent category:
const groupedBudgets: BudgetGroup[] = parentCategories.map((parent) => {
  const childBudgets = budgets.filter(
    (budget) => budget.category.parent_id === parent.id
  );

  const totalBudget = childBudgets.reduce(
    (sum, b) => sum + b.budget_amount_cents,
    0
  );

  const totalSpent = childBudgets.reduce(
    (sum, b) => sum + b.actual_spent_cents,
    0
  );

  return {
    parent: parent,
    budgets: childBudgets,
    totalBudgetCents: totalBudget,
    totalSpentCents: totalSpent,
    percentUsed: (totalSpent / totalBudget) * 100,
  };
});

// Display:
{groupedBudgets.map((group) => (
  <div key={group.parent.id}>
    <h3>{group.parent.name}</h3>
    <p>{formatPHP(group.totalSpentCents)} of {formatPHP(group.totalBudgetCents)}</p>
    {group.budgets.map((budget) => (
      <BudgetCard key={budget.id} budget={budget} />
    ))}
  </div>
))}
```

---

## Edit Budget Issues

### Problem: Can't change category when editing

**Cause**: Category field not disabled

**Solution**:

```typescript
// In edit mode, disable category selector:
<Select
  value={form.watch("categoryId")}
  onValueChange={(value) => form.setValue("categoryId", value)}
  disabled={!!existingBudget}  // ✓ Disable when editing
>
  {/* category options */}
</Select>

// Show helper text:
{existingBudget && (
  <p className="text-xs text-muted-foreground">
    Category cannot be changed. Delete and create new budget to change category.
  </p>
)}
```

---

### Problem: Edit form doesn't pre-fill values

**Cause**: Form not initialized with existing data

**Solution**:

```typescript
// Pre-fill form when editing:
useEffect(() => {
  if (existingBudget) {
    form.reset({
      categoryId: existingBudget.category_id,
      amountCents: existingBudget.amount_cents,
    });
  }
}, [existingBudget, form]);

// Or in form default values:
const form = useForm<BudgetFormValues>({
  resolver: zodResolver(budgetSchema),
  defaultValues: existingBudget
    ? {
        categoryId: existingBudget.category_id,
        amountCents: existingBudget.amount_cents,
      }
    : {
        categoryId: "",
        amountCents: 0,
      },
});
```

---

## Delete Budget Issues

### Problem: Delete doesn't show confirmation

**Cause**: Missing confirmation dialog

**Solution**:

```typescript
import { AlertDialog } from "@/components/ui/alert-dialog";

const [deleteId, setDeleteId] = useState<string | null>(null);

// Trigger confirmation:
<Button onClick={() => setDeleteId(budget.id)}>Delete</Button>

// Confirmation dialog:
<AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
  <AlertDialogContent>
    <AlertDialogTitle>Delete Budget?</AlertDialogTitle>
    <AlertDialogDescription>
      This will permanently delete this budget. Spending data will not be affected.
    </AlertDialogDescription>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Month Navigation Issues

### Problem: Budgets don't update when changing months

**Cause**: Query key not including month

**Solution**:

```typescript
// CORRECT - Include month in query key:
return useQuery({
  queryKey: ["budgets", format(currentMonth, "yyyy-MM")],
  queryFn: async () => {
    /* ... */
  },
});

// WRONG:
return useQuery({
  queryKey: ["budgets"], // ❌ Static key
  queryFn: async () => {
    /* ... */
  },
});
```

---

### Problem: Can create budgets for past months

**Cause**: Not validating month selection

**Solution**:

```typescript
// Allow creating budgets for current and future months only:
const canCreateBudget = (month: Date) => {
  const currentMonthKey = format(new Date(), "yyyy-MM");
  const selectedMonthKey = format(month, "yyyy-MM");
  return selectedMonthKey >= currentMonthKey;
};

// Or allow past months (flexible budgeting):
// No restriction needed, users can budget retroactively
```

---

## Empty State Issues

### Problem: Empty state not showing

**Cause**: Not checking for empty array

**Solution**:

```typescript
// Check for empty budgets:
if (!budgets || budgets.length === 0) {
  return (
    <Card className="p-6">
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">
          No budgets for this month
        </h3>
        <p className="text-muted-foreground mb-4">
          Set spending targets to track your progress
        </p>
        <Button onClick={openBudgetForm}>
          Add Budget
        </Button>
      </div>
    </Card>
  );
}

return <BudgetList budgets={budgets} />;  // ✓ Only when data exists
```

---

## Currency Formatting Issues

### Problem: Budget amounts showing as raw numbers

**Cause**: Not using formatPHP utility

**Solution**:

```typescript
import { formatPHP } from "@/lib/currency";

// CORRECT:
<h3>{formatPHP(budget.amount_cents)}</h3>

// WRONG:
<h3>{budget.amount_cents}</h3>  // Shows "500000" instead of "₱5,000.00"
<h3>₱{(budget.amount_cents / 100).toFixed(2)}</h3>  // Missing thousands separator
```

---

## Performance Issues

### Problem: Budget page slow to load

**Cause**: Multiple separate queries instead of single join

**Solution**:

```typescript
// GOOD - Single query with joins:
const { data: budgets } = await supabase
  .from("budgets")
  .select(
    `
    *,
    category:categories(id, name, color, parent_id)
  `
  )
  .eq("month", monthKey);

// BAD - Multiple queries:
const { data: budgets } = await supabase.from("budgets").select("*");
const { data: categories } = await supabase.from("categories").select("*");
// Too many round trips!
```

---

### Problem: Budget calculations slow with many categories

**Cause**: N+1 query problem

**Solution**:

```typescript
// Fetch all transactions at once:
const { data: allTransactions } = await supabase
  .from("transactions")
  .select("category_id, amount_cents")
  .in("category_id", categoryIds) // ✓ Batch query
  .is("transfer_group_id", null)
  .eq("type", "expense")
  .gte("date", monthStart)
  .lte("date", monthEnd);

// Group by category in memory:
const spendingMap = new Map<string, number>();
allTransactions?.forEach((t) => {
  const current = spendingMap.get(t.category_id) || 0;
  spendingMap.set(t.category_id, current + t.amount_cents);
});

// Apply to budgets:
budgets.forEach((budget) => {
  budget.actual_spent_cents = spendingMap.get(budget.category_id) || 0;
});
```

---

## Type Issues

### Problem: TypeScript errors on budget properties

**Cause**: Missing or incorrect types

**Solution**:

```typescript
// Define budget types:
interface Budget {
  id: string;
  household_id: string;
  month: string; // Format: "yyyy-MM"
  category_id: string;
  amount_cents: number;
  created_at: string;
  updated_at: string;
}

interface BudgetWithActual extends Budget {
  category: {
    id: string;
    name: string;
    color: string;
    parent_id: string | null;
  };
  actual_spent_cents: number;
  remaining_cents: number;
  percent_used: number;
  is_over_budget: boolean;
}

interface BudgetGroup {
  parent: Category;
  budgets: BudgetWithActual[];
  total_budget_cents: number;
  total_spent_cents: number;
  percent_used: number;
}
```

---

## Quick Fixes

```bash
# Force refetch budget data
# In browser console:
queryClient.invalidateQueries({ queryKey: ["budgets"] });

# Verify transfer exclusion
# Check query in network tab for:
# "transfer_group_id.is.null"

# Test budget calculation
const manualSpent = transactions
  .filter(t => t.category_id === categoryId && t.type === "expense")
  .reduce((sum, t) => sum + t.amount_cents, 0);
console.log("Manual spent:", manualSpent);
console.log("Query spent:", budget.actual_spent_cents);
console.log("Match:", manualSpent === budget.actual_spent_cents);

# Verify month range
const monthStart = startOfMonth(currentMonth);
const monthEnd = endOfMonth(currentMonth);
console.log("Querying range:", format(monthStart, "yyyy-MM-dd"), "to", format(monthEnd, "yyyy-MM-dd"));
```

---

## Common Mistakes Checklist

- [ ] Not excluding transfers from actual spending
- [ ] Division by zero in percentage calculations
- [ ] Allowing parent categories in budget creation
- [ ] Not disabling category field when editing
- [ ] Missing unique constraint handling
- [ ] Query key doesn't include month
- [ ] Not handling empty budgets array
- [ ] Wrong progress bar color thresholds
- [ ] Not using formatPHP for currency
- [ ] Missing cache invalidation after mutations
- [ ] Copy button not checking for existing budgets

---

**Remember**:

1. **Always exclude transfers** from budget actual spending (`WHERE transfer_group_id IS NULL`)
2. **Only child categories** can have budgets (not parents)
3. **Budget = target only**, actual always calculated from transactions
4. **Check for zero** before division (percentage calculations)
5. **One budget per category per month** (enforce unique constraint)

---

**Need more help?** Check:

- DATABASE.md lines 265-294 (Budgets table schema)
- DATABASE.md lines 227-239 (Budget vs Actual query)
- IMPLEMENTATION-PLAN.md Day 7 (Budget UI requirements)
- DECISIONS.md #79 (Budgets are reference targets), #12 (Budget system clarified)
