# Remaining TypeScript 'any' Type Fixes

## Progress Summary

**Original Issues**: 163 ESLint errors/warnings
**Current Issues**: 124 ESLint errors/warnings  
**Reduction**: 39 issues fixed (24% improvement)

## Completed Work

### Phase 1: React & DOM (Commits: 7d0bf38, ffb5a8d)

- ✅ Fixed React purity violations (useState initializers)
- ✅ Removed unused variables and imports
- ✅ Added missing DOM globals (Performance, HTMLInputElement, React, etc.)
- ✅ Fixed exhaustive-deps warnings
- ✅ Replaced 'any' with 'unknown' in type definitions (event.ts, resolution.ts)
- ✅ Fixed database layer types (db.ts, deviceManager.ts)
- ✅ Created reusable Sentry helper (`src/types/sentry.ts`)

## Remaining Work (88 issues)

### Priority 1: Sentry Patterns (~30 occurrences)

**Files with Sentry 'any' casts:**

- `src/lib/conflict-detector.ts` (4 occurrences - lines 190, 191, 207, 208)
- `src/lib/conflict-resolver.ts` (2 occurrences - lines 276, 277)
- `src/lib/event-compactor.ts`
- `src/lib/event-compactor.test.ts`
- `src/lib/event-generator.ts`
- `src/lib/idempotency.ts`
- `src/lib/realtime-sync.ts`
- Other lib/ files

**Solution**: Replace all with `hasSentry(window)` helper from `@/types/sentry`

**Pattern to replace:**

```typescript
// OLD:
if (typeof window !== "undefined" && (window as any).Sentry) {
  (window as any).Sentry.captureException(error, { ... });
}

// NEW:
import { hasSentry } from "@/types/sentry";

if (typeof window !== "undefined" && hasSentry(window)) {
  window.Sentry.captureException(error, { ... });
}
```

### Priority 2: Event System (~20 'any' types)

**Files:**

- `src/lib/event-generator.ts` (payload types)
- `src/lib/event-compactor.ts` (snapshot/payload types)
- `src/lib/idempotency.ts` (entity payload types)
- `src/lib/realtime-sync.ts` (Supabase payload types)

**Strategy:**

- Event payloads: Use `unknown` (validated at boundaries)
- Supabase realtime payloads: Use `RealtimePostgresChangesPayload<unknown>`
- Entity-specific payloads: Consider union types if needed

### Priority 3: Workers (~15 'any' types)

**Files:**

- `workers/push-notifier/src/index.ts` (8 occurrences)
- `workers/push-notifier/src/auth-utils.ts` (1 occurrence)

**Locations:**

- Line 42: `data?: Record<string, any>` → `Record<string, unknown>`
- Line 93: Error handlers → proper Error types
- Line 113, 132, 177, 263, 276: Various payload/error types

### Priority 4: Test Files (~25 'any' types)

**Files:**

- `src/lib/csv-exporter.test.ts` (line 330)
- `src/lib/offline/syncQueue.test.ts`
- `src/lib/event-compactor.test.ts`
- `tests/e2e/performance.spec.ts` (line 35)

**Strategy:**

- Mock data: Use proper types or `unknown`
- Playwright fixtures: Type properly with Playwright types
- Test utilities: Extract to typed helpers

### Priority 5: Application Code (~10 'any' types)

**Files:**

- `src/hooks/useAnalytics.ts` (line 199)
- `src/hooks/useTransfers.ts` (lines 118, 119)
- `src/lib/background-sync.ts` (line 45)
- `src/lib/supabaseQueries.ts`
- `src/routes/import.tsx`
- `src/routes/budgets/index.tsx`

**Strategy:**

- Hook return types: Define proper return interfaces
- Query data: Use Supabase generated types
- Component props: Type properly

### Priority 6: Unfixable Issues (~4 issues)

**React Hook Form Compiler Warnings (2):**

- `src/components/CategoryFormDialog.tsx:153` (form.watch())
- `src/components/ui/currency-input.example.tsx:45` (form.watch())
- **Status**: Cannot fix - React Compiler incompatible with React Hook Form API
- **Action**: Document as known limitation

**Response Type (1):**

- `src/lib/realtime-sync.ts:274` ('Response' not defined)
- **Action**: Add to ESLint globals for worker environment

**Other (1):**

- Misc edge cases

## Implementation Plan

### Step 1: Batch Fix Sentry Patterns (30 min)

```bash
# Find all files with Sentry 'any' casts
grep -r "(window as any).Sentry" src/ workers/

# For each file:
# 1. Add import: import { hasSentry } from "@/types/sentry";
# 2. Replace pattern with hasSentry(window) check
```

### Step 2: Fix Event System (20 min)

- event-generator.ts: Payload types to `unknown`
- event-compactor.ts: Snapshot types to `unknown`
- idempotency.ts: Entity types to `unknown`
- realtime-sync.ts: Supabase types properly

### Step 3: Fix Workers (15 min)

- push-notifier/index.ts: Replace all Record<string, any>
- auth-utils.ts: Proper JWT types

### Step 4: Fix Tests (30 min)

- Extract test utilities with proper types
- Update mock data to use proper interfaces
- Fix Playwright fixture types

### Step 5: Fix Application Code (15 min)

- Hook return types
- Query response types
- Component prop types

### Step 6: Final Verification

```bash
npm run lint
npm test
npm run build
```

**Expected Final Status**: ~10-15 remaining issues (unfixable limitations)

## Quick Reference Commands

```bash
# Count remaining 'any' types
npm run lint 2>&1 | grep "Unexpected any" | wc -l

# Find specific pattern
grep -rn "as any" src/

# Fix and verify
npm run lint:fix
npm run lint
```

## Notes

- **unknown vs any**: Use `unknown` for payloads validated at runtime
- **Type assertions**: Only use when absolutely necessary (window APIs)
- **Test types**: Consider creating `src/test/types.ts` for shared test utilities
- **Worker types**: Consider `workers/shared-types.ts` for common types

---

**Last Updated**: 2025-10-29
**Target Completion**: Next session (~2 hours work)
