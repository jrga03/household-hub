# Chunk 007: Categories Setup

## At a Glance

- **Time**: 45-60 minutes
- **Milestone**: MVP (4 of 10)
- **Prerequisites**: Chunks 001-006 (categories schema + currency utilities must exist)
- **Can Skip**: No - required for transaction categorization

## What You're Building

Complete category management system:

- Hierarchical category structure (Parent → Child)
- Category list view with parent/child relationships
- Create/edit category form
- Color and icon pickers
- Sort order management
- Seed initial categories from requirements
- Category selector component for forms

## Why This Matters

Categories are the foundation of expense tracking and budgeting. The **two-level hierarchy** (Parent → Child) matches the user's existing Google Sheets structure and makes budget allocation intuitive. Users only select child categories when creating transactions, but parents are used for budget rollups and reporting.

## Before You Start

Make sure you have:

- Chunks 001-006 completed
- Categories table exists in Supabase (created in chunk 004)
- Currency utilities exist (formatPHP, parsePHP from chunk 006)
- shadcn/ui components installed
- TanStack Query configured

## What Happens Next

After this chunk:

- Users can create and manage categories
- Two-level hierarchy (Parent → Child) working
- Color-coded categories for visual distinction
- Icon selection for better UX
- Categories seeded with defaults (Groceries, Transport, etc.)
- Category selector ready for transaction form (chunk 009)

## Key Files Created

```
src/
├── routes/
│   └── categories.tsx              # Category management page
├── components/
│   ├── CategoryFormDialog.tsx      # Create/edit form dialog
│   ├── CategorySelector.tsx        # Dropdown for transaction forms
│   └── ui/
│       ├── color-picker.tsx        # Color selection component
│       └── icon-picker.tsx         # Icon selection component
├── lib/
│   └── supabaseQueries.ts          # Category query hooks
└── types/
    └── categories.ts               # Category types
```

## Features Included

### Category List

- Hierarchical display (parents with indented children)
- Collapsible parent categories
- Color-coded indicators
- Icon display
- Sort order visualization
- Edit/delete actions

### Create Category Form

- Name input with validation
- Parent category selector (optional - null for parent)
- Color picker (8 preset colors)
- Icon picker (Lucide icons)
- Sort order input
- Visibility (household/personal)

### Category Selector

- Hierarchical dropdown for transaction forms
- Only child categories selectable (parents are groupings)
- Shows parent context (e.g., "Food → Groceries")
- Color-coded options
- Searchable/filterable

### Seed Categories

- Parent: Food
  - Groceries
  - Dining Out
  - Snacks
- Parent: Transportation
  - Gas
  - Public Transit
  - Parking
- Parent: Utilities
  - Electricity
  - Water
  - Internet
- Parent: Entertainment
  - Movies
  - Games
  - Subscriptions

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 4 (lines 185-210)
- **Original**: `docs/initial plan/DATABASE.md` lines 134-156 (categories schema)
- **Decisions**:
  - #11: Two-level category hierarchy
  - #22: Color coding extracted from existing sheet
  - #54: Users select child categories only
- **Architecture**: Admin-editable, not hard-coded

## Technical Stack

- **TanStack Query**: Server state for categories
- **React Hook Form**: Form handling
- **Zod**: Schema validation
- **shadcn/ui**: UI components (Dialog, Select, Button, Input)
- **Lucide React**: Icon library for category icons

## Design Patterns

### Hierarchical Query Pattern

```typescript
// Fetch all categories with parent relationship
const { data: categories } = useCategories();

// Group by parent
const byParent = categories.reduce((acc, cat) => {
  const parentId = cat.parent_id || "root";
  return {
    ...acc,
    [parentId]: [...(acc[parentId] || []), cat],
  };
}, {});
```

### Category Selector Pattern

```typescript
// Only allow selecting child categories
const childCategories = categories.filter((c) => c.parent_id !== null);

// Display with parent context
const display = `${parent.name} → ${child.name}`;
```

### Sort Order Pattern

```typescript
// Categories ordered by sort_order within parent
ORDER BY parent_id, sort_order, name
```

---

**Ready?** → Open `instructions.md` to begin
