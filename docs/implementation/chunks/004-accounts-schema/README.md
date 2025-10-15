# Chunk 004: Accounts Schema

## At a Glance

- **Time**: 45 minutes
- **Milestone**: MVP (1 of 10)
- **Prerequisites**: Chunks 001 (Project Setup), 002 (Auth Flow)
- **Can Skip**: No - required for all financial tracking

## What You're Building

Database schema for financial accounts:

- Accounts table with proper constraints
- Indexes for query performance
- RLS policies for household/personal visibility
- TypeScript types auto-generated
- Test data seeded

## Why This Matters

Accounts are the foundation of financial tracking. Every transaction belongs to an account. Getting the schema right now means no painful migrations later.

## Before You Start

Make sure you have:

- Chunk 002 completed (Supabase project exists)
- Supabase CLI installed (`npx supabase --help`)
- Database credentials from chunk 002

## What Happens Next

After this chunk:

- `accounts` table exists in Supabase
- Row-level security protects data
- TypeScript knows account shape
- Ready to build accounts UI (chunk 005)
- Can store bank accounts, credit cards, cash accounts

## Key Files Created

```
supabase/
├── migrations/
│   └── 20250115000000_create_accounts.sql   # Accounts table
└── seed.sql                                  # Test data

src/
└── types/
    └── database.types.ts                     # Auto-generated types
```

## Database Design

### Accounts Table Fields

- **id**: UUID primary key
- **household_id**: Links to household (default for MVP)
- **name**: Account name (e.g., "BPI Savings", "Cash Wallet")
- **type**: Account type (bank, credit_card, cash, investment)
- **initial_balance_cents**: Starting balance in centavos
- **currency_code**: PHP only for MVP
- **visibility**: household (shared) or personal (private)
- **owner_user_id**: Owner for personal accounts
- **color**: Hex color for UI (#3B82F6)
- **icon**: Lucide icon name (building-2, wallet, credit-card)
- **sort_order**: Display order
- **is_active**: Soft delete flag
- **timestamps**: created_at, updated_at

### Why These Fields?

- **Cents storage**: Avoid floating-point errors (₱1,500.50 = 150050 cents)
- **Visibility**: Shared household accounts vs personal accounts
- **Soft delete**: Keep history, don't actually delete
- **Color/icon**: Better UX in account lists
- **Sort order**: User controls display order

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md` lines 105-131 (accounts schema)
- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 4 (lines 184-210)
- **Decisions**:
  - Currency in cents (#1): Exact precision, no decimal errors
  - PHP only for MVP: Multi-currency in Phase 2
  - Soft delete (#45): Preserve transaction history
- **Architecture**: `docs/initial plan/ARCHITECTURE.md` Database section

## Security (RLS Policies)

### Household Accounts

- Visible to ALL authenticated users
- Anyone can create/edit household accounts

### Personal Accounts

- Visible ONLY to owner (owner_user_id = current user)
- Only owner can edit/delete

---

**Ready?** → Open `instructions.md` to begin
