# Lib Type Definitions (`/src/lib/types/`)

## Purpose

This directory contains **type definitions specific to lib functionality** - types that are used internally by lib modules but don't represent main application entities.

## Contents

- **`offline.ts`** (2.7KB) - Offline operation types
  - `OfflineOperationType` - Operation types ('create' | 'update' | 'delete')
  - `OfflineResult<T>` - Result type for offline operations
  - `OfflineError` - Error structure for offline failures
  - `CacheMetadata` - Cache freshness tracking
  - `QueueMetrics` - Sync queue metrics

## When to Use This Directory

**Place types here when:**

- Used internally by lib modules only
- Not part of main application entities
- Implementation details of lib functionality

**Place types in `/src/types/` when:**

- Shared across app (components, hooks, stores)
- Represent main entities (transactions, accounts, categories)
- Part of public API

## Type Organization

**Lib-Specific:**

```
src/lib/types/offline.ts  → Used by offline/ modules
```

**Application-Wide:**

```
src/types/transactions.ts → Used everywhere
```

## Example Types

### Offline Result Type

```typescript
export type OfflineResult<T> = { success: true; data: T } | { success: false; error: string };
```

**Usage:** Returned by all offline operations for consistent error handling.

### Cache Metadata

```typescript
export interface CacheMetadata {
  lastSync: number; // Unix timestamp
  staleAfter: number; // Milliseconds
  isStale: boolean;
}
```

**Usage:** Track cache freshness in offline operations.

## Related Documentation

### Parent README

- [../README.md](../README.md) - Core business logic overview

### Related Directories

- [../../types/README.md](../../types/README.md) - Application-wide types
- [../offline/README.md](../offline/README.md) - Uses offline types

### Project Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
