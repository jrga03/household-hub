# Chunk 008: Transactions Schema

## At a Glance

- **Time**: 85 minutes (includes indexes, triggers, and verification)
- **Milestone**: MVP (5 of 10)
- **Prerequisites**: Chunks 004 (accounts), 006 (currency-system), 007 (categories)
- **Can Skip**: No - core data model

## What You're Building

Transaction data foundation:

- Verify transactions table schema (should exist from chunk 004)
- Create TypeScript types for transactions
- Define RLS policies for household/personal visibility
- Create query hooks for TanStack Query
- Seed 20+ test transactions with realistic data
- Document transaction patterns and constraints

## Why This Matters

Transactions are the **heart of the financial tracking system**. The schema must handle:

- Always-positive amounts with explicit type (income/expense)
- Transfer pairs with transfer_group_id
- Date as DATE type (user's local date is canonical)
- Status tracking (pending/cleared)
- User tagging and notes
- Import deduplication via import_key

Getting this right prevents data integrity issues later.

## Before You Start

Make sure you have:

- Chunks 004-007 completed
- Accounts table exists with seed data
- Categories table exists with seed data
- Currency utilities exist (formatPHP, parsePHP, validateAmount)
- Understanding of DATABASE.md transaction schema

## What Happens Next

After this chunk:

- Transactions table ready for use
- TypeScript types enforce data integrity
- RLS policies protect user data
- Query hooks ready for forms
- Test data available for UI development
- Ready to build transaction form (chunk 009)

## Key Files Created

```
src/
├── types/
│   └── transactions.ts             # Transaction types + constants
├── lib/
│   └── supabaseQueries.ts          # Transaction query hooks
└── scripts/
    └── seed-transactions.sql       # 20+ test transactions
```

## Features Included

### Transaction Types

- Core Transaction interface
- TransactionInsert for creation
- TransactionUpdate for modifications
- Transfer pair types
- Status and visibility enums

### RLS Policies

- Household transactions: Visible to all
- Personal transactions: Scoped to creator
- Transfer integrity preserved
- Audit trail accessible

### Query Patterns

- Fetch all transactions (with pagination)
- Filter by account, category, date range
- Filter by status (pending/cleared)
- Exclude transfers from analytics
- Calculate running balances

### Seed Data

- 20+ realistic transactions
- Mix of income/expense
- Various categories
- Some transfers
- Different accounts
- Date range (last 30 days)

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md`
  - Lines 160-198: transactions table schema
  - Lines 200-218: performance indexes (12 single + 4 compound)
  - Lines 389-471: transfer integrity constraints
  - Lines 1071-1213: query index map (hot queries)
- **Decisions**:
  - #9: Positive amounts with type field (DECISIONS.md lines 123-129)
  - #60: Transfer representation as linked pairs (DECISIONS.md lines 659-670)
  - #64: Use indexes (not materialized views) for MVP performance
  - DATABASE.md lines 999-1010: Date vs timestamp strategy (DATE type rationale)
- **Patterns**: Always exclude transfers from analytics (`WHERE transfer_group_id IS NULL`)

## Technical Stack

- **PostgreSQL**: Database
- **Supabase**: Client library
- **TanStack Query**: Query hooks
- **TypeScript**: Type safety
- **Zod**: Runtime validation (optional)

## Design Patterns

### Amount Storage Pattern

```typescript
// Always positive with explicit type
{
  amount_cents: 150050,  // Always >= 0
  type: 'expense'        // or 'income'
}
```

### Transfer Pattern

```typescript
// Two linked transactions
{
  id: 'uuid-1',
  amount_cents: 50000,
  type: 'expense',
  account_id: 'from-account',
  transfer_group_id: 'shared-uuid'
}
{
  id: 'uuid-2',
  amount_cents: 50000,
  type: 'income',
  account_id: 'to-account',
  transfer_group_id: 'shared-uuid'  // Same group
}
```

### Date Strategy Pattern

```typescript
// Transaction date: User's local date
date: "2024-01-15"; // DATE type, not TIMESTAMPTZ

// Audit timestamps: Server UTC
created_at: "2024-01-15T14:30:00Z"; // TIMESTAMPTZ
updated_at: "2024-01-15T14:30:00Z";
```

---

**Ready?** → Open `instructions.md` to begin
