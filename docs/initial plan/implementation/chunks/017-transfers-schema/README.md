# Chunk 017: Transfers Schema

## At a Glance

- **Time**: 45 minutes
- **Milestone**: MVP (Optional)
- **Prerequisites**: Chunk 008 (transactions schema)
- **Can Skip**: Yes - transfers are optional

## What You're Building

Database triggers and constraints for transfer integrity:

- Transfer integrity triggers (2 transactions per group)
- Paired transaction validation (opposite types, same amount)
- Transfer deletion handler (unpair on delete)
- Documentation of transfer exclusion pattern
- Test transfer edge cases

## Why This Matters

Transfers represent money movement between accounts (not income/expense). The database must enforce:

- Exactly 2 transactions per transfer
- One expense (from account) + one income (to account)
- Same amount for both
- CRITICAL: Exclude from analytics/budgets

## Before You Start

Make sure you have:

- Chunk 008 completed (transactions table has transfer_group_id)
- Understanding of trigger functions
- Knowledge of paired transaction design

## Key Database Components

**transfer_group_id** field (UUID):

- Links two transactions together
- NULL for regular transactions
- Same UUID for paired transfers

**Integrity Constraints**:

1. Maximum 2 transactions per transfer_group_id
2. Opposite types (one income, one expense)
3. Same amount_cents
4. Both must exist (no orphaned transfers)

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md` lines 176, 441-543, 546-630
- **Decisions**: #60 (transfer design philosophy)
- **Query Pattern**: Always exclude transfers from analytics

---

**Ready?** → Open `instructions.md` to begin
