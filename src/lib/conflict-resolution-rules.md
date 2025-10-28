# Field-Level Conflict Resolution Rules (Phase C)

**Status**: Deferred per Decision #85

Phase B uses record-level Last-Write-Wins (LWW) for simplicity and performance. This document outlines the field-level merge rules that may be implemented in Phase C if granular conflict resolution is needed.

---

## Current Implementation (Phase B)

**Strategy**: Record-level LWW with DELETE priority

- Entire record is replaced by winning event's payload
- Winner determined by: lamport clock → deviceId tie-breaking
- DELETE operations always win over UPDATE operations
- Simple, fast, deterministic resolution (~100 LOC)

**Handles 95% of conflicts correctly** without complexity of field-level merge.

---

## Future Enhancement (Phase C)

If field-level merge is needed, implement per-field resolution strategies based on entity type and field semantics.

### Rules by Entity Type

#### Transactions

| Field          | Strategy         | Rationale                                            |
| -------------- | ---------------- | ---------------------------------------------------- |
| `amount_cents` | last-write-wins  | Financial data - use most recent value               |
| `description`  | last-write-wins  | Text fields - latest edit preferred                  |
| `category_id`  | last-write-wins  | Reference fields - latest categorization             |
| `status`       | **cleared-wins** | "cleared" status beats "pending" (stronger signal)   |
| `notes`        | **concatenate**  | Preserve both edits with separator (e.g., "\n---\n") |
| `deleted`      | **delete-wins**  | Deletion always takes precedence                     |

**Special Rule - Status Field**:

- `"cleared"` always wins over `"pending"`
- Rationale: Clearing a transaction is a deliberate action (bank confirmation)
- Prevents accidental un-clearing from stale edits

**Special Rule - Notes Field**:

- Concatenate both versions with separator: `local + "\n---\n" + remote`
- Rationale: Notes are additive - both edits may contain valuable information
- User can manually clean up merged notes if needed

#### Accounts

| Field       | Strategy        | Rationale                     |
| ----------- | --------------- | ----------------------------- |
| `name`      | last-write-wins | Latest rename preferred       |
| `is_active` | **false-wins**  | Deactivation takes precedence |
| `color`     | last-write-wins | Latest visual preference      |
| `icon`      | last-write-wins | Latest visual preference      |

**Special Rule - is_active Field**:

- `false` always wins over `true`
- Rationale: Deactivating an account is a deliberate action (account closed)
- Prevents accidental re-activation from stale edits

#### Categories

| Field       | Strategy        | Rationale                     |
| ----------- | --------------- | ----------------------------- |
| `name`      | last-write-wins | Latest rename preferred       |
| `is_active` | **false-wins**  | Deactivation takes precedence |
| `color`     | last-write-wins | Latest visual preference      |
| `icon`      | last-write-wins | Latest visual preference      |

**Same rules as Accounts** - consistent semantics across entities.

#### Budgets

| Field          | Strategy        | Rationale                      |
| -------------- | --------------- | ------------------------------ |
| `amount_cents` | last-write-wins | Latest budget target preferred |
| `is_active`    | **false-wins**  | Deactivation takes precedence  |

---

## Implementation Strategy (Phase C)

If field-level merge is needed:

1. **Add field resolution map** to `ConflictResolutionEngine`:

   ```typescript
   const fieldRules = {
     transaction: {
       amount_cents: "last-write-wins",
       status: "cleared-wins",
       notes: "concatenate",
       // ... etc
     },
     account: {
       name: "last-write-wins",
       is_active: "false-wins",
     },
   };
   ```

2. **Implement field-level merge function**:

   ```typescript
   private mergeFields(
     localPayload: any,
     remotePayload: any,
     entityType: EntityType
   ): any {
     const rules = fieldRules[entityType];
     const merged = {};

     for (const field of allFields) {
       const strategy = rules[field];
       merged[field] = this.resolveField(
         localPayload[field],
         remotePayload[field],
         strategy
       );
     }

     return merged;
   }
   ```

3. **Add field resolution strategies**:

   ```typescript
   private resolveField(
     localValue: any,
     remoteValue: any,
     strategy: FieldStrategy
   ): any {
     switch (strategy) {
       case "last-write-wins":
         return this.lwwField(localValue, remoteValue);
       case "cleared-wins":
         return localValue === "cleared" ? localValue : remoteValue;
       case "false-wins":
         return localValue === false ? localValue : remoteValue;
       case "concatenate":
         return `${localValue}\n---\n${remoteValue}`;
       case "delete-wins":
         return localValue === null ? null : remoteValue;
     }
   }
   ```

4. **Update resolution result**:
   ```typescript
   return {
     winner: localEvent, // or remoteEvent
     loser: remoteEvent,
     strategy: "field-level-merge",
     reason: "Merged fields using per-field strategies",
     mergedPayload: merged, // NEW: Field-level merge result
   };
   ```

---

## Testing Strategy (Phase C)

If implemented, test these scenarios:

1. **Status conflict**: `pending` vs `cleared` → `cleared` wins
2. **Notes conflict**: Concatenate both versions with separator
3. **is_active conflict**: `true` vs `false` → `false` wins
4. **Mixed field conflict**: Some fields LWW, some special rules

---

## References

- **SYNC-ENGINE.md** lines 365-514: Complete field-level conflict resolution matrix
- **DECISIONS.md** Decision #78: Field-level merge strategies
- **DECISIONS.md** Decision #85: Defer field-level merge to Phase C

---

## When to Implement Phase C

Implement field-level merge if:

1. **User feedback**: Users complain about losing data in conflicts
2. **Analytics**: >5% of conflicts result in data loss complaints
3. **Complex workflows**: Power users need granular merge (e.g., shared notes)

**Current assessment**: Phase B record-level LWW is sufficient for MVP. Monitor conflict resolution patterns to determine if Phase C is needed.
