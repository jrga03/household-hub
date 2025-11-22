# Feature Documentation (`/docs/features/`)

## Purpose

Feature-specific documentation hub for **Household Hub**. Contains detailed specifications, implementation guides, design decisions, and validation rules for individual features beyond the core MVP.

## Directory Structure

```
features/
├── README.md                       # This file - Feature documentation hub
├── react-19-enhancements/         # React 19 features (Phase A MVP)
│   ├── REACT-19-ENHANCEMENTS.md   # Feature overview
│   ├── REACT-19-DECISIONS.md      # Design decisions
│   └── react-19-implementation.md # Implementation guide
├── sync-management/               # Sync status visibility (Phase A MVP)
│   ├── SYNC-MANAGEMENT.md         # Feature overview
│   ├── SYNC-MANAGEMENT-DECISIONS.md # Design decisions
│   └── sync-management-implementation.md # Implementation guide
└── debts/                         # Debt tracking feature (Post-MVP)
    ├── DEBTS.md                   # Feature overview & requirements
    ├── DEBT-DECISIONS.md          # Design decisions & rationale
    ├── DEBT-VALIDATION.md         # Validation rules & constraints
    └── debt-implementation.md     # Implementation guide
```

## Current Features

### React 19 Enhancements (Phase A MVP)

**Status:** ✅ Implemented

**Location:** [react-19-enhancements/](react-19-enhancements/)

**Overview:**
Implementation of React 19's modern APIs including useFormStatus(), Suspense boundaries, use() hook for context consumption, and optimistic UI updates with TanStack Query.

**Key documents:**

1. **[react-19-enhancements/REACT-19-ENHANCEMENTS.md](react-19-enhancements/REACT-19-ENHANCEMENTS.md)** - Feature overview
   - User stories and requirements
   - Use cases for each React 19 feature
   - Component architecture
   - Integration points
   - Success metrics

2. **[react-19-enhancements/REACT-19-DECISIONS.md](react-19-enhancements/REACT-19-DECISIONS.md)** - Design decisions
   - Decision to adopt useFormStatus() for auth forms
   - Suspense boundaries for analytics tabs
   - Migration to use() hook for context
   - Optimistic updates pattern
   - Reusable SubmitButton component

3. **[react-19-enhancements/react-19-implementation.md](react-19-enhancements/react-19-implementation.md)** - Implementation guide
   - Step-by-step SubmitButton creation
   - Auth form migration
   - Analytics tabs with Suspense
   - Context hook migration
   - Optimistic update implementation
   - Testing strategy

**Key features:**

- useFormStatus() for automatic form submission states
- Suspense boundaries for smooth loading transitions
- use() hook for cleaner context consumption
- Optimistic updates for instant UI feedback
- Reusable SubmitButton component

---

### Sync Management & Status Visibility (Phase A MVP)

**Status:** ✅ Implemented

**Location:** [sync-management/](sync-management/)

**Overview:**
Comprehensive sync status visibility and queue management system for offline-first architecture. Provides real-time sync status, manual retry controls, and detailed queue viewer.

**Key documents:**

1. **[sync-management/SYNC-MANAGEMENT.md](sync-management/SYNC-MANAGEMENT.md)** - Feature overview
   - User stories and requirements
   - Use cases for status visibility and queue management
   - Component architecture (SyncBadge, GlobalSyncStatus, OfflineBanner, SyncQueueViewer)
   - Data model and hook signatures
   - Accessibility features

2. **[sync-management/SYNC-MANAGEMENT-DECISIONS.md](sync-management/SYNC-MANAGEMENT-DECISIONS.md)** - Design decisions
   - Per-transaction sync badges
   - Global sync status indicator
   - Offline banner design
   - Sync queue viewer architecture
   - Manual retry operations
   - Discard operation with confirmation

3. **[sync-management/sync-management-implementation.md](sync-management/sync-management-implementation.md)** - Implementation guide
   - SyncBadge component creation
   - GlobalSyncStatus with 3 variants
   - OfflineBanner with reconnection celebration
   - SyncQueueViewer with grouped items
   - Sync queue operations (retry, discard)
   - Testing strategy

**Key features:**

- Per-transaction sync status badges (synced, pending, syncing, failed)
- Global sync status in header with online/offline indicator
- Offline banner with reconnection celebration
- Detailed sync queue viewer with manual controls
- Retry individual or all failed sync items
- Discard problematic sync items with confirmation

