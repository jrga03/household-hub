# Chunk 015: Budgets Schema

## At a Glance

- **Time**: 30 minutes
- **Milestone**: MVP (Optional)
- **Prerequisites**: Chunk 007 (categories setup)
- **Can Skip**: Yes - budgets are optional

## What You're Building

Database schema for monthly budget tracking:

- Budgets table with month-based organization
- Performance-optimized month_key field (YYYYMM format)
- RLS policies for household budget access
- Indexes for efficient monthly queries
- Budget as "reference target only" (no rollover)

## Why This Matters

Budgets help users track spending against monthly targets. The schema uses a **reference-only model** where budgets store target amounts, and actual spending is always calculated from transactions. This prevents balance drift and keeps data integrity simple.

## Before You Start

Make sure you have:

- Chunk 007 completed (categories exist)
- Supabase CLI installed and configured
- Database migrations working
- Understanding of DATE type for months

## What Happens Next

After this chunk:

- Monthly budget targets can be created per category
- Budget vs actual calculations ready
- Month-based queries optimized with month_key
- Ready for Chunk 016 (budgets UI)

## Key Files Created

```
supabase/
└── migrations/
    └── YYYYMMDDHHMMSS_create_budgets_table.sql
```

## Features Included

### Budgets Table

- **month** (DATE): First day of month (stored in UTC, displayed in user timezone)
- **month_key** (INT): Generated YYYYMM for fast queries
- **category_id**: Link to category for this budget
- **amount_cents**: Target spending amount (always positive)
- **currency_code**: PHP only for MVP
- **household_id**: Multi-household support (default household for now)

### Performance Optimizations

- Generated column `month_key` for integer-based month queries
- Compound index on `(household_id, month_key)` for dashboard queries
- Unique constraint prevents duplicate budgets per category per month

### Data Integrity

- Positive amount constraint
- PHP currency only constraint
- Foreign key to categories
- Automatic timestamp updates

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md` lines 265-294 (budgets schema)
- **Original**: `docs/initial plan/DECISIONS.md` #80 (budgets are reference targets)
- **Architecture**: No rollover, always calculate from transactions
- **Query Pattern**: Exclude transfers when comparing to budgets

## Technical Stack

- **PostgreSQL**: BIGINT for cents, DATE for month
- **Generated Column**: month_key for performance
- **Supabase**: Automatic timestamp triggers
- **RLS**: Household-scoped access

## Design Patterns

### Reference Target Pattern

```sql
-- Budgets store targets only
SELECT category_id, amount_cents as target
FROM budgets
WHERE household_id = $1 AND month = '2024-01-01';

-- Actual spending calculated from transactions
SELECT category_id, SUM(amount_cents) as actual
FROM transactions
WHERE household_id = $1
  AND DATE_TRUNC('month', date) = '2024-01-01'
  AND type = 'expense'
  AND transfer_group_id IS NULL  -- CRITICAL: Exclude transfers
GROUP BY category_id;
```

### Month Key Optimization

```sql
-- Instead of expensive DATE_TRUNC on every query:
WHERE DATE_TRUNC('month', month) = '2024-01-01'

-- Use integer comparison with generated column:
WHERE month_key = 202401  -- Much faster!
```

## Critical Concepts

**Budget ≠ Balance**:

- Budgets are reference targets, not account balances
- No rollover: January budget doesn't affect February
- Actual spending always calculated fresh from transactions
- Prevents balance drift and simplifies data integrity

**Transfer Exclusion**:

- ALWAYS exclude transfers when calculating actual vs budget
- Transfers are account movements, not expenses
- Pattern: `WHERE transfer_group_id IS NULL`

**Month Boundaries**:

- Use user's timezone from `profiles.timezone`
- Transaction `date` is DATE type (user's local date is canonical)
- Budget month stored as first day of month (e.g., '2024-01-01')

---

**Ready?** → Open `instructions.md` to begin
