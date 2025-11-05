# Lib Utilities (`/src/lib/utils/`)

## Purpose

This directory contains **utility functions specific to lib functionality** - helper functions used by lib modules that don't fit into other categories.

## Contents

- **`filters.ts`** - Filter utility functions
  - Transaction filter helpers
  - Date range utilities
  - Category filtering logic

## When to Use This Directory

**Place utilities here when:**

- Used internally by lib modules only
- Not general-purpose (use root `utils.ts` for that)
- Specific to lib functionality (filters, transforms, etc.)

**Place utilities in `/src/lib/utils.ts` (root) when:**

- General-purpose utilities (cn function for Tailwind)
- Shared across entire application
- Not specific to lib implementation

## File Organization

**Lib-Specific:**

```
src/lib/utils/filters.ts → Used by offline/, sync/ modules
```

**General-Purpose:**

```
src/lib/utils.ts → Used everywhere (cn function, etc.)
```

## Example Utilities

### Filter Utilities

**Purpose:** Helper functions for filtering transactions, accounts, etc.

**Common Functions:**

- `filterByDateRange(items, start, end)` - Filter by date range
- `filterByCategory(items, categoryId)` - Filter by category
- `filterByAccount(items, accountId)` - Filter by account

**Usage:** Used in hooks and components for query filtering.

## Related Documentation

### Parent README

- [../README.md](../README.md) - Core business logic overview

### Related Directories

- [../offline/README.md](../offline/README.md) - Uses filter utilities

### Root Utilities

- [../utils.ts](../utils.ts) - General-purpose utilities (cn function)

### Project Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