---

### Debt Tracking (Post-MVP)

**Status:** Planned for Phase 2+ (post-MVP)

**Location:** [debts/](debts/)

**Overview:**
Track debts owed to/from others (people or businesses) with structured repayment tracking, interest calculations, and payment schedules.

**Key documents:**

1. **[debts/DEBTS.md](debts/DEBTS.md)** - Feature overview (11K)
   - Use cases and user stories
   - Core requirements
   - Data model overview
   - User workflows
   - Integration points

2. **[debts/DEBT-DECISIONS.md](debts/DEBT-DECISIONS.md)** - Design decisions (20K)
   - Architectural choices
   - Data model rationale
   - Validation strategy
   - Interest calculation approach
   - Edge cases and trade-offs
   - Alternative approaches considered

3. **[debts/DEBT-VALIDATION.md](debts/DEBT-VALIDATION.md)** - Validation rules (14K)
   - Input validation constraints
   - Business logic validation
   - Relationship validation (debtor/creditor)
   - Payment validation
   - Interest calculation validation
   - Database constraints

4. **[debts/debt-implementation.md](debts/debt-implementation.md)** - Implementation guide (25K)
   - Step-by-step implementation
   - Database schema additions
   - API/RPC function definitions
   - Frontend component structure
   - Testing strategy
   - Migration path from MVP

**Key features:**

- Debt creation and tracking (owed/owing)
- Structured repayments with history
- Interest calculation (simple and compound)
- Payment reminders
- Debt status tracking (active, paid off, forgiven)
- Integration with transaction system

## Feature Documentation Standards

### File Organization

Each feature should have its own directory under `/docs/features/{feature-name}/` with the following structure:

```
{feature-name}/
├── {FEATURE-NAME}.md                 # Overview (ALL_CAPS)
├── {FEATURE-NAME}-DECISIONS.md       # Design decisions
├── {FEATURE-NAME}-VALIDATION.md      # Validation rules
└── {feature-name}-implementation.md  # Implementation guide (kebab-case)
```

### Required Documents

#### 1. Feature Overview (`{FEATURE-NAME}.md`)

**Purpose:** High-level introduction to the feature

**Contents:**

- **User stories:** Who needs this and why
- **Requirements:** Functional and non-functional requirements
- **Use cases:** Common scenarios and workflows
- **Data model:** Entity relationships at high level
- **Integration:** How it fits into existing system
- **Out of scope:** What this feature doesn't cover

**Target audience:** Product managers, stakeholders, new developers

**Example:** [debts/DEBTS.md](debts/DEBTS.md)

#### 2. Design Decisions (`{FEATURE-NAME}-DECISIONS.md`)

**Purpose:** Document architectural and design choices

**Contents:**

- **Problem statement:** What challenge does this solve?
- **Decision:** What was chosen
- **Alternatives considered:** Other options evaluated
- **Rationale:** Why this approach was selected
- **Trade-offs:** Pros and cons acknowledged
- **Consequences:** Implications for future development

