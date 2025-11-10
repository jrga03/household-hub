# Chunk D5: Payment Processing Core

## At a Glance

- **Time**: 1.5 hours
- **Prerequisites**: D4 (Debt CRUD) complete
- **Can Skip**: No - core functionality for debt payments
- **Depends On**: Balance calculation, status logic, lamport clock, device ID

## What You're Building

Core payment processing logic for linking transactions to debts:

- **Payment creation**: Link transaction to debt, create debt_payment record
- **Overpayment detection**: Synchronous check BEFORE insert (defense-in-depth layer 2)
- **Idempotency keys**: Generate unique keys with persistent lamport clock
- **Device tracking**: Record which device created each payment
- **Auto status update**: Trigger status transition after payment
- **Dual debt support**: Works for both external and internal debts
- **Integration hook**: Ready for transaction form integration (D9)

## Why This Matters

Payment processing is the **primary user interaction** with debts:

- **Data integrity**: Overpayment detection prevents surprises
- **Audit trail**: Device ID and idempotency keys enable debugging
- **Automatic status**: Users don't manually mark debts as paid
- **Offline-first**: Idempotency prevents duplicate payments after sync
- **User experience**: Clear warnings when overpaying

This chunk implements the core payment flow from debt-implementation.md.

## Before You Start

Verify these prerequisites:

- [ ] **Chunk D4 complete** - CRUD operations available
- [ ] **Balance calculation** from D3 works
- [ ] **Status logic** from D3 works
- [ ] **Lamport clock** utilities available
- [ ] **Device ID** function available (fingerprinting from existing code)

**How to verify**:

```typescript
import { calculateDebtBalance } from "@/lib/debts/balance";
import { updateDebtStatusFromBalance } from "@/lib/debts/status";
import { getNextLamportClock } from "@/lib/dexie/lamport-clock";

console.log("Balance:", typeof calculateDebtBalance === "function");
console.log("Status:", typeof updateDebtStatusFromBalance === "function");
console.log("Lamport:", typeof getNextLamportClock === "function");
```

## What Happens Next

After this chunk:

- Transactions can be linked to debts
- Payments automatically update debt status
- Overpayments tracked and flagged
- Ready for Chunk D6 (Reversal System)

## Key Files Created

```
src/
├── lib/
│   └── debts/
│       ├── payments.ts              # Payment processing logic
│       └── __tests__/
│           └── payments.test.ts     # Payment tests
└── types/
    └── debt.ts                      # MODIFIED: Add payment types
```

## Features Included

### Payment Creation

**processDebtPayment()**:

- Takes transaction + debt info
- Detects overpayment BEFORE insert
- Generates idempotency key
- Creates debt_payment record
- Updates debt status automatically
- Returns payment record

### Overpayment Detection (Defense-in-Depth Layer 2)

**Timing**: Happens BEFORE payment INSERT

```typescript
// 1. Calculate current balance
const balance = await calculateDebtBalance(debtId);

// 2. Detect overpayment
const isOverpayment = balance <= 0 || amount > balance;

// 3. Set flags on payment record
payment.is_overpayment = isOverpayment;
payment.overpayment_amount = isOverpayment ? calculateOverpayment() : null;
```

**Why synchronous**: Enables immediate flagging without batch jobs, works offline.

### Idempotency Key Generation

**Format**: `${deviceId}-debt_payment-${paymentId}-${lamportClock}`

**Example**: `device-abc-debt_payment-pay123-42`

**Properties**:

- Globally unique
- Monotonically increasing (lamport clock)
- Device-scoped
- Entity-specific

### Device Tracking

**Purpose**: Audit trail for debugging concurrent scenarios

**Storage**: `debt_payments.device_id` field

**Use cases**:

- Debug concurrent overpayments
- Identify sync conflicts
- User activity tracking

## Related Documentation

