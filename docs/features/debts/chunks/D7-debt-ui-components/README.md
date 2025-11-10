# Chunk D7: Debt UI Components

## At a Glance

- **Time**: 1.5 hours
- **Prerequisites**: D1-D6 complete (database, logic, payments, reversals)
- **Can Skip**: No - users need to see their debts
- **Depends On**: shadcn/ui, Tailwind CSS v4, currency utilities, balance calculation

## What You're Building

Consumer-friendly UI components for debt display and management:

- **DebtCard**: Card-based debt display with balance, status, progress
- **DebtList**: Filterable list of debts with empty states
- **DebtStatusBadge**: Color-coded status indicators
- **DebtBalanceDisplay**: Formatted balance with visual cues
- **PaymentHistoryList**: Chronological payment timeline with reversals
- **DebtProgressBar**: Visual debt paydown progress
- **Empty states**: Encouraging messages for no debts/payments
- **Loading states**: Skeleton loaders for async data

## Why This Matters

UI components are the **user's window into their debt data**:

- **Clarity**: Users need to understand their debt status at a glance
- **Trust**: Clear formatting and accurate balances build confidence
- **Motivation**: Progress bars and paid-off celebrations encourage paydown
- **Accessibility**: WCAG 2.1 AA compliant for all users
- **Mobile-first**: Touch-friendly, responsive design
- **Error prevention**: Visual warnings for overpayments and negative balances

This chunk implements consumer-friendly debt display patterns.

## Before You Start

Verify these prerequisites:

- [ ] **shadcn/ui installed** - Card, Badge, Button, Progress components available
- [ ] **Currency utilities** exist (`formatPHP` from existing code or create)
- [ ] **Balance calculation** works (from D3)
- [ ] **Debt CRUD** operations available (from D4)
- [ ] **Tailwind CSS v4** configured

**How to verify**:

```bash
# Check shadcn/ui components
ls src/components/ui/card.tsx
ls src/components/ui/badge.tsx
ls src/components/ui/button.tsx

# Check currency utilities
grep -r "formatPHP" src/lib/
```

If `formatPHP` doesn't exist, you'll create it in Step 1.

## What Happens Next

After this chunk:

- Debts displayed in clean, card-based UI
- Users can see balances, status, progress at a glance
- Payment history shows complete audit trail
- Ready for Chunk D8 (Debt Forms)

## Key Files Created

```
src/
├── components/
│   └── debts/
│       ├── DebtCard.tsx                 # Card-based debt display
│       ├── DebtList.tsx                 # Filterable debt list
│       ├── DebtStatusBadge.tsx          # Status badge component
│       ├── DebtBalanceDisplay.tsx       # Formatted balance display
│       ├── DebtProgressBar.tsx          # Visual progress indicator
│       ├── PaymentHistoryList.tsx       # Payment timeline
│       └── __tests__/
│           └── DebtCard.test.tsx        # Component tests
└── lib/
    └── currency.ts                      # MAYBE CREATE: formatPHP utility
```

## Features Included

### DebtCard Component

**Visual hierarchy**:

- Debt name (H3, bold)
- Balance display (large, color-coded)
- Status badge (top-right corner)
- Progress bar (visual paydown)
- Quick actions (View Details, Make Payment)

**States**:

- Active (default)
- Paid Off (success green)
- Overpaid (warning amber)
- Archived (muted gray)

### DebtStatusBadge Component

**Status variants**:

- `active`: Blue badge, "Active"
- `paid_off`: Green badge, "Paid Off" with ✓
- `archived`: Gray badge, "Archived"

**Accessibility**: ARIA labels for screen readers

### DebtBalanceDisplay Component

**Features**:

- Formatted PHP currency (₱1,500.50)
- Color-coded:
  - Green: Paid off (₱0.00)
  - Red: Negative balance (overpaid)
  - Default: Normal balance