**Format:** Follow [Architectural Decision Records (ADR)](https://adr.github.io/) pattern

**Target audience:** Architects, senior developers, future maintainers

**Example:** [debts/DEBT-DECISIONS.md](debts/DEBT-DECISIONS.md)

#### 3. Validation Rules (`{FEATURE-NAME}-VALIDATION.md`)

**Purpose:** Comprehensive validation specifications

**Contents:**

- **Input validation:** Field-level constraints (type, length, format)
- **Business logic validation:** Domain rules (e.g., "debt amount must be positive")
- **Relationship validation:** Entity relationship constraints
- **Database constraints:** NOT NULL, UNIQUE, CHECK, FK constraints
- **Error messages:** User-facing validation messages
- **Edge cases:** Boundary conditions and special cases

**Target audience:** Developers implementing forms, API endpoints, database schema

**Example:** [debts/DEBT-VALIDATION.md](debts/DEBT-VALIDATION.md)

#### 4. Implementation Guide (`{feature-name}-implementation.md`)

**Purpose:** Step-by-step implementation instructions

**Contents:**

- **Prerequisites:** What must exist before implementing
- **Database changes:** Schema additions, migrations
- **Backend changes:** API endpoints, RPC functions, RLS policies
- **Frontend changes:** Components, routes, hooks
- **Testing checklist:** Unit, integration, E2E tests required
- **Deployment steps:** Any special deployment considerations

**Target audience:** Developers implementing the feature

**Example:** [debts/debt-implementation.md](debts/debt-implementation.md)

## Feature Template

When documenting a new feature, use this template structure:

### Step 1: Create Feature Directory

```bash
mkdir -p docs/features/{feature-name}
```

### Step 2: Create Overview Document

**File:** `docs/features/{feature-name}/{FEATURE-NAME}.md`

```markdown
# {Feature Name}

## Overview

Brief description of the feature (1-2 paragraphs).

## User Stories

**As a [user type], I want [goal] so that [benefit].**

- As a household member, I want to track shared expenses...
- As a budget-conscious user, I want to set spending limits...

## Requirements

### Functional Requirements

- FR1: Users must be able to...
- FR2: System must calculate...

### Non-Functional Requirements

- NFR1: Must work offline
- NFR2: Must sync within 5 seconds of connectivity

## Use Cases

### Use Case 1: [Scenario Name]

**Actor:** User

**Preconditions:**

- User is authenticated
- User has at least one account

**Main Flow:**

1. User navigates to...
2. User enters...
3. System validates...
4. System saves...

**Postconditions:**

- Data persisted to IndexedDB
- Event created for sync

## Data Model

### Entities

**{EntityName}:**

- field1 (type) - description
- field2 (type) - description

**Relationships:**

- {Entity1} has many {Entity2}
- {Entity2} belongs to {Entity1}

## Integration

### Dependencies

- Requires: transactions, accounts
- Used by: analytics, reports

### Impact

- Adds 2 new database tables
- Modifies: transaction form component
- New routes: /feature-name

## Out of Scope

- Feature X (deferred to Phase 2)
- Advanced use case Y (future enhancement)

## Success Metrics

- 80%+ of users create at least one {entity}
- < 2s average load time for {feature} page

## Further Reading

- [Design Decisions]({FEATURE-NAME}-DECISIONS.md)
- [Validation Rules]({FEATURE-NAME}-VALIDATION.md)
- [Implementation Guide]({feature-name}-implementation.md)
```

### Step 3: Create Design Decisions Document

**File:** `docs/features/{feature-name}/{FEATURE-NAME}-DECISIONS.md`

```markdown
# {Feature Name} - Design Decisions

## Decision Log

### Decision 1: [Decision Title]

**Status:** Accepted | Rejected | Superseded

**Date:** YYYY-MM-DD

**Problem:**
What problem or question does this decision address?

**Decision:**
What was decided?

**Alternatives Considered:**

1. **Alternative A:** Description
   - Pros: ...
   - Cons: ...
2. **Alternative B:** Description
   - Pros: ...
   - Cons: ...

**Rationale:**
Why was this decision made? What factors influenced it?

**Trade-offs:**
What are the costs and benefits?

**Consequences:**

- Positive: ...
- Negative: ...
- Risks: ...

**Related Decisions:**

- Links to other decisions impacted by or impacting this one

---

### Decision 2: [Next Decision]

...
```

### Step 4: Create Validation Rules Document

**File:** `docs/features/{feature-name}/{FEATURE-NAME}-VALIDATION.md`

````markdown
# {Feature Name} - Validation Rules

## Input Validation

### Field: {field_name}

**Type:** string | number | boolean | date

**Constraints:**

- Required: Yes | No
- Min length: X
- Max length: Y
- Pattern: regex pattern
- Allowed values: enum values

**Examples:**

- Valid: "example value"
- Invalid: "bad value" (reason)

**Error message:** "User-friendly error message"

---

## Business Logic Validation

### Rule: {rule_name}

**Condition:** When X happens

**Validation:** Must satisfy Y

**Error message:** "User-friendly explanation"

**Implementation:**

```typescript
// Pseudocode or actual validation logic
if (!condition) {
  throw new ValidationError("Error message");
}
```
````

---

## Database Constraints

### Table: {table_name}

**Constraints:**

- PRIMARY KEY (id)
- NOT NULL (required_field)
- CHECK (amount > 0)
- UNIQUE (composite_key_1, composite_key_2)
- FOREIGN KEY (related_id) REFERENCES {other_table}(id)

---

## Edge Cases

### Edge Case 1: [Scenario]

**Description:** What unusual situation might occur?

**Handling:** How should the system respond?

**Example:** Concrete example of the edge case

````

### Step 5: Create Implementation Guide

**File:** `docs/features/{feature-name}/{feature-name}-implementation.md`

```markdown
# {Feature Name} - Implementation Guide

## Prerequisites

- Core MVP completed (Phase A)
- Database migrations up to date
- User authentication working

## Phase 1: Database Schema

### Step 1.1: Create Migration

```bash
supabase migration new add_{feature_name}
````

### Step 1.2: Define Schema

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_{feature_name}.sql

CREATE TABLE {table_name} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  field1 TYPE NOT NULL,
  field2 TYPE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_{table_name}_user ON {table_name}(user_id);

-- RLS Policies
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "{table_name}_user_select"
  ON {table_name}
  FOR SELECT
  USING (auth.uid() = user_id);

-- Add more policies...
```

### Step 1.3: Apply Migration

```bash
supabase db push
```

---

## Phase 2: Backend (Supabase)

### Step 2.1: Create RPC Functions

```sql
-- Function to handle complex business logic
CREATE OR REPLACE FUNCTION {function_name}(param1 TYPE, param2 TYPE)
RETURNS TYPE
LANGUAGE plpgsql
AS $$
BEGIN
  -- Implementation
END;
$$;
```

### Step 2.2: Add to Dexie Schema

```typescript
// src/lib/dexie/db.ts

class HouseholdHubDB extends Dexie {
  // Add new table
  {tableName}!: Table<{TypeName}>;

  constructor() {
    super("HouseholdHub");
    this.version(X).stores({
      // Existing tables...
      {tableName}: "id, userId, field1, field2, created_at",
    });
  }
}
```

---

## Phase 3: Types & Utilities

### Step 3.1: Define TypeScript Types

```typescript
// src/types/{feature_name}.ts

export interface {TypeName} {
  id: string;
  userId: string;
  field1: string;
  field2: number;
  createdAt: Date;
  updatedAt: Date;
}

export type {TypeName}Input = Omit<{TypeName}, "id" | "createdAt" | "updatedAt">;
```

### Step 3.2: Create Utilities

```typescript
// src/lib/{feature_name}.ts

export function validate{TypeName}(input: {TypeName}Input): ValidationResult {
  // Validation logic
}

export function calculate{Something}(data: {TypeName}): number {
  // Business logic
}
```

---

## Phase 4: Backend Queries

### Step 4.1: Create Hooks

```typescript
// src/hooks/use{Feature}.ts

export function use{Feature}List() {
  return useQuery({
    queryKey: ["{feature}"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("{table_name}")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useCreate{Feature}() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {TypeName}Input) => {
      const { data, error } = await supabase
        .from("{table_name}")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["{feature}"] });
    },
  });
}
```

---

## Phase 5: UI Components

### Step 5.1: Create Components

```bash
mkdir src/components/{feature-name}
```

**Components needed:**

- `{Feature}List.tsx` - List view
- `{Feature}Card.tsx` - Individual item card
- `{Feature}Form.tsx` - Create/edit form
- `{Feature}Detail.tsx` - Detail view

### Step 5.2: Create Routes

```typescript
// src/routes/{feature-name}.tsx

