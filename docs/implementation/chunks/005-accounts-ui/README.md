# Chunk 005: Accounts UI

## At a Glance

- **Time**: 120 minutes
- **Milestone**: MVP (2 of 10)
- **Prerequisites**: Chunks 001-004 (complete foundation + accounts schema)
- **Can Skip**: No - this is the first feature users interact with

## What You're Building

Complete accounts management interface:

- Account list view with balances
- Create/edit account form
- Account type selector with icons
- Visibility toggle (household/personal)
- Initial balance input (PHP currency)
- Color picker for visual distinction
- Soft delete (archive accounts)

## Why This Matters

This is your first **real feature**. Users can finally create accounts and see them listed. It validates that your entire stack (database → Supabase → TanStack Query → React) works end-to-end.

## Before You Start

Make sure you have:

- Chunks 001-004 completed
- Accounts table exists in Supabase
- At least 3 test accounts in database
- Development server running

## What Happens Next

After this chunk:

- Users can view all their accounts
- Create new accounts (bank, credit card, cash, etc.)
- Edit account details
- Archive unused accounts
- See initial balances in PHP format
- Ready to add transactions (chunk 007)

## Key Files Created

```
src/
├── routes/
│   └── accounts.tsx                # Main accounts page
├── components/
│   ├── AccountList.tsx             # List view with TanStack Table
│   ├── AccountForm.tsx             # Create/edit form
│   ├── AccountCard.tsx             # Individual account card
│   └── CurrencyInput.tsx           # PHP amount input
├── lib/
│   ├── currency.ts                 # formatPHP, parsePHP utilities
│   └── supabaseQueries.ts          # TanStack Query hooks
└── types/
    └── accounts.ts                 # Account types (from chunk 004)
```

## Features Included

### Account List

- Table view with all accounts
- Shows name, type, balance, visibility
- Filter by visibility (household/personal)
- Sort by name, balance, or date created
- Color-coded type indicators

### Create Account Form

- Account name input
- Type selector (bank, credit card, cash, e-wallet, investment)
- Initial balance input (PHP currency format)
- Visibility toggle (household vs personal)
- Color picker (8 preset colors)
- Icon selector (10+ Lucide icons)

### Edit Account

- Reuses create form in edit mode
- Pre-fills existing values
- Can't change visibility after creation (data integrity)
- Updates timestamp automatically

### Archive Account

- Soft delete (sets `is_active = false`)
- Doesn't actually delete (preserves transaction history)
- Hidden from list by default
- Can restore if needed (future feature)

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 4 (lines 184-210)
- **Original**: `docs/initial plan/DATABASE.md` lines 1005-1160 (currency utilities)
- **Decisions**:
  - Currency utilities (#1): formatPHP, parsePHP
  - Soft delete (#45): Preserve history
  - TanStack Query for server state
- **Architecture**: `docs/initial plan/ARCHITECTURE.md` State management section

## Technical Stack

- **TanStack Query**: Server state management
- **React Hook Form**: Form handling
- **Zod**: Schema validation
- **shadcn/ui**: UI components (Button, Input, Dialog, Select)
- **Lucide Icons**: Icon library
- **Supabase**: Database queries via JavaScript client

## Design Patterns

### Server State Pattern

```typescript
// TanStack Query hook
const { data: accounts } = useAccounts();
```

### Form Pattern

```typescript
// React Hook Form + Zod
const form = useForm<AccountFormData>({
  resolver: zodResolver(accountSchema),
});
```

### Currency Pattern

```typescript
// Always store as cents, display as formatted
const displayAmount = formatPHP(account.initial_balance_cents);
const storedAmount = parsePHP(userInput);
```

---

**Ready?** → Open `instructions.md` to begin
