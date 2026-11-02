# Utility Scripts (`/scripts/`)

## Purpose

The scripts directory contains **utility scripts** for development tasks like generating PWA icons, seeding data, and importing categories from Excel.

## Scripts

### `generate-icons.mjs`

**Purpose:** Draw every icon, badge, shortcut icon and iOS splash image from the app mark (`src/assets/app-mark.svg`)

**Usage:**

```bash
npm run generate:icons
```

**Output:** `/public/icons/` (favicons, apple-touch icon, `any` and maskable manifest icons, notification badge, shortcut icons) and `/public/splash/` (light and dark sets)

**Dependencies:** Playwright's Chromium (already installed for e2e)

**Note:** Colors come from `src/index.css`. The splash files are the ones `index.html`'s `apple-touch-startup-image` tags name; to add a device, add its tag first

### `read-excel-categories.cjs`

**Purpose:** Extract categories from Excel spreadsheet (Savings_Expenses template)

**Usage:**

```bash
node scripts/read-excel-categories.cjs
```

**Input:** Excel file with category structure

**Output:** Prints SQL INSERT statements for categories

**Dependencies:** `xlsx` npm package

**Use Case:** Import user's existing category structure

### `seed-categories.sql`

**Purpose:** Basic category seed data (8 parents, ~25 children)

**Usage:**

```sql
-- In Supabase SQL Editor
-- Copy and paste entire file
```

**Categories:**

- Food (Groceries, Dining out, etc.)
- Transportation (Gas, Public transit, etc.)
- Housing (Rent, Utilities, etc.)
- Healthcare (Medical, Pharmacy, etc.)
- Entertainment (Movies, Hobbies, etc.)
- Shopping (Clothing, Electronics, etc.)
- Personal Care (Haircuts, Gym, etc.)
- Other (Miscellaneous, Gifts, etc.)

### `seed-categories-custom.sql`

**Purpose:** Comprehensive category seed data (8 parents, 69 children)

**Usage:**

```sql
-- In Supabase SQL Editor
-- Copy and paste entire file
```

**Source:** Based on actual Savings_Expenses spreadsheet

**More detailed** than basic seed (includes specific Filipino categories)

### `seed-transactions.sql`

**Purpose:** Sample transaction data for testing

**Usage:**

1. Get your user UUID: `SELECT id FROM auth.users LIMIT 1;`
2. Replace `YOUR-USER-UUID-HERE` in script with actual UUID
3. Run in Supabase SQL Editor

**Generates:**

- 50+ sample transactions
- Various types (income, expense)
- Different categories and accounts
- Date range: Past 3 months

**Use Case:** Test transaction list, charts, analytics with realistic data

## Running Scripts

### Node.js Scripts

**Requirements:**

- Node.js 18+
- Dependencies installed (`npm install`)

**Execute:**

```bash
node scripts/[script-name].js
# or
node scripts/[script-name].cjs  # CommonJS module
```

### SQL Scripts

**Requirements:**

- Supabase project set up
- Database migrations applied
- User account created

**Execute:**

1. Open Supabase Studio: http://localhost:54323 (local) or dashboard (production)
2. Navigate to SQL Editor
3. Copy and paste script contents
4. Click "Run" or press Cmd/Ctrl + Enter

## Adding New Scripts

### Node.js Script Template

```javascript
#!/usr/bin/env node

/**
 * Script Name
 *
 * Purpose: What this script does
 * Usage: node scripts/my-script.js [args]
 */

async function main() {
  try {
    console.log("Starting script...");

    // Script logic here

    console.log("Script complete!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
```

### SQL Script Template

```sql
-- =====================================================
-- Script: My Script Name
-- =====================================================
-- Purpose: What this script does
-- Dependencies: Tables or data required
-- Usage: Copy and paste into Supabase SQL Editor
-- =====================================================

BEGIN;

-- Script SQL here

COMMIT;
```

## Development Workflows

### Generating PWA Icons

**When needed:**

- Initial setup
- Icon design changes
- Adding new icon sizes

**Steps:**

1. Update `src/assets/app-mark.svg`
2. Run `npm run generate:icons`
3. Verify icons in `/public/icons/` and `/public/splash/`
4. Test PWA install on mobile

### Seeding Categories

**When needed:**

- New environment setup
- Resetting test data
- Importing user's categories

**Steps:**

1. Choose seed script (basic or custom)
2. Run in Supabase SQL Editor
3. Verify categories in app
4. Test category selection

### Importing Excel Data

**When needed:**

- User has existing Excel expense tracker
- Migrating from Google Sheets

**Steps:**

1. Export spreadsheet to Excel format
2. Run `node scripts/read-excel-categories.cjs`
3. Copy generated SQL
4. Run in Supabase SQL Editor

## Related Documentation

### Project Documentation

- [/CLAUDE.md](../CLAUDE.md) - Project quick reference

### Seed Data

- [/supabase/seed.sql](../supabase/seed.sql) - Database seed file

### PWA Configuration

- [/docs/initial plan/PWA-MANIFEST.md](../docs/initial%20plan/PWA-MANIFEST.md) - PWA setup

## Further Reading

- [Node.js Scripts](https://nodejs.org/docs/latest/api/) - Node.js API
- [xlsx Package](https://www.npmjs.com/package/xlsx) - Excel parsing