export const Route = createFileRoute("/{feature-name}")({
  component: {Feature}Page,
});

function {Feature}Page() {
  const { data } = use{Feature}List();

  return (
    <div>
      <h1>{Feature Name}</h1>
      <{Feature}List items={data} />
    </div>
  );
}
```

---

## Phase 6: Testing

### Step 6.1: Unit Tests

```typescript
// src/lib/{feature_name}.test.ts

describe("validate{TypeName}", () => {
  it("should accept valid input", () => {
    const input = { /* valid data */ };
    expect(validate{TypeName}(input).valid).toBe(true);
  });

  it("should reject invalid input", () => {
    const input = { /* invalid data */ };
    expect(validate{TypeName}(input).valid).toBe(false);
  });
});
```

### Step 6.2: Integration Tests

```typescript
// src/hooks/use{Feature}.test.ts

describe("use{Feature}List", () => {
  it("should fetch {feature} list", async () => {
    const { result } = renderHook(() => use{Feature}List());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });
});
```

### Step 6.3: E2E Tests

```typescript
// tests/e2e/{feature-name}.spec.ts

test("{feature} CRUD workflow", async ({ page }) => {
  // Navigate to {feature} page
  await page.goto("/{feature-name}");

  // Create new {feature}
  await page.click('[data-testid="add-{feature}"]');
  await page.fill('[name="field1"]', "value");
  await page.click('[type="submit"]');

  // Verify created
  await expect(page.locator("text=value")).toBeVisible();
});
```

---

## Phase 7: Documentation

### Step 7.1: Update Component README

Add to `/src/components/{feature-name}/README.md`

### Step 7.2: Update Route README

Add to `/src/routes/README.md`

### Step 7.3: Update CLAUDE.md

Add feature to quick reference if major

---

## Checklist

- [ ] Database migration created and applied
- [ ] RPC functions implemented (if needed)
- [ ] Dexie schema updated
- [ ] TypeScript types defined
- [ ] Utility functions created
- [ ] Data fetching hooks implemented
- [ ] UI components created
- [ ] Routes configured
- [ ] Unit tests written (80%+ coverage)
- [ ] Integration tests written
- [ ] E2E tests written for critical paths
- [ ] Documentation updated
- [ ] Accessibility tested (WCAG 2.1 AA)
- [ ] Performance tested (no regressions)
- [ ] Manual testing completed
- [ ] Code review completed
- [ ] Feature deployed to staging
- [ ] Feature deployed to production

---

## Rollout Strategy

### Stage 1: Internal Testing

- Deploy to staging environment
- Test with dev team
- Collect feedback

### Stage 2: Beta Testing

- Enable for beta users
- Monitor usage metrics
- Fix critical bugs

### Stage 3: General Availability

- Enable for all users
- Announce feature
- Provide user documentation

---

## Monitoring

**Metrics to track:**

- Feature adoption rate
- Error rate
- Average response time
- User satisfaction (feedback)

**Alerts:**

- Error rate > 5%
- Response time > 2s
- Feature usage drops > 50%

````

## Adding a New Feature

### 1. Create Feature Directory

```bash
mkdir -p docs/features/{new-feature-name}
````

