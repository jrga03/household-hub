# Sync Queue Integration Tests - Setup Guide

## Overview

The `syncQueue.test.ts` file contains comprehensive integration tests for the Household Hub sync queue system. These tests verify:

1. **Transaction Queue Integration**: Queue items created on offline transaction mutations
2. **Idempotency Key Generation**: Correct format `${deviceId}-${entityType}-${entityId}-${lamportClock}`
3. **Lamport Clock Incrementing**: Per-entity clock increments correctly
4. **Vector Clock Initialization**: Device-specific vector clocks initialized properly
5. **Rollback on Queue Failure**: Atomic operations rollback IndexedDB on Supabase errors
6. **Queue Count Accuracy**: Correct counting of pending sync items
7. **Account/Category Mutations**: Queue integration for all entity types
8. **Update/Delete Operations**: Proper queue handling for all CRUD operations
9. **Pending Queue Items Query**: Fetching queued items for sync processor
10. **Vector Clock Per-Entity Isolation**: Independent vector clocks for different entities

## Current Status: IndexedDB Polyfill Required

These tests currently fail with:

```
DatabaseClosedError: MissingAPIError IndexedDB API missing.
```

This is expected because Vitest runs in a Node.js environment without IndexedDB support.

## Setup Option 1: Install fake-indexeddb (RECOMMENDED)

### Step 1: Install Dependencies

```bash
npm install --save-dev fake-indexeddb
```

### Step 2: Create Test Setup File

Create `src/test-setup.ts`:

```typescript
/**
 * Test Setup for IndexedDB and Browser APIs
 *
 * Configures fake-indexeddb and other browser polyfills
 * for Vitest tests running in Node.js environment.
 */

import "fake-indexeddb/auto";
import { vi } from "vitest";

// Mock localStorage (required by deviceManager)
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

global.localStorage = localStorageMock as any;

// Mock navigator.storage (used for quota checks)
global.navigator = {
  ...global.navigator,
  storage: {
    estimate: vi.fn().mockResolvedValue({
      usage: 1000000,
      quota: 100000000,
    }),
  } as any,
};
```

### Step 3: Configure Vitest

Update `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), TanStackRouterVite(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
  // Add test configuration
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
```

### Step 4: Remove .skip from Tests

In `syncQueue.test.ts`, remove the `.skip` suffix from describe blocks (if added).

### Step 5: Run Tests

```bash
npm test src/lib/offline/syncQueue.test.ts
```

## Setup Option 2: Browser Environment Testing

Use Vitest browser mode or Playwright component testing for real browser IndexedDB.

### Vitest Browser Mode

```bash
npm install --save-dev @vitest/browser playwright
```

Update `vite.config.ts`:

```typescript
test: {
  browser: {
    enabled: true,
    name: 'chromium',
    provider: 'playwright',
  },
}
```

## Test Coverage Summary

### ✅ Implemented Tests (12 total)

1. **Transaction Queue Integration**
   - Verifies transaction added to queue on create
   - Checks IndexedDB persistence and queue item creation

2. **Idempotency Key Format**
   - Validates pattern: `${deviceId}-${entityType}-${entityId}-${clock}`
   - Parses and verifies components

3. **Lamport Clock Incrementing**
   - Creates multiple entities and verifies independent clocks
   - Checks clock values increment correctly per entity

4. **Vector Clock Initialization**
   - Verifies vector clock has device ID key
   - Validates initial value is 1

5. **Rollback on Queue Failure**
   - Mocks Supabase failure
   - Verifies IndexedDB rollback (atomic operation)

6. **Queue Count Accuracy**
   - Creates 3 transactions
   - Verifies `getQueueCount()` returns 3

7. **Account Mutations Queue**
   - Creates account
   - Verifies queue item with `entity_type = "account"`

8. **Category Mutations Queue**
   - Creates category
   - Verifies queue item with `entity_type = "category"`

9. **Update Operations Queue**
   - Creates and updates account
   - Verifies 2 queue items (create + update)

10. **Delete Operations Queue**
    - Creates and deletes transaction
    - Verifies 2 queue items (create + delete)

11. **Pending Queue Items Query**
    - Creates multiple transactions
    - Verifies `getPendingQueueItems()` returns correct items

12. **Vector Clock Per-Entity Isolation**
    - Creates transaction, account, and another transaction
    - Verifies each has independent vector clock

## Test Mocking Strategy

### Supabase Mocking

Tests use `vi.spyOn()` to mock Supabase operations:

```typescript
const insertSpy = vi.spyOn(supabase.from("sync_queue"), "insert");
insertSpy.mockImplementationOnce((queueItem: any) => {
  capturedQueueItem = queueItem;
  return {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: "queue-item-123" },
        error: null,
      }),
    }),
  } as any;
});
```

### IndexedDB Testing

Tests use real Dexie.js operations with fake-indexeddb polyfill:

```typescript
// Real IndexedDB operations (via fake-indexeddb)
await db.transactions.add(transaction);
const stored = await db.transactions.get(id);
expect(stored).toBeDefined();
```

## Troubleshooting

### Error: "IndexedDB API missing"

**Cause**: fake-indexeddb not installed or not configured in test setup

**Solution**: Follow Setup Option 1 steps above

### Error: "localStorage is not defined"

**Cause**: localStorage mock not configured

**Solution**: Ensure `src/test-setup.ts` includes localStorage mock

### Error: "Cannot find module 'fake-indexeddb/auto'"

**Cause**: Package not installed

**Solution**: Run `npm install --save-dev fake-indexeddb`

### Tests Pass Locally But Fail in CI

**Cause**: CI environment missing fake-indexeddb

**Solution**: Ensure CI installs devDependencies:

```yaml
- name: Install dependencies
  run: npm ci # Installs all deps including devDependencies
```

## Manual Testing Alternative

If automated tests can't run, verify sync queue manually:

1. **Start Dev Server**: `npm run dev`
2. **Open Browser DevTools**: Console + Application tab
3. **Create Transaction**: Use app UI to create transaction
4. **Inspect IndexedDB**:
   - Application → IndexedDB → HouseholdHubDB
   - Check `transactions` table for new entry
5. **Check Console Logs**: Look for sync queue debug logs
6. **Verify Supabase**: Check `sync_queue` table in Supabase dashboard

## Future Improvements

- [ ] Add E2E tests with real browser (Playwright)
- [ ] Test concurrent modifications from multiple tabs
- [ ] Test network failure scenarios with MSW (Mock Service Worker)
- [ ] Add performance benchmarks (1000+ queue items)
- [ ] Test event compaction integration
- [ ] Add stress tests for offline → online sync

## References

- **SYNC-ENGINE.md**: Complete sync architecture
- **DECISIONS.md #78**: Conflict resolution rules
- **DATABASE.md**: Event schema and vector clock structure
- **instructions.md Step 6**: Test requirements
