# Troubleshooting Guide

> **Purpose**: "It broke" → Fix it. Symptom-based diagnosis for common issues across all chunks.

## Table of Contents

- [🔍 How to Use This Guide](#-how-to-use-this-guide)
- [🚀 Setup & Environment](#-setup--environment)
- [🔐 Authentication Issues](#-authentication-issues)
- [🗄️ Database & Supabase](#️-database--supabase)
- [💸 Currency & Display](#-currency--display)
- [📴 Offline & Storage](#-offline--storage)
- [🔄 Sync & Multi-Device](#-sync--multi-device)
- [⚛️ React & Frontend](#️-react--frontend)
- [🏗️ Build & Deployment](#️-build--deployment)
- [⚡ Performance](#-performance)
- [🔧 Developer Tools](#-developer-tools)

---

## 🔍 How to Use This Guide

1. **Find your symptom** in the table of contents
2. **Match the symptom** to a specific issue
3. **Follow the diagnosis** steps
4. **Apply the solution**
5. **Verify the fix** worked

**If still stuck**: Check chunk-specific `troubleshooting.md` in the chunk folder.

---

## 🚀 Setup & Environment

### Issue: `npm install` fails

**Symptoms**:

- "Cannot find module"
- "Peer dependency conflict"
- "ERESOLVE unable to resolve dependency tree"

**Diagnosis**:

```bash
# Check Node version
node --version  # Should be 18+ or 20+

# Check npm version
npm --version   # Should be 9+
```

**Solutions**:

1. **Wrong Node version**:

   ```bash
   # Use nvm to switch
   nvm install 20
   nvm use 20
   ```

2. **Peer dependency conflicts**:

   ```bash
   # Use legacy peer deps (last resort)
   npm install --legacy-peer-deps
   ```

3. **Corrupted cache**:
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

---

### Issue: `npm run dev` crashes immediately

**Symptoms**:

- "Module not found"
- "SyntaxError: Unexpected token"
- "Cannot use import statement outside a module"

**Diagnosis**:

```bash
# Check package.json has type: "module"
grep '"type"' package.json

# Check vite.config.ts exists
ls vite.config.ts

# Check TypeScript config
cat tsconfig.json
```

**Solutions**:

1. **Missing dependencies**:

   ```bash
   npm install
   ```

2. **TypeScript compilation error**:

   ```bash
   npx tsc --noEmit  # Check for TS errors
   ```

3. **Vite config issue**:
   - Verify `vite.config.ts` has correct imports
   - Check path aliases configured: `@/` → `./src/`

---

### Issue: Environment variables not loading

**Symptoms**:

- "VITE_SUPABASE_URL is undefined"
- API calls fail with "undefined URL"
- Console shows "undefined" for env vars

**Diagnosis**:

```bash
# Check file exists
ls .env.local

# Check variable names
cat .env.local | grep VITE_
```

**Solutions**:

1. **Wrong file name**:
   - Must be `.env.local` (NOT `.env`)
   - Vite requires `VITE_` prefix

2. **Not committed** (intentional):
   - `.env.local` should be in `.gitignore`
   - Create it locally based on `.env.example`

3. **Server not restarted**:

   ```bash
   # Restart dev server
   # Ctrl+C, then:
   npm run dev
   ```

4. **Template**:
   ```bash
   # .env.local
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

---

## 🔐 Authentication Issues

### Issue: "Invalid login credentials" on correct password

**Symptoms**:

- Can't log in despite correct email/password
- "Invalid login credentials" error
- Works in Supabase dashboard, fails in app

**Diagnosis**:

```typescript
// Check Supabase client initialization
console.log(supabase.auth); // Should be defined

// Check API keys
console.log(import.meta.env.VITE_SUPABASE_URL);
console.log(import.meta.env.VITE_SUPABASE_ANON_KEY);
```

**Solutions**:

1. **Wrong API keys**:
   - Copy from Supabase dashboard → Settings → API
   - Use `anon` key, NOT `service_role` key

2. **Email not confirmed**:
   - Check Supabase dashboard → Authentication → Users
   - If "Email Confirmed" = false, resend confirmation
   - Or disable email confirmation in dashboard for development

3. **RLS blocking access**:
   - Check `profiles` table has correct RLS policies
   - Ensure `auth.uid()` function works

---

### Issue: User logged out immediately after login

**Symptoms**:

- Login succeeds, then immediately redirects to login page
- Session doesn't persist across page reloads
- `useAuthStore` shows user as null

**Diagnosis**:

```typescript
// Check session persists
supabase.auth.getSession().then(({ data }) => {
  console.log("Session:", data.session);
});

// Check Zustand store
const authStore = useAuthStore.getState();
console.log("Auth store:", authStore.user);
```

**Solutions**:

1. **Zustand not persisting**:

   ```typescript
   // Ensure persist middleware configured
   import { persist } from "zustand/middleware";

   const useAuthStore = create(
     persist(
       (set) => ({
         /* ... */
       }),
       { name: "auth-storage" }
     )
   );
   ```

2. **Session storage cleared**:
   - Check browser's Application → Storage
   - Supabase uses localStorage for session
   - Don't clear storage in dev tools

3. **RLS policy blocks profile read**:
   - User can log in but can't read their profile
   - Check `profiles` SELECT policy

---

### Issue: "Row Level Security" permission denied

**Symptoms**:

- "new row violates row-level security policy"
- "permission denied for table profiles"
- Can't INSERT/UPDATE despite being authenticated

**Diagnosis**:

```sql
-- Check RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'profiles';

-- Check policies exist
SELECT * FROM pg_policies
WHERE tablename = 'profiles';
```

**Solutions**:

1. **Missing INSERT policy**:

   ```sql
   -- Add INSERT policy
   CREATE POLICY "users_insert_own_profile" ON profiles
   FOR INSERT TO authenticated
   WITH CHECK (id = auth.uid());
   ```

2. **Policy uses wrong function**:
   - Use `auth.uid()` NOT `current_user`
   - `auth.uid()` returns UUID of authenticated user

3. **Policy too restrictive**:
   - Check USING and WITH CHECK clauses
   - Test with `SET ROLE authenticated;` in SQL editor

---

## 🗄️ Database & Supabase

### Issue: Migration fails with "relation already exists"

**Symptoms**:

- "relation [table name] already exists"
- Migration partially applied
- Can't run migration again

**Diagnosis**:

```sql
-- Check if table exists
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'your_table';

-- Check migration history
SELECT * FROM supabase_migrations.schema_migrations
ORDER BY version DESC;
```

**Solutions**:

1. **Migration already applied**:
   - Don't re-run same migration
   - Create a new migration to modify table

2. **Partial migration**:

   ```sql
   -- Rollback manually
   BEGIN;
   DROP TABLE IF EXISTS your_table CASCADE;
   -- Re-run migration
   COMMIT;
   ```

3. **Use CREATE IF NOT EXISTS**:
   ```sql
   CREATE TABLE IF NOT EXISTS your_table (...);
   ```

---

### Issue: Foreign key constraint violation

**Symptoms**:

- "violates foreign key constraint"
- "Key is not present in table [referenced table]"
- Can't INSERT transaction with account_id

**Diagnosis**:

```sql
-- Check referenced record exists
SELECT id FROM accounts WHERE id = 'your-uuid';

-- Check constraint definition
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'transactions';
```

**Solutions**:

1. **Referenced record doesn't exist**:
   - Create account first, then transaction
   - Check UUID is correct (not mixing up IDs)

2. **Deleting referenced record**:
   - Set foreign key to `ON DELETE CASCADE` or `ON DELETE SET NULL`
   - Or delete dependent records first

3. **Wrong UUID**:
   - Verify account_id matches existing account
   - Use query to find valid IDs

---

### Issue: "Cannot read properties of null (reading X)" in queries

**Symptoms**:

- Query returns null unexpectedly
- `data.field` throws error
- Empty result set when data should exist

**Diagnosis**:

```typescript
// Log the full response
const { data, error } = await supabase.from("transactions").select();
console.log("Data:", data);
console.log("Error:", error);

// Check for RLS blocking
const { data, error } = await supabase.from("transactions").select().eq("id", "your-id");
```

**Solutions**:

1. **RLS blocking query**:
   - Check user is authenticated
   - Verify RLS policy allows SELECT
   - Test query in Supabase SQL editor

2. **Wrong table/column name**:
   - Check for typos
   - Verify schema matches code

3. **Null handling**:

   ```typescript
   // Use optional chaining
   const amount = data?.amount_cents ?? 0;

   // Or check before accessing
   if (data && data.amount_cents) {
     // Safe to use
   }
   ```

---

## 💸 Currency & Display

### Issue: Amount displays as "1500.5" instead of "₱1,500.50"

**Symptoms**:

- No peso symbol (₱)
- No thousand separators
- Wrong number of decimals
- Shows raw cents value (150050)

**Diagnosis**:

```typescript
// Check you're calling formatPHP
import { formatPHP } from "@/lib/currency";
console.log(formatPHP(150050)); // Should be "₱1,500.50"

// Check value is in cents
console.log(transaction.amount_cents); // Should be number like 150050
```

**Solutions**:

1. **Not using formatPHP**:

   ```typescript
   // ❌ WRONG
   <span>{transaction.amount_cents}</span>

   // ✅ CORRECT
   <span>{formatPHP(transaction.amount_cents)}</span>
   ```

2. **Value not in cents**:

   ```typescript
   // If value is in pesos (1500.50), convert
   const cents = Math.round(pesos * 100);
   formatPHP(cents);
   ```

3. **formatPHP not implemented**:
   - Check `src/lib/currency.ts` exists
   - Implement per DATABASE.md lines 1070-1224

---

### Issue: parsePHP returns wrong value

**Symptoms**:

- Input "1,500.50" becomes 1
- Decimals lost
- Negative values

**Diagnosis**:

```typescript
import { parsePHP } from "@/lib/currency";

console.log(parsePHP("1,500.50")); // Should be 150050
console.log(parsePHP("1500.50")); // Should be 150050
console.log(parsePHP(1500.5)); // Should be 150050
```

**Solutions**:

1. **String parsing issue**:

   ```typescript
   function parsePHP(value: string | number): number {
     // Remove non-numeric except decimal point
     const cleanValue = String(value).replace(/[^0-9.]/g, "");
     // Convert to cents
     return Math.round(parseFloat(cleanValue) * 100);
   }
   ```

2. **Floating point precision**:
   - Use `Math.round()` to avoid `150049.99999`

3. **Validation**:
   ```typescript
   const cents = parsePHP(input);
   if (!validateAmount(cents)) {
     throw new Error("Amount out of range");
   }
   ```

---

## 📴 Offline & Storage

### Issue: "QuotaExceededError" when writing to IndexedDB

**Symptoms**:

- IndexedDB write throws exception
- "QuotaExceededError: The quota has been exceeded"
- Data not saving offline

**Diagnosis**:

```typescript
// Check storage quota
navigator.storage.estimate().then(({ usage, quota }) => {
  console.log(`Using ${usage} of ${quota} bytes`);
  console.log(`Percentage: ${((usage / quota) * 100).toFixed(2)}%`);
});
```

**Solutions**:

1. **Storage full**:
   - Implement cleanup: Delete old synced data
   - Warn user at 80% quota
   - Force cleanup at 95% quota

2. **Too much data at once**:
   - Batch writes: Write 100 records at a time
   - Use transactions to ensure atomicity

3. **Request persistent storage**:
   ```typescript
   navigator.storage.persist().then((granted) => {
     if (granted) {
       console.log("Persistent storage granted");
     }
   });
   ```

---

### Issue: IndexedDB schema version conflict

**Symptoms**:

- "VersionError: An attempt was made to open a database using a lower version"
- Dexie upgrade fails
- Data lost after schema change

**Diagnosis**:

```typescript
// Check Dexie version
const db = new Dexie("HouseholdHubDB");
console.log("Version:", db.verno);
```

**Solutions**:

1. **Increment version**:

   ```typescript
   db.version(2).stores({
     // New schema
   });

   db.version(2).upgrade((tx) => {
     // Migration logic
   });
   ```

2. **Don't decrement version**:
   - Always increment, never go backwards
   - Can't downgrade IndexedDB

3. **Clear database** (development only):
   ```typescript
   // DevTools → Application → Storage → IndexedDB → Delete
   // Or programmatically:
   await db.delete();
   ```

---

### Issue: Data doesn't sync after going online

**Symptoms**:

- Offline changes not appearing on server
- Sync queue stuck
- No error messages

**Diagnosis**:

```typescript
// Check sync queue
const pendingItems = await db.syncQueue.where("status").equals("queued").toArray();
console.log("Pending:", pendingItems);

// Check online status
console.log("Online:", navigator.onLine);

// Check sync processor running
// Add logs to your sync processor
```

**Solutions**:

1. **Sync processor not running**:

   ```typescript
   // Trigger manually
   window.addEventListener("online", () => {
     syncQueue.process();
   });
   ```

2. **Background Sync not supported** (iOS Safari):
   - Implement manual sync button
   - Sync on app focus

   ```typescript
   window.addEventListener("focus", () => {
     if (navigator.onLine && hasPendingChanges()) {
       syncQueue.process();
     }
   });
   ```

3. **Queue items failed**:
   - Check `status = 'failed'` items
   - Review error messages
   - Retry manually

---

## 🔄 Sync & Multi-Device

### Issue: Duplicate events created

**Symptoms**:

- Same transaction appears twice
- Event log has duplicate entries
- Idempotency key constraint violation

**Diagnosis**:

```sql
-- Check for duplicate idempotency keys
SELECT idempotency_key, COUNT(*)
FROM transaction_events
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
```

**Solutions**:

1. **Idempotency key not unique**:

   ```typescript
   // Ensure format includes all components
   const key = `${deviceId}-${entityType}-${entityId}-${lamportClock}`;
   ```

2. **Lamport clock not incrementing**:
   - Must increment atomically per device+entity
   - Use database sequence or in-memory counter

3. **Database constraint missing**:
   ```sql
   ALTER TABLE transaction_events
   ADD CONSTRAINT idempotency_key_unique UNIQUE (idempotency_key);
   ```

---

### Issue: Conflict resolution loses data

**Symptoms**:

- After sync, some changes disappear
- Field updated on one device reverted on another
- Only one device's changes survive

**Diagnosis**:

```typescript
// Log conflict detection
console.log("Local vector clock:", localClock);
console.log("Remote vector clock:", remoteClock);
console.log("Conflict detected:", detectConflict(localClock, remoteClock));

// Log resolution
console.log("Resolved state:", resolvedEntity);
```

**Solutions**:

1. **Using entity-level LWW instead of field-level**:

   ```typescript
   // ❌ WRONG: Overwrites all fields
   const resolved = remoteTimestamp > localTimestamp ? remote : local;

   // ✅ CORRECT: Merge fields
   const resolved = {
     amount_cents:
       remoteAmount.timestamp > localAmount.timestamp ? remoteAmount.value : localAmount.value,
     description: remoteDesc.timestamp > localDesc.timestamp ? remoteDesc.value : localDesc.value,
   };
   ```

2. **Not using server canonical timestamp**:
   - Use `created_at` from Supabase, not local timestamp
   - Server time is source of truth

3. **DELETE logic wrong**:
   - DELETE should always win over UPDATE
   - Check `operation === 'delete'` first

---

### Issue: Device ID keeps changing

**Symptoms**:

- New device registered on every page load
- Multiple devices for same physical device
- Sync queue has entries from many device IDs

**Diagnosis**:

```typescript
// Check stored device ID
const storedId = await db.meta.get("deviceId");
console.log("Stored ID:", storedId);

// Check localStorage fallback
console.log("localStorage ID:", localStorage.getItem("deviceId"));

// Check FingerprintJS
import FingerprintJS from "@fingerprintjs/fingerprintjs";
const fp = await FingerprintJS.load();
const result = await fp.get();
console.log("Fingerprint ID:", result.visitorId);
```

**Solutions**:

1. **IndexedDB write failing**:
   - Check for QuotaExceededError
   - Verify write succeeded

   ```typescript
   await db.meta.put({ key: "deviceId", value: deviceId });
   const verify = await db.meta.get("deviceId");
   console.assert(verify === deviceId, "Device ID not persisted");
   ```

2. **localStorage cleared**:
   - Users clear site data
   - Use FingerprintJS fallback

3. **Hybrid strategy not implemented**:

   ```typescript
   async function getDeviceId(): Promise<string> {
     // 1. Try IndexedDB
     let deviceId = await db.meta.get("deviceId");
     if (deviceId) return deviceId;

     // 2. Try localStorage
     deviceId = localStorage.getItem("deviceId");
     if (deviceId) {
       await db.meta.put({ key: "deviceId", value: deviceId });
       return deviceId;
     }

     // 3. Generate with FingerprintJS
     const fp = await FingerprintJS.load();
     const result = await fp.get();
     deviceId = `fp-${result.visitorId}`;

     // Store in both
     await db.meta.put({ key: "deviceId", value: deviceId });
     localStorage.setItem("deviceId", deviceId);

     return deviceId;
   }
   ```

---

## ⚛️ React & Frontend

### Issue: "Cannot update a component while rendering a different component"

**Symptoms**:

- React warning in console
- State updates happen during render
- Infinite render loop

**Diagnosis**:

```typescript
// Check for setState during render
function MyComponent() {
  const [data, setData] = useState([]);

  // ❌ WRONG: setState during render
  if (!data) {
    setData(fetchData()); // Infinite loop!
  }
}
```

**Solutions**:

1. **Use useEffect**:

   ```typescript
   useEffect(() => {
     fetchData().then(setData);
   }, []); // Empty deps = run once
   ```

2. **Use TanStack Query**:
   ```typescript
   const { data } = useQuery({
     queryKey: ["transactions"],
     queryFn: fetchTransactions,
   });
   ```

---

### Issue: TanStack Query infinite refetch loop

**Symptoms**:

- Query refetches continuously
- Network tab shows repeated requests
- High CPU usage

**Diagnosis**:

```typescript
// Check query key
const { data } = useQuery({
  queryKey: ["transactions", filters], // filters is the issue
  queryFn: () => fetchTransactions(filters),
});

// Log when query runs
console.log("Query key changed:", ["transactions", filters]);
```

**Solutions**:

1. **Unstable query key**:

   ```typescript
   // ❌ WRONG: Object recreated every render
   const filters = { date: new Date() };

   // ✅ CORRECT: Stable reference
   const [filters, setFilters] = useState({ date: new Date() });

   // Or use useMemo
   const filters = useMemo(() => ({ date: new Date() }), []);
   ```

2. **Missing staleTime**:
   ```typescript
   const { data } = useQuery({
     queryKey: ["transactions"],
     queryFn: fetchTransactions,
     staleTime: 5 * 60 * 1000, // 5 minutes
   });
   ```

---

## 🏗️ Build & Deployment

### Issue: TypeScript errors during build

**Symptoms**:

- `npm run build` fails
- "Type 'X' is not assignable to type 'Y'"
- Works in dev, fails in build

**Diagnosis**:

```bash
# Run type check
npx tsc --noEmit

# Check specific file
npx tsc src/path/to/file.tsx --noEmit
```

**Solutions**:

1. **Any types**:
   - Replace `any` with proper types
   - ESLint rule should catch these

2. **Missing types**:

   ```typescript
   // Install type definitions
   npm install --save-dev @types/node
   npm install --save-dev @types/react
   ```

3. **Strict mode**:
   - Check `tsconfig.json` has `strict: true`
   - Fix all strict mode errors

---

### Issue: Cloudflare Pages build fails

**Symptoms**:

- Build succeeds locally, fails on Cloudflare
- "Module not found" error
- "Out of memory" error

**Diagnosis**:

- Check build logs in Cloudflare dashboard
- Look for specific error message

**Solutions**:

1. **Node version mismatch**:
   - Set Node version in Pages settings
   - Match local version (`node --version`)

2. **Environment variables missing**:
   - Add in Cloudflare dashboard: Settings → Environment variables
   - Must include `VITE_` prefix

3. **Build command wrong**:

   ```bash
   # Should be:
   npm run build

   # NOT:
   npm build
   vite build  # Missing npm run
   ```

4. **Out of memory**:
   - Reduce bundle size
   - Use dynamic imports for code splitting

---

## ⚡ Performance

### Issue: Transaction list slow with 1000+ rows

**Symptoms**:

- Page freezes when loading transactions
- Scroll is janky (not 60fps)
- High memory usage

**Diagnosis**:

```typescript
// Check if virtualization is used
// Should use TanStack Virtual

// Profile in DevTools
// Performance tab → Record → Scroll
// Look for long tasks (>50ms)
```

**Solutions**:

1. **Not using virtualization**:

   ```typescript
   import { useVirtualizer } from "@tanstack/react-virtual";

   const virtualizer = useVirtualizer({
     count: transactions.length,
     getScrollElement: () => parentRef.current,
     estimateSize: () => 60, // Row height
   });
   ```

2. **Missing indexes**:
   - Check `idx_transactions_account_date` exists
   - Check query uses index (EXPLAIN ANALYZE)

3. **Fetching too much data**:
   - Implement pagination: Load 100 at a time
   - Use cursor-based pagination for large datasets

---

## 🔧 Developer Tools

### Useful Commands

```bash
# Reset everything (nuclear option)
rm -rf node_modules package-lock.json dist .next
npm install
npm run dev

# Clear Dexie/IndexedDB
# DevTools → Application → Storage → IndexedDB → Delete

# Check bundle size
npm run build
npx vite-bundle-visualizer

# Lighthouse audit
npx lighthouse http://localhost:4173 --view

# Database reset
supabase db reset
```

---

## Still Stuck?

1. **Check chunk-specific troubleshooting**: Each chunk has its own `troubleshooting.md`
2. **Search GitHub issues**: https://github.com/your-repo/issues
3. **Check original docs**: `docs/initial plan/` for deep technical details
4. **Use prompts-guide**: Ask Claude Code with specific prompts

---

**Last Updated**: 2025-01-15
**Found a new issue?** Add it to this guide to help others!
