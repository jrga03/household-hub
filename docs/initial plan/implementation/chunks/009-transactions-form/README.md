# Chunk 009: Transactions Form

## At a Glance

- **Time**: 120 minutes
- **Milestone**: MVP (6 of 10)
- **Prerequisites**: Chunks 001-008 (complete foundation required; focus on 005-008 for direct dependencies)
- **Can Skip**: No - core data entry interface

## What You're Building

Complete transaction entry system:

- Transaction form with all fields
- CurrencyInput integration for amounts
- Type selector (income/expense)
- Date picker (shadcn/ui)
- Account dropdown
- Category dropdown (hierarchical)
- Status toggle (pending/cleared)
- Description and notes
- Form validation with Zod
- Create and update functionality
- Transaction list view with filters

## Why This Matters

This is the **primary data entry interface** for the entire app. Users will interact with this form daily to track their expenses and income. It must be intuitive, fast, and error-free. This chunk brings together all previous components into a cohesive user experience.

## Scope of This Chunk

**Included in Chunk 009**:

- ✅ Complete transaction form UI
- ✅ Online-only CRUD operations (via Supabase)
- ✅ Basic transaction list display
- ✅ Form validation and error handling

**Deferred to Later Chunks** (by design):

- ❌ Offline transaction creation → **Chunk 021** (Offline Writes)
- ❌ Virtual scrolling for 10k+ rows → **Chunk 010** (Advanced Filtering)
- ❌ Advanced filters (search, date range) → **Chunk 010** (Advanced Filtering)
- ❌ Event sourcing integration → **Chunk 030** (Event Generation)
- ❌ Sync queue for offline changes → **Chunk 023** (Offline Writes Queue)

**Why This Separation?** The chunking strategy builds features layer-by-layer. Chunk 009 validates the UI and online data flow before adding offline complexity. This makes debugging easier: if something breaks, you know whether it's a UI issue or a sync issue.

## Before You Start

Make sure you have:

- Chunks 001-008 completed
- CurrencyInput component working (chunk 006)
- Categories seeded (chunk 007)
- Accounts seeded (chunk 005)
- Transactions schema ready (chunk 008)
- shadcn/ui components installed

**Full Dependency Chain**:

- Chunks 001-004: Project setup, auth, routing, accounts schema (foundational)
- Chunks 005-008: Accounts UI, currency system, categories, transactions schema (direct dependencies)

If you've been following chunks sequentially, all prerequisites are met.

## What Happens Next

After this chunk:

- Users can create transactions
- Users can edit existing transactions
- Form validates all inputs
- Currency formatting works correctly
- Categories and accounts selectable
- Transaction list displays properly
- Filters work (date, account, category)
- Status toggling functional
- **MVP core data entry complete!**

## Key Files Created

```
src/
├── routes/
│   └── transactions.tsx            # Main transactions page
├── components/
│   ├── TransactionForm.tsx         # Create/edit form
│   ├── TransactionFormDialog.tsx   # Dialog wrapper
│   ├── TransactionList.tsx         # List with filters
│   └── ui/
│       ├── date-picker.tsx         # Date selection
│       └── category-selector.tsx   # Hierarchical dropdown
└── lib/
    └── validations/
        └── transaction.ts          # Zod schema
```

## Features Included

### Transaction Form

- Amount input (CurrencyInput from chunk 006)
- Type selector (radio buttons: income/expense)
- Date picker (calendar component)
- Account dropdown (from chunk 005 data)
- Category dropdown (hierarchical from chunk 007)
- Description input (text)
- Notes textarea (optional)
- Status toggle (pending/cleared)
- Visibility selector (household/personal)

### Form Validation

- Amount required and positive
- Type required (income/expense)
- Date required and not in future
- Description required (min 3 chars)
- Account optional but recommended
- Category optional but recommended
- Real-time validation feedback
- Error messages clear and helpful

### Transaction List

- Table view with all fields
- Sorting (date, amount, description)
- Filtering (account, category, date range, status)
- Status toggle (click to mark cleared/pending)
- Edit button per row
- Delete confirmation
- Running balance display
- Pagination or infinite scroll

### User Experience

- Auto-focus on amount field
- Tab order logical
- Keyboard shortcuts (Ctrl+S to save)
- Loading states
- Success/error toasts
- Form clears after save
- Validation on blur and submit

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 5 (lines 211-236)
- **Original**: `docs/initial plan/DATABASE.md` lines 160-219 (transactions)
- **Original**: `docs/initial plan/CLAUDE.md` Transaction patterns
- **Decisions**:
  - #9: Amount storage (positive with type)
  - #60: Transfer representation (not in this chunk)
  - #71: Date vs timestamp
- **Components**: CurrencyInput, CategorySelector, AccountSelector

## Technical Stack

- **React Hook Form**: Form state management
- **Zod**: Validation schema
- **TanStack Query**: Server state
- **shadcn/ui**: UI components (Dialog, Select, DatePicker, Table)
- **TanStack Table**: Transaction list (future: TanStack Virtual for 10k+ rows)
- **Sonner**: Toast notifications

## Design Patterns

### Form State Pattern

```typescript
const form = useForm<TransactionFormData>({
  resolver: zodResolver(transactionSchema),
  defaultValues: {
    date: formatDate(new Date()),
    type: "expense",
    status: "pending",
    // ...
  },
});
```

### Controlled Components Pattern

```typescript
<Controller
  name="amount_cents"
  control={form.control}
  render={({ field }) => (
    <CurrencyInput {...field} />
  )}
/>
```

### Optimistic Updates Pattern

```typescript
// Show success immediately, sync in background
const createTransaction = useCreateTransaction({
  onSuccess: () => {
    toast.success("Transaction created");
    form.reset();
    onClose();
  },
});
```

---

**Ready?** → Open `instructions.md` to begin
