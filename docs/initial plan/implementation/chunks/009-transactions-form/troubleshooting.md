# Troubleshooting: Transactions Form

Common issues with the transaction form.

---

## Form Issues

### Problem: Dialog doesn't open

**Cause**: State management issue or button handler

**Solution**:

```typescript
const [isFormOpen, setIsFormOpen] = useState(false);

// Make sure button calls this
<Button onClick={() => setIsFormOpen(true)}>
```

---

### Problem: Form doesn't close after save

**Cause**: Missing onClose callback or onSuccess

**Solution**:

```typescript
const createTransaction = useCreateTransaction({
  onSuccess: () => {
    toast.success("Transaction created");
    form.reset();
    onClose(); // ← Must call this
  },
});
```

---

### Problem: Amount shows NaN or undefined

**Cause**: Currency parsing error

**Solution**:
Check CurrencyInput integration:

```typescript
<Controller
  name="amount_cents"
  control={form.control}
  render={({ field }) => (
    <CurrencyInput
      {...field}
      value={field.value} // ← Ensure value prop passed
      onChange={field.onChange} // ← Ensure onChange passed
    />
  )}
/>
```

---

## Validation Issues

### Problem: Can submit form with invalid data

**Cause**: Zod schema not applied

**Solution**:

```typescript
const form = useForm<TransactionFormData>({
  resolver: zodResolver(transactionSchema), // ← Must be here
  // ...
});
```

---

### Problem: Date validation not working

**Cause**: Future dates not disabled

**Solution**:
In DatePicker component:

```typescript
<Calendar
  mode="single"
  selected={value}
  onSelect={onChange}
  disabled={(date) => date > new Date()} // ← Add this
/>
```

---

## Category Selector Issues

### Problem: Categories not showing

**Cause**: Query not loading or RLS

**Solution**:

```typescript
const { data: categories, isLoading, error } = useCategoriesGrouped();

console.log("Categories:", categories);
console.log("Error:", error);

// If error, check RLS policies
// If empty, check seed data
```

---

### Problem: Can't select parent categories

**Expected Behavior**: This is correct! Only child categories should be selectable.

**Verify**:

```typescript
// In CategorySelector, groups should use SelectLabel not SelectItem
<SelectGroup key={parent.id}>
  <SelectLabel>{parent.name}</SelectLabel> {/* ← Not selectable */}
  {parent.children.map((child) => (
    <SelectItem key={child.id} value={child.id}> {/* ← Selectable */}
      {child.name}
    </SelectItem>
  ))}
</SelectGroup>
```

---

## Date Issues

### Problem: Date saves wrong day

**Cause**: Timezone conversion error

**Solution**:

```typescript
// In form submit:
const transactionData = {
  date: format(data.date, "yyyy-MM-dd"), // ← Use this format
  // NOT: data.date.toISOString() ← Wrong!
};
```

---

### Problem: Date shows as "Invalid Date"

**Cause**: Date parsing error when editing

**Solution**:

```typescript
// When loading for edit:
import { parseISO } from "date-fns";

form.reset({
  date: parseISO(transaction.date), // ← Parse DATE string to Date object
  // ...
});
```

---

## List Display Issues

### Problem: Amount colors don't show

**Cause**: Conditional className not working

**Solution**:

```typescript
<TableCell
  className={
    transaction.type === "income"
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400"
  }
>
  {transaction.type === "income" ? "+" : "-"}
  {formatPHP(transaction.amount_cents)}
</TableCell>
```

---

### Problem: Status icon doesn't toggle

**Cause**: Mutation not working or not invalidating

**Solution**:

```typescript
export function useToggleTransactionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // ... toggle logic
    },
    onSuccess: () => {
      // ← CRITICAL: Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
```

---

## Edit Issues

### Problem: Edit doesn't load existing data

**Cause**: useEffect dependencies or transaction not found

**Solution**:

```typescript
useEffect(() => {
  if (editingId && transactions && open) {
    // ← Add 'open' check
    const transaction = transactions.find((t) => t.id === editingId);
    if (transaction) {
      form.reset({
        date: parseISO(transaction.date),
        // ... other fields
      });
    }
  }
}, [editingId, transactions, open, form]); // ← Include all dependencies
```

---

## Performance Issues

### Problem: Form feels slow

**Cause**: Too many re-renders

**Solution**:
Use Controller for form fields:

```typescript
// NOT this:
<Input {...form.register("description")} />

// Use this:
<Controller
  name="description"
  control={form.control}
  render={({ field }) => <Input {...field} />}
/>
```

---

## Toast Notifications

### Problem: Toasts don't show

**Cause**: Sonner not configured

**Solution**:
In `src/main.tsx`:

```typescript
import { Toaster } from "sonner";

// Add to render:
<Toaster position="top-right" />
```

---

## Account/Category Missing

### Problem: Dropdowns show "—" instead of names

**Cause**: Join query not including related data

**Solution**:

```typescript
// In useTransactions query:
const { data, error } = await supabase.from("transactions").select(`
    *,
    account:accounts(id, name), // ← Include account
    category:categories(id, name, color) // ← Include category
  `);
```

---

## Quick Fixes

```bash
# Clear React Query cache
# In browser console:
queryClient.clear();

# Force refetch transactions
queryClient.invalidateQueries({ queryKey: ["transactions"] });

# Reset form
form.reset();

# Check form state
console.log(form.getValues());
console.log(form.formState.errors);
```

---

**Remember**: Transaction form is the core data entry. Test thoroughly!
