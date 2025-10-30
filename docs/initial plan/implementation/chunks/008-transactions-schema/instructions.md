# Instructions: Transactions Schema

Follow these steps in order. Estimated time: 85 minutes.

---

## Step 0.5: Verify Prerequisites (5 min)

Ensure these are complete before proceeding:

**Check accounts exist:**

```sql
SELECT COUNT(*) FROM accounts;  -- Should return at least 2
```

**Check categories exist:**

```sql
SELECT COUNT(*) FROM categories WHERE parent_id IS NOT NULL;  -- Should return at least 5 child categories
```

**Check currency utilities exist:**

```bash
# Verify file exists with required functions
grep -E "(formatPHP|parsePHP|validateAmount)" src/lib/currency.ts
```

All three checks must pass before continuing.

---

## Step 1: Verify Transactions Table Exists (5 min)

Check Supabase SQL Editor:

```sql
-- Verify table exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions'
ORDER BY ordinal_position;
```

**Expected columns**:

- id (uuid)
- household_id (uuid)
- date (date) ← DATE type, not timestamp
- description (text)
- amount_cents (bigint) ← Always positive
- type (text) ← CHECK: 'income' or 'expense'
- currency_code (text) ← CHECK: 'PHP' only for MVP
- account_id (uuid, nullable)
- category_id (uuid, nullable)
- transfer_group_id (uuid, nullable)
- status (text) ← 'pending' or 'cleared'
- visibility (text) ← 'household' or 'personal'
- created_by_user_id (uuid)
- tagged_user_ids (uuid[]) ← Array
- notes (text, nullable)
- import_key (text, nullable)
- device_id (text, nullable)
- created_at (timestamptz)
- updated_at (timestamptz)

If table doesn't exist, create it from DATABASE.md lines 160-219.

---

## Step 1.5: Create Performance Indexes (10 min)