- **Payment Processing**: `debt-implementation.md` lines 196-301 (processDebtPayment)
- **Overpayment Detection**: `debt-implementation.md` lines 201-228 (defense-in-depth layer 2)
- **Idempotency Keys**: `debt-implementation.md` lines 58-72 (format specification)
- **Decisions**:
  - #4: Overpayment handling (DEBT-DECISIONS.md lines 172-240)
  - #18: Idempotency persistence (DEBT-DECISIONS.md lines 666-707)
  - #19: Device ID tracking (DEBT-DECISIONS.md lines 710-750)

## Technical Stack

- **Dexie.js**: Payment persistence
- **TypeScript**: Type-safe payment processing
- **nanoid**: Payment ID generation
- **Lamport clock**: Idempotency key counter

## Design Patterns

### Two-Phase Payment Pattern

```typescript
async function processDebtPayment(transaction, debtInfo) {
  // Phase 1: Detection (BEFORE insert)
  const balance = await calculateDebtBalance(debtId);
  const isOverpayment = detectOverpayment(balance, amount);

  // Phase 2: Creation (WITH flags set)
  const payment = {
    amount_cents,
    is_overpayment, // Set based on Phase 1
    overpayment_amount,
  };

  await db.debtPayments.add(payment);
}
```

**Why**: Defense-in-depth - flags set by application logic, verified by database trigger.

### Idempotent Payment Pattern

```typescript
// Generate unique idempotency key
const lamportClock = await getNextLamportClock();
const idempotencyKey = `${deviceId}-debt_payment-${paymentId}-${lamportClock}`;

// Server checks this key and rejects duplicates
await supabase.from("events").insert({
  idempotency_key: idempotencyKey,
  // ...
});
```

**Why**: Prevents duplicate payments after offline → online sync.

### Auto Status Update Pattern

```typescript
async function processDebtPayment(...) {
  // 1. Create payment
  await db.debtPayments.add(payment);

  // 2. Auto-update status based on new balance
  await updateDebtStatusFromBalance(debtId, type);
}
```

**Why**: Users don't manually mark debts as paid - it's automatic.

## Critical Concepts

**Overpayment Detection Timing**: The overpayment check happens **synchronously BEFORE the payment INSERT**, not as a batch job afterward. This is defense-in-depth layer 2:

- Layer 1: UI warning (dismissible)
- Layer 2: Application logic (authoritative) ← **This chunk**
- Layer 3: Database trigger (security)

**Idempotency Key Scope**: Keys are scoped to **entity ID (payment ID)**, not transaction ID. This matters because a single transaction could theoretically link to multiple debts (though UI prevents this in MVP).

**Device ID Source**: Device ID comes from the device identification system (FingerprintJS + fallbacks from existing code). This chunk doesn't implement device ID generation, just uses it.

**Balance Calculation Order**: Always calculate balance BEFORE creating payment to ensure overpayment flags are accurate.

**Status Update Side Effect**: Every payment creation triggers an automatic status update. This is intentional and expected - status should always reflect current balance.

## Overpayment Scenarios

### Scenario 1: User Overpays Intentionally

- Balance: ₱100
- Payment: ₱150
- Result: `is_overpayment = true`, `overpayment_amount = 5000` (₱50)
- Status: `paid_off`
- Balance: `-5000` (negative)

### Scenario 2: Concurrent Offline Payments

- Two devices both pay ₱100 while offline
- Device A syncs first: `is_overpayment = false`
- Device B syncs second: `is_overpayment = true` (database trigger detects)
- Final balance: `-10000` (₱100 overpaid)

### Scenario 3: Partial Overpayment

- Balance: ₱100
- Payment: ₱120
- Result: `is_overpayment = true`, `overpayment_amount = 2000` (₱20)

### Scenario 4: Payment to Zero-Balance Debt

- Balance: ₱0 (already paid)
- Payment: ₱50
- Result: `is_overpayment = true`, entire amount is overpayment

## Error Handling

**Validation Errors**:

- "Debt not found"
- "Debt is archived - cannot accept payments"
- "Invalid payment amount (must be positive)"

**Warnings** (not errors):

- "Payment exceeds balance by ₱X" (overpayment warning)

**Critical**: Overpayments are **warnings, not errors**. Accept-and-track approach.

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