- Original amount shown in muted text
- Percentage paid indicator

### PaymentHistoryList Component

**Timeline features**:

- Chronological order (newest first)
- Payment amounts formatted
- Reversal indicators (strikethrough original, show reversal)
- Transaction links (click to view transaction)
- Device ID shown for debugging
- Empty state: "No payments yet"

### DebtProgressBar Component

**Visual feedback**:

- Percentage paid: (original - balance) / original \* 100
- Color gradient: Red → Amber → Green as progress increases
- Handles overpayments (show 100%+)
- Smooth animation on mount

## Related Documentation

- **UI Component Patterns**: CLAUDE.md lines 1-100 (shadcn/ui usage)
- **Currency Formatting**: DATABASE.md lines 1005-1160 (PHP format spec)
- **Accessibility Guidelines**: WCAG 2.1 AA compliance
- **Design Decisions**:
  - Consumer-friendly design over accounting complexity
  - Celebration of progress (paid off badges)
  - Visual warnings for overpayments

## Technical Stack

- **React 19**: Functional components with hooks
- **shadcn/ui**: Card, Badge, Button, Progress, Separator
- **Tailwind CSS v4**: Utility-first styling
- **TypeScript**: Full type safety
- **Vitest + Testing Library**: Component testing

## Design Patterns

### Compound Component Pattern

```tsx
<DebtCard debt={debt} balance={balance}>
  <DebtCard.Header>
    <DebtCard.Name>{debt.name}</DebtCard.Name>
    <DebtCard.Status status={debt.status} />
  </DebtCard.Header>

  <DebtCard.Balance balance={balance} originalAmount={debt.original_amount_cents} />

  <DebtCard.Progress
    paid={debt.original_amount_cents - balance}
    total={debt.original_amount_cents}
  />

  <DebtCard.Actions>
    <Button>View Details</Button>
    <Button>Make Payment</Button>
  </DebtCard.Actions>
</DebtCard>
```

**Why**: Flexible composition, clear hierarchy, easy to customize.

### Presentation/Container Pattern

```tsx
// Container (logic)
export function DebtListContainer() {
  const { data: debts, isLoading } = useQuery({
    queryKey: ["debts", householdId, "external"],
    queryFn: () => listDebts(householdId, "external"),
  });

  if (isLoading) return <DebtListSkeleton />;

  return <DebtList debts={debts} onDebtClick={handleClick} />;
}

// Presentation (UI only)
export function DebtList({ debts, onDebtClick }) {
  if (debts.length === 0) return <EmptyState />;

  return (
    <div className="grid gap-4">
      {debts.map((debt) => (
        <DebtCard key={debt.id} debt={debt} onClick={onDebtClick} />
      ))}
    </div>
  );
}
```

**Why**: Separation of concerns, testable presentation logic, reusable UI.

### Progressive Enhancement Pattern

```tsx
export function DebtBalanceDisplay({ balance, originalAmount }) {
  const percentage = ((originalAmount - balance) / originalAmount) * 100;

  return (
    <div>
      {/* Essential info (works without JS) */}
      <p className="text-3xl font-bold">{formatPHP(balance)}</p>

      {/* Enhanced info (JS required) */}
      {percentage > 0 && (
        <p className="text-sm text-muted-foreground">{percentage.toFixed(0)}% paid</p>
      )}
    </div>
  );
}
```

**Why**: Core functionality works without JS, enhanced experience with JS.

## Critical Concepts

**Currency Formatting Consistency**: ALL currency displays MUST use `formatPHP()` utility. Never format manually with `toFixed()` or string concatenation. This ensures:

- Consistent thousand separators (₱1,500.50)
- Correct PHP symbol (₱)
- Proper handling of negative amounts (₱-50.00 for overpayments)

**Color Semantics**: Use semantic colors consistently:

- Green/Success: Paid off, positive progress
- Red/Destructive: Negative balance, overpayment warning
- Blue/Primary: Active debt, default state
- Gray/Muted: Archived, secondary information
- Amber/Warning: Approaching milestones, soft warnings

**Accessibility Requirements**:

- Color is NOT the only indicator (use icons + text)
- Proper ARIA labels for status badges
- Keyboard navigation for all interactive elements
- Focus indicators visible
- Touch targets ≥44x44px on mobile

**Empty State Philosophy**: Empty states are **opportunities to guide users**, not dead ends:

- "No debts yet - create your first debt to start tracking"
- "No payments on this debt yet - make a payment to get started"
- Include helpful CTA buttons ("Create Debt", "Make Payment")

**Loading States**: Use skeleton loaders (not spinners) for better perceived performance:

- Match layout of loaded content
- Pulse animation
- Consistent with shadcn/ui patterns

## Component Examples

### DebtCard Variants

**Active Debt**:

```
┌─────────────────────────────────────┐
│ Car Loan                     Active │  ← Name + Status badge
│                                     │
│ ₱75,000.50                         │  ← Current balance (large)
│ of ₱100,000.00                     │  ← Original amount (muted)
│                                     │
│ ██████████░░░░░░ 75% paid          │  ← Progress bar
│                                     │
│ [View Details]  [Make Payment]     │  ← Actions
└─────────────────────────────────────┘
```

**Paid Off Debt**:

```
┌─────────────────────────────────────┐
│ Credit Card              ✓ Paid Off │  ← Green badge
│                                     │
│ ₱0.00                              │  ← Green text
│ of ₱50,000.00                      │
│                                     │
│ ████████████████ 100%              │  ← Full green bar
│                                     │
│ [View Details]  [Archive]          │
└─────────────────────────────────────┘
```

**Overpaid Debt**:

```
┌─────────────────────────────────────┐
│ Medical Bill                Active  │
│                                     │
│ ₱-5,000.00                         │  ← Red text (negative)
│ of ₱20,000.00                      │
│ ⚠ Overpaid by ₱5,000.00           │  ← Warning message
│                                     │
│ ████████████████ 125%              │  ← Over 100%
│                                     │
│ [View Details]  [Contact Support]  │
└─────────────────────────────────────┘
```

### PaymentHistoryList Example

```
Payment History
───────────────────────────────────────

Nov 10, 2025  ₱50,000.00
              Payment via Transaction #1234
              Device: abc-123

Nov 5, 2025   ₱50,000.00  (Reversed)
              Original payment

              ₱-50,000.00  REVERSAL
              Transaction edited

              ₱30,000.00
              New payment amount
              Device: abc-123

Oct 28, 2025  ₱20,000.00
              Initial payment
              Device: xyz-789
```

## Responsive Design

**Desktop (≥1024px)**:

- 3-column grid for debt cards
- Expanded payment history (all fields visible)
- Side-by-side actions

**Tablet (768px-1023px)**:

- 2-column grid for debt cards
- Condensed payment history
- Stacked actions

**Mobile (<768px)**:

- Single column for debt cards
- Minimal payment history (hide device ID)
- Full-width stacked actions
- Touch-optimized spacing (larger gaps)

## Performance Considerations

**Virtual Scrolling**: For households with 100+ debts, use TanStack Virtual:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

export function DebtList({ debts }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: debts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Estimated card height
  });

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((item) => (
          <DebtCard key={debts[item.index].id} debt={debts[item.index]} />
        ))}
      </div>
    </div>
  );
}
```

**Memoization**: Memoize expensive calculations:

```tsx
const percentage = useMemo(
  () => ((originalAmount - balance) / originalAmount) * 100,
  [originalAmount, balance]
);
```

**Lazy Loading**: Load payment history only when expanded:

```tsx
const [isExpanded, setIsExpanded] = useState(false);

{
  isExpanded && <PaymentHistoryList debtId={debt.id} />;
}
```

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