Add indexes for query performance (per Decision #64).

Run in Supabase SQL Editor:

```sql
-- Single-column indexes
CREATE INDEX idx_transactions_household ON transactions(household_id);
CREATE INDEX idx_transactions_date ON transactions(date DESC);
CREATE INDEX idx_transactions_month ON transactions(DATE_TRUNC('month', date));
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_visibility ON transactions(visibility);
CREATE INDEX idx_transactions_created_by ON transactions(created_by_user_id);
CREATE INDEX idx_transactions_type ON transactions(type);

-- Partial indexes (filtered)
CREATE INDEX idx_transactions_transfer
  ON transactions(transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

CREATE INDEX idx_transactions_import_key
  ON transactions(import_key)
  WHERE import_key IS NOT NULL;

-- GIN index for array column
CREATE INDEX idx_transactions_tagged_users
  ON transactions USING GIN (tagged_user_ids);

-- Compound indexes for common filter combinations
CREATE INDEX idx_transactions_account_date
  ON transactions(account_id, date DESC);

CREATE INDEX idx_transactions_category_date
  ON transactions(category_id, date DESC);

CREATE INDEX idx_transactions_status_date
  ON transactions(status, date DESC);

CREATE INDEX idx_transactions_household_visibility
  ON transactions(household_id, visibility);
```

Verify indexes created:

```sql
SELECT indexname
FROM pg_indexes
WHERE tablename = 'transactions'
ORDER BY indexname;
```

**Expected**: 16 indexes listed (not including primary key index).

**Why these indexes**: Per DATABASE.md Query Index Map (lines 1071-1213), these indexes support:

- Hot Query #1: Transaction list with date range
- Hot Query #2: Category totals (monthly)
- Hot Query #3: Account balance calculation
- Hot Query #4: Budget vs actual comparison
- Hot Query #5: Tagged transactions (@mentions)

---

## Step 2: Create Transaction Types (15 min)

Create `src/types/transactions.ts`:

```typescript
export type TransactionType = "income" | "expense";
export type TransactionStatus = "pending" | "cleared";
export type TransactionVisibility = "household" | "personal";

export interface Transaction {
  id: string;
  household_id: string;

  // Core fields
  date: string; // DATE type: "2024-01-15"
  description: string;
  amount_cents: number; // Always positive
  type: TransactionType;
  currency_code: string; // "PHP"

  // Relationships
  account_id: string | null;
  category_id: string | null;
  transfer_group_id: string | null;

  // Status and filtering
  status: TransactionStatus;
  visibility: TransactionVisibility;

  // User tracking
  created_by_user_id: string | null;
  tagged_user_ids: string[]; // @mentions

  // Additional data
  notes: string | null;
  import_key: string | null; // For deduplication

  // Sync and audit
  device_id: string | null;
  created_at: string; // TIMESTAMPTZ
  updated_at: string;
}

export interface TransactionInsert {
  household_id?: string;
  date: string; // "YYYY-MM-DD"
  description: string;
  amount_cents: number;
  type: TransactionType;
  account_id?: string | null;
  category_id?: string | null;
  transfer_group_id?: string | null;
  status?: TransactionStatus;
  visibility?: TransactionVisibility;
  created_by_user_id?: string;
  tagged_user_ids?: string[];
  notes?: string | null;
}

export interface TransactionUpdate {
  date?: string;
  description?: string;
  amount_cents?: number;
  type?: TransactionType;
  account_id?: string | null;
  category_id?: string | null;
  status?: TransactionStatus;
  notes?: string | null;
  tagged_user_ids?: string[];
}

export interface TransactionFilters {
  account_id?: string;
  category_id?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  date_from?: string;
  date_to?: string;
  exclude_transfers?: boolean; // For analytics
}

// Helper: Create transfer pair
export interface TransferPair {
  from_transaction: TransactionInsert;
  to_transaction: TransactionInsert;
  transfer_group_id: string;
}
```

---

## Step 3: Add Transaction Query Hooks (20 min)

Update `src/lib/supabaseQueries.ts`:

```typescript
import type {
  Transaction,
  TransactionInsert,
  TransactionUpdate,
  TransactionFilters,
} from "@/types/transactions";

// Fetch transactions with filters
export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(
          `
          *,
          account:accounts(id, name),
          category:categories(id, name, color)
        `
        )
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      // Apply filters
      if (filters?.account_id) {
        query = query.eq("account_id", filters.account_id);
      }
      if (filters?.category_id) {
        query = query.eq("category_id", filters.category_id);
      }
      if (filters?.type) {
        query = query.eq("type", filters.type);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.date_from) {
        query = query.gte("date", filters.date_from);
      }
      if (filters?.date_to) {
        query = query.lte("date", filters.date_to);
      }
      if (filters?.exclude_transfers) {
        query = query.is("transfer_group_id", null);
      }

      const { data, error } = await query.limit(100); // Pagination later

      if (error) throw error;
      return data as Transaction[];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Fetch single transaction
export function useTransaction(id: string) {
  return useQuery({
    queryKey: ["transaction", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").eq("id", id).single();

      if (error) throw error;
      return data as Transaction;
    },
  });
}

// Create transaction
export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transaction: TransactionInsert) => {
      const { data, error } = await supabase
        .from("transactions")
        .insert(transaction)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] }); // Balance updated
    },
  });
}

// Update transaction
export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TransactionUpdate }) => {
      const { data, error } = await supabase
        .from("transactions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// Delete transaction
export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// Toggle status (pending ↔ cleared)
export function useToggleTransactionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Fetch current status
      const { data: current } = await supabase
        .from("transactions")
        .select("status")
        .eq("id", id)
        .single();

      if (!current) throw new Error("Transaction not found");

      const newStatus = current.status === "pending" ? "cleared" : "pending";

      const { error } = await supabase
        .from("transactions")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
```

---

## Step 4: Create RLS Policies (10 min)

Run in Supabase SQL Editor:

```sql
-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- View transactions policy
CREATE POLICY "View transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    visibility = 'household'
    OR created_by_user_id = auth.uid()
  );

-- Create transactions policy
CREATE POLICY "Create transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

-- Update transactions policy
CREATE POLICY "Update transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR visibility = 'household'
  );

-- Delete transactions policy
CREATE POLICY "Delete transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (created_by_user_id = auth.uid());
```

Verify policies:

```sql
SELECT * FROM pg_policies WHERE tablename = 'transactions';
```

---

## Step 4.5: Create Transfer Integrity Triggers (10 min)

Add database-level transfer validation (Decision #60).

Run in Supabase SQL Editor:

```sql
-- Function: Ensure transfer transactions maintain integrity on INSERT/UPDATE
CREATE OR REPLACE FUNCTION check_transfer_integrity()
RETURNS TRIGGER AS $$
DECLARE
  transfer_count INT;
  opposite_type TEXT;
  total_amount BIGINT;
BEGIN
  -- Only check if this is part of a transfer
  IF NEW.transfer_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count existing transactions in this transfer group
  SELECT COUNT(*), SUM(amount_cents)
  INTO transfer_count, total_amount
  FROM transactions
  WHERE transfer_group_id = NEW.transfer_group_id
    AND id != NEW.id;

  -- Ensure maximum 2 transactions per transfer group
  IF transfer_count >= 2 THEN
    RAISE EXCEPTION 'Transfer group can only have 2 transactions';
  END IF;

  -- If this is the second transaction, verify opposite types
  IF transfer_count = 1 THEN
    -- Get the type of the other transaction
    SELECT type INTO opposite_type
    FROM transactions
    WHERE transfer_group_id = NEW.transfer_group_id
      AND id != NEW.id;

    -- Ensure opposite types (one income, one expense)
    IF NEW.type = opposite_type THEN
      RAISE EXCEPTION 'Transfer must have opposite types (income/expense)';
    END IF;

    -- Ensure same amount
    IF NEW.amount_cents != total_amount THEN
      RAISE EXCEPTION 'Transfer transactions must have same amount';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Handle transfer deletion (nullify paired transaction)
CREATE OR REPLACE FUNCTION handle_transfer_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- If deleting a transfer transaction, nullify the pair's transfer_group_id
  IF OLD.transfer_group_id IS NOT NULL THEN
    UPDATE transactions
    SET transfer_group_id = NULL
    WHERE transfer_group_id = OLD.transfer_group_id
      AND id != OLD.id;

    -- Log for potential review
    RAISE NOTICE 'Transfer deleted: paired transaction converted to regular transaction';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to transactions table
CREATE TRIGGER ensure_transfer_integrity
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION check_transfer_integrity();

CREATE TRIGGER handle_transfer_deletion_trigger
  BEFORE DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION handle_transfer_deletion();
```

Verify triggers exist:

```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'transactions'
ORDER BY trigger_name;
```

**Expected**: At least 2 triggers listed (ensure_transfer_integrity, handle_transfer_deletion_trigger).

**Note**: When a transfer transaction is deleted, the paired transaction is automatically converted to a regular transaction (transfer_group_id set to NULL). User can then re-categorize or delete it separately.

---

## Step 5: Seed Test Transactions (10 min)

**⚠️ Important**: The seed script uses `auth.uid()` which returns NULL when run in SQL Editor. Replace `auth.uid()` with your actual user UUID:

```sql
-- Get your user ID first
SELECT id FROM auth.users LIMIT 1;
-- Copy the UUID
```

Then replace all instances of `(SELECT user_id FROM seed_data)` in the seed script below with `'your-copied-uuid'::uuid`.

**Alternative**: Run the seed script from your application code where authentication context is available.

---

Create `scripts/seed-transactions.sql`:

```sql
-- Seed 20+ test transactions
-- Assumes accounts and categories exist from previous chunks

-- Get account and category IDs (adjust based on your data)
WITH seed_data AS (
  SELECT
    (SELECT id FROM accounts WHERE name LIKE '%Checking%' LIMIT 1) as checking_id,
    (SELECT id FROM accounts WHERE name LIKE '%Savings%' LIMIT 1) as savings_id,
    (SELECT id FROM categories WHERE name = 'Groceries' LIMIT 1) as groceries_id,
    (SELECT id FROM categories WHERE name = 'Gas' LIMIT 1) as gas_id,
    (SELECT id FROM categories WHERE name = 'Dining Out' LIMIT 1) as dining_id,
    (SELECT id FROM categories WHERE name = 'Electricity' LIMIT 1) as electricity_id,
    (SELECT id FROM categories WHERE name = 'Internet' LIMIT 1) as internet_id,
    auth.uid() as user_id
)
INSERT INTO transactions (
  date,
  description,
  amount_cents,
  type,
  account_id,
  category_id,
  status,
  visibility,
  created_by_user_id
)
SELECT * FROM (VALUES
  -- Income
  (CURRENT_DATE - INTERVAL '1 day', 'Salary', 5000000, 'income', (SELECT checking_id FROM seed_data), NULL, 'cleared', 'household', (SELECT user_id FROM seed_data)),

  -- Groceries (last 30 days)
  (CURRENT_DATE - INTERVAL '2 days', 'SM Supermarket', 250050, 'expense', (SELECT checking_id FROM seed_data), (SELECT groceries_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE - INTERVAL '5 days', 'Puregold', 180025, 'expense', (SELECT checking_id FROM seed_data), (SELECT groceries_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE - INTERVAL '12 days', 'Robinsons Supermarket', 320075, 'expense', (SELECT checking_id FROM seed_data), (SELECT groceries_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE - INTERVAL '19 days', 'SM Supermarket', 285050, 'expense', (SELECT checking_id FROM seed_data), (SELECT groceries_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE - INTERVAL '26 days', 'Puregold', 195000, 'expense', (SELECT checking_id FROM seed_data), (SELECT groceries_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),

  -- Dining
  (CURRENT_DATE - INTERVAL '3 days', 'Jollibee', 35000, 'expense', (SELECT checking_id FROM seed_data), (SELECT dining_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE - INTERVAL '7 days', 'Mang Inasal', 42500, 'expense', (SELECT checking_id FROM seed_data), (SELECT dining_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE - INTERVAL '14 days', 'Max''s Restaurant', 125000, 'expense', (SELECT checking_id FROM seed_data), (SELECT dining_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),

  -- Transportation
  (CURRENT_DATE - INTERVAL '1 day', 'Shell Gas', 200000, 'expense', (SELECT checking_id FROM seed_data), (SELECT gas_id FROM seed_data), 'pending', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE - INTERVAL '8 days', 'Petron Gas', 185000, 'expense', (SELECT checking_id FROM seed_data), (SELECT gas_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE - INTERVAL '15 days', 'Shell Gas', 195000, 'expense', (SELECT checking_id FROM seed_data), (SELECT gas_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),

  -- Utilities
  (CURRENT_DATE - INTERVAL '10 days', 'Meralco', 450000, 'expense', (SELECT checking_id FROM seed_data), (SELECT electricity_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE - INTERVAL '12 days', 'PLDT Internet', 149900, 'expense', (SELECT checking_id FROM seed_data), (SELECT internet_id FROM seed_data), 'cleared', 'household', (SELECT user_id FROM seed_data)),

  -- Pending transactions
  (CURRENT_DATE, 'Pending grocery', 150000, 'expense', (SELECT checking_id FROM seed_data), (SELECT groceries_id FROM seed_data), 'pending', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE, 'Pending gas', 180000, 'expense', (SELECT checking_id FROM seed_data), (SELECT gas_id FROM seed_data), 'pending', 'household', (SELECT user_id FROM seed_data))
) AS t(date, description, amount_cents, type, account_id, category_id, status, visibility, created_by_user_id);

-- Create a transfer pair (Checking → Savings)
WITH transfer_id AS (SELECT gen_random_uuid() as id),
     seed_data AS (
       SELECT
         (SELECT id FROM accounts WHERE name LIKE '%Checking%' LIMIT 1) as checking_id,
         (SELECT id FROM accounts WHERE name LIKE '%Savings%' LIMIT 1) as savings_id,
         auth.uid() as user_id
     )
INSERT INTO transactions (
  date,
  description,
  amount_cents,
  type,
  account_id,
  transfer_group_id,
  status,
  visibility,
  created_by_user_id
)
SELECT * FROM (VALUES
  (CURRENT_DATE - INTERVAL '20 days', 'Transfer to Savings', 100000, 'expense', (SELECT checking_id FROM seed_data), (SELECT id FROM transfer_id), 'cleared', 'household', (SELECT user_id FROM seed_data)),
  (CURRENT_DATE - INTERVAL '20 days', 'Transfer from Checking', 100000, 'income', (SELECT savings_id FROM seed_data), (SELECT id FROM transfer_id), 'cleared', 'household', (SELECT user_id FROM seed_data))
) AS t(date, description, amount_cents, type, account_id, transfer_group_id, status, visibility, created_by_user_id);

-- Verify
SELECT COUNT(*) as total_transactions FROM transactions;
SELECT type, COUNT(*) FROM transactions GROUP BY type;
SELECT status, COUNT(*) FROM transactions GROUP BY status;
```

Run in Supabase SQL Editor.

---

## Done!

When transactions are seeded and query hooks work, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.