### 2. Create Documentation Files

Use the templates above to create:

- Overview document
- Design decisions document
- Validation rules document
- Implementation guide

### 3. Update This README

Add new feature to the "Current Features" section above.

### 4. Link from Main Documentation

Update relevant documents:

- `/docs/initial plan/FEATURES.md` - Add to feature list
- `/docs/README.md` - Link to new feature docs if major

## Documentation Philosophy

### Progressive Disclosure

**Layer 1: Overview** - What and why (5 min read)

- User stories
- High-level requirements
- Use cases

**Layer 2: Decisions** - How and why not (15 min read)

- Design rationale
- Alternatives considered
- Trade-offs

**Layer 3: Validation** - Rules and constraints (10 min read)

- Input validation
- Business logic
- Edge cases

**Layer 4: Implementation** - Step-by-step (45 min read)

- Database schema
- Backend logic
- Frontend components
- Testing strategy

### Audience-Specific

**Product Managers:**

- Overview documents
- User stories
- Success metrics

**Architects/Senior Devs:**

- Design decisions
- Trade-off analysis
- System integration

**Developers:**

- Validation rules
- Implementation guides
- Code examples

**QA Engineers:**

- Validation rules
- Test checklists
- Edge cases

## Related Documentation

### Project Documentation

- [/docs/README.md](../README.md) - Main documentation hub
- [/docs/initial plan/FEATURES.md](../initial%20plan/FEATURES.md) - Feature catalog
- [/CLAUDE.md](../../CLAUDE.md) - Project quick reference

### Implementation Documentation

- [/src/README.md](../../src/README.md) - Source code overview
- [/src/components/README.md](../../src/components/README.md) - Component architecture
- [/supabase/README.md](../../supabase/README.md) - Backend infrastructure

### Architecture

- [/docs/initial plan/ARCHITECTURE.md](../initial%20plan/ARCHITECTURE.md) - System architecture
- [/docs/initial plan/DECISIONS.md](../initial%20plan/DECISIONS.md) - Architectural decisions
- [/docs/initial plan/DATABASE.md](../initial%20plan/DATABASE.md) - Database schema

## Further Reading

- [ADR (Architectural Decision Records)](https://adr.github.io/) - Decision documentation pattern
- [C4 Model](https://c4model.com/) - Software architecture diagrams
- [Feature Flags](https://martinfowler.com/articles/feature-toggles.html) - Gradual feature rollout
- [User Story Mapping](https://www.jpattonassociates.com/user-story-mapping/) - Feature planning technique
