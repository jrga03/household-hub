# Checkpoint: Backup Worker

Comprehensive verification of the complete backup orchestration system. Complete all tests to ensure production-ready backup and restore functionality.

---

## Part 1: Code Compilation & Unit Tests

### 1.1 TypeScript Compilation ✓

```bash
npm run type-check
```

**Expected**:

- [ ] No errors in `backup-manager.ts`
- [ ] No errors in `restore-manager.ts`
- [ ] No errors in `retry-utils.ts`
- [ ] No errors in `BackupButton.tsx`
- [ ] No errors in `BackupHistory.tsx`
- [ ] No errors in `backups.tsx` route

---

### 1.2 Unit Tests Pass ✓

```bash
npm test backup-manager.test.ts
npm test restore-manager.test.ts
npm test retry-utils.test.ts
```

**Expected**: All tests pass

- [ ] BackupManager tests (3+ tests)
- [ ] RestoreManager tests (2+ tests)
- [ ] Retry utility tests
- [ ] Progress tracking tests
- [ ] Error handling tests

**Duration**: Should complete in <5 seconds

---

## Part 2: Manual Backup Flow

### 2.1 Backup Page Loads ✓

Navigate to `/backups` page:

**Expected**:

- [ ] Page renders without errors
- [ ] "Create New Backup" card visible
- [ ] Info cards show (Encrypted, Cloud Storage, Retention)
- [ ] BackupHistory component loads
- [ ] If no backups exist, shows "No Backups" message

---

### 2.2 Create Backup Button Works ✓

Click "Create Backup" button:

**Expected**:

- [ ] Button becomes disabled during backup
- [ ] Text changes to "Backing up..."
- [ ] Progress bar appears
- [ ] Progress goes from 0% → 100%
- [ ] Takes 5-15 seconds (depending on data size)
- [ ] Success toast appears: "Backup completed successfully"
- [ ] Button re-enables after completion
- [ ] New backup appears in history immediately

---

### 2.3 Progress Tracking Accurate ✓

Watch progress bar during backup:

**Expected progress milestones**:

- [ ] 10% - Data gathering from IndexedDB
- [ ] 20% - Compression (gzip)
- [ ] 30% - Encryption (AES-GCM)
- [ ] 40% - Checksum generation
- [ ] 50% - Getting signed URL from Worker
- [ ] 60-90% - Upload to R2 (largest step)
- [ ] 90% - Recording metadata in Supabase
- [ ] 100% - Complete

**Expected**: Progress never goes backward, updates smoothly

---

### 2.4 Console Verification ✓

Open browser console during backup:

**Expected logs**:

- [ ] No errors or warnings
- [ ] Optional debug logs for each step
- [ ] Performance timing logs (optional)
- [ ] No sensitive data (keys, tokens) logged

**Should NOT see**:

- ✗ Unhandled promise rejections
- ✗ Network errors (unless expected)
- ✗ Encryption keys in logs

---

## Part 3: Backup Storage Verification

### 3.1 R2 Bucket Contains Backup ✓

Check Cloudflare R2 dashboard:

**Expected**:

- [ ] New object exists in bucket
- [ ] Path format: `backups/{userId}/YYYY/MM/backup-{timestamp}.gz.enc`
- [ ] File size reasonable (1-10MB for typical data)
- [ ] File size is compressed (smaller than raw JSON)
- [ ] Metadata includes:
  - `user-id` custom metadata
  - `checksum` custom metadata
  - `content-type: application/octet-stream`

**Example path**: `backups/abc123-user-id/2025/10/backup-1729012345678.gz.enc`

---

### 3.2 Supabase Snapshot Record Created ✓

Query Supabase `snapshots` table:

```sql
SELECT * FROM snapshots
WHERE user_id = current_user_id()
ORDER BY created_at DESC
LIMIT 1;
```

**Expected**:

- [ ] New row exists
- [ ] `snapshot_type` = 'manual'
- [ ] `storage_url` matches R2 object key
- [ ] `checksum` matches R2 metadata
- [ ] `size_bytes` matches R2 object size
- [ ] `metadata` JSON contains:
  - `encrypted: true`
  - `version: "1.0.0"`
  - `iv` array with 12 elements
- [ ] `created_at` timestamp is recent (within last minute)

---

### 3.3 Checksum Integrity ✓

Verify checksum matches:

```javascript
// In browser console after backup
const snapshot = await supabase
  .from("snapshots")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(1)
  .single();

console.log("Stored checksum:", snapshot.data.checksum);

// Calculate checksum of R2 object (download and hash)
// Should match stored checksum
```

**Expected**: Checksums match exactly (SHA-256 hex string)

---

## Part 4: Backup History UI

### 4.1 BackupHistory Component Displays ✓

After creating backup, check BackupHistory component:

**Expected**:

- [ ] New backup appears at top of list
- [ ] Shows "Manual Backup" label
- [ ] Shows relative time (e.g., "2 minutes ago")
- [ ] Shows file size in KB or MB
- [ ] Shows "🔐 Encrypted" badge
- [ ] Shows truncated checksum
- [ ] "Restore" button is enabled
- [ ] "Delete" button (trash icon) is enabled

---

### 4.2 Multiple Backups Display Correctly ✓

Create 3-5 backups:

**Expected**:

- [ ] All backups appear in reverse chronological order (newest first)
- [ ] Each has unique timestamp
- [ ] File sizes vary slightly (due to data changes)
- [ ] All show encryption badge
- [ ] List is scrollable if >5 backups

---

## Part 5: Restore Flow

### 5.1 Restore Confirmation Dialog ✓

Click "Restore" on a backup:

**Expected**:

- [ ] Confirmation dialog appears
- [ ] Message warns: "This will replace all current data"
- [ ] Suggests: "Create a backup first!"
- [ ] Has Cancel and OK buttons
- [ ] Clicking Cancel does nothing
- [ ] Clicking OK starts restore

---

### 5.2 Restore Progress Tracking ✓

After confirming restore:

**Expected**:

- [ ] Progress card appears above history
- [ ] Shows "Restoring backup..."
- [ ] Progress bar visible
- [ ] Progress milestones:
  - 10% - Fetching snapshot metadata
  - 20% - Getting download URL
  - 30-70% - Downloading from R2
  - 70% - Verifying checksum
  - 75% - Decrypting
  - 80% - Decompressing
  - 85% - Restoring to IndexedDB
  - 100% - Complete
- [ ] All buttons disabled during restore
- [ ] Success toast: "Restore completed successfully"
- [ ] Page reloads automatically

---

### 5.3 Data Integrity After Restore ✓

After restore completes and page reloads:

**Verify data matches pre-backup state**:

```javascript
// Before backup
const preTxnCount = await db.transactions.count();
const preAccounts = await db.accounts.toArray();
const preCategories = await db.categories.toArray();

// After restore
const postTxnCount = await db.transactions.count();
const postAccounts = await db.accounts.toArray();
const postCategories = await db.categories.toArray();

console.log("Transactions match:", preTxnCount === postTxnCount);
console.log("Accounts match:", preAccounts.length === postAccounts.length);
console.log("Categories match:", preCategories.length === postCategories.length);
```

**Expected**:

- [ ] Transaction count matches exactly
- [ ] All transactions present with correct data
- [ ] Account balances match
- [ ] Categories preserved
- [ ] Budgets preserved
- [ ] No duplicate entries
- [ ] No missing entries

---

### 5.4 Specific Data Field Verification ✓

Pick a specific transaction and verify:

```javascript
// Before backup
const txn = await db.transactions.get("txn-id-123");
console.log("Before:", txn);

// After restore
const restoredTxn = await db.transactions.get("txn-id-123");
console.log("After:", restoredTxn);

// Deep equality check
console.log("Match:", JSON.stringify(txn) === JSON.stringify(restoredTxn));
```

**Expected**: Every field matches exactly

---

## Part 6: Error Handling & Edge Cases

### 6.1 Offline Backup Attempt ✓

Test backup without internet:

1. Open DevTools Network tab
2. Set to "Offline"
3. Click "Create Backup"

**Expected**:

- [ ] Progress starts (gather, compress, encrypt succeed)
- [ ] Fails at "getting signed URL" or "upload" step
- [ ] Retry logic kicks in (see console logs)
- [ ] After 3 retries, shows error toast
- [ ] Error message: "Backup failed" or similar
- [ ] Progress bar disappears
- [ ] Button re-enables
- [ ] No partial data in R2 or Supabase

---

### 6.2 Interrupted Upload ✓

Test with slow/unstable network:

1. Set Network throttling to "Slow 3G"
2. Start backup
3. Disable network when progress reaches 70-80%

**Expected**:

- [ ] Upload fails
- [ ] Retry logic attempts upload again
- [ ] If retries exhausted, error toast appears
- [ ] No corrupted backup in R2

---

### 6.3 Corrupted Backup Restore ✓

Manually corrupt a backup checksum in Supabase:

```sql
UPDATE snapshots
SET checksum = 'corrupted-checksum-value'
WHERE id = 'snapshot-id';
```

Try restoring this backup:

**Expected**:

- [ ] Download succeeds
- [ ] Checksum verification fails
- [ ] Error toast: "Checksum mismatch - backup corrupted"
- [ ] Restore aborts before decryption
- [ ] Original data unchanged

---

### 6.4 Delete Backup ✓

Click delete (trash icon) on a backup:

**Expected**:

- [ ] Confirmation dialog appears
- [ ] Message: "Delete this backup? This cannot be undone."
- [ ] Clicking Cancel does nothing
- [ ] Clicking OK deletes backup
- [ ] Success toast: "Backup deleted"
- [ ] Backup disappears from list immediately
- [ ] Snapshot record removed from Supabase
- [ ] R2 object should be cleaned up (may be async)

---

### 6.5 Session Expired During Backup ✓

Test with expired session:

1. Log in
2. Wait for session to expire (or manually clear session)
3. Try to create backup

**Expected**:

- [ ] Backup fails at encryption or signed URL step
- [ ] Error indicates session issue
- [ ] User prompted to log in again
- [ ] After re-login, backup works

---

## Part 7: Performance & Scalability

### 7.1 Backup with Realistic Data ✓

Create backup with typical household data:

**Test data**:

- 1,000 transactions
- 5 accounts
- 20 categories
- 12 monthly budgets

**Expected**:

- [ ] Backup completes in <15 seconds
- [ ] Compressed size: 200KB - 2MB
- [ ] Encrypted size: slightly larger (adds ~28 bytes + 16-byte tag)
- [ ] Upload completes without timeout
- [ ] No memory warnings in console

---

### 7.2 Backup with Large Data ✓

Create backup with heavy data:

**Test data**:

- 10,000+ transactions
- 50+ accounts
- 100+ categories

**Expected**:

- [ ] Backup still completes (may take 30-60 seconds)
- [ ] Compressed size: 2-10MB
- [ ] No "out of memory" errors
- [ ] Progress updates throughout
- [ ] Upload handles large file

**If fails**: Consider implementing chunking (see troubleshooting)

---

### 7.3 Multiple Rapid Backups ✓

Create 5 backups in quick succession:

**Expected**:

- [ ] Each backup completes successfully
- [ ] No race conditions
- [ ] Each has unique timestamp
- [ ] All appear in history
- [ ] No database conflicts

---

### 7.4 Restore Performance ✓

Measure restore time:

```javascript
console.time("restore");
await restoreManager.restoreFromBackup(snapshotId);
console.timeEnd("restore");
```

**Expected timing** (for 1,000 transactions):

- [ ] Download: 1-3 seconds
- [ ] Decrypt: <1 second
- [ ] Decompress: <1 second
- [ ] Database restore: 1-2 seconds
- [ ] **Total**: <10 seconds

---

## Part 8: Security Verification

### 8.1 Encryption Confirmed ✓

Verify backups are encrypted:

1. Download R2 object manually (via dashboard or CLI)
2. Try to open in text editor

**Expected**:

- [ ] File is binary/gibberish
- [ ] Cannot read JSON structure
- [ ] File extension is `.gz.enc`
- [ ] First bytes are NOT gzip magic number (if encrypted first)

---

### 8.2 Cross-User Isolation ✓

Test with two users:

1. User A creates backup
2. User B tries to restore User A's backup

**Expected**:

- [ ] User B cannot see User A's backups in list (RLS)
- [ ] If User B somehow gets snapshot ID and tries to restore:
  - Decryption should fail (different auth-derived key)
  - Error: "Cannot decrypt backup from different user"

---

### 8.3 No Sensitive Data in Logs ✓

Review all console logs during backup/restore:

**Should NOT appear**:

- [ ] Encryption keys (CryptoKey objects are OK)
- [ ] Initialization vectors (IVs) - may appear as byte arrays, OK
- [ ] Supabase JWT tokens (only in request headers, not logged)
- [ ] R2 signed URLs (partial OK, full URL risky)

---

## Part 9: UI/UX Verification

### 9.1 Loading States ✓

During backup:

**Expected**:

- [ ] Button shows "Backing up..." text
- [ ] Button is disabled
- [ ] Progress bar is visible
- [ ] Other UI elements remain functional
- [ ] Page doesn't freeze

---

### 9.2 Error Messages User-Friendly ✓

Trigger various errors:

**Expected error messages are clear**:

- [ ] "Backup failed" (generic)
- [ ] "Failed to get signed URL" (network)
- [ ] "Upload failed" (R2 connection)
- [ ] "Checksum mismatch" (corruption)
- [ ] "Cannot decrypt backup from different user" (auth)

**Messages should**:

- Use plain language
- Not expose technical details to user
- Provide actionable next steps

---

### 9.3 Accessibility ✓

Test with keyboard only:

**Expected**:

- [ ] Can tab to "Create Backup" button
- [ ] Can activate with Enter/Space
- [ ] Can tab to "Restore" and "Delete" buttons
- [ ] Focus visible on all interactive elements
- [ ] Progress bar has ARIA attributes

---

## Part 10: Integration with Existing System

### 10.1 Backup Includes All Data Types ✓

Verify backup contains:

```javascript
// Check gathered data structure
const data = await backupManager.gatherData();

console.log("Data structure:", {
  transactions: data.transactions?.length,
  accounts: data.accounts?.length,
  categories: data.categories?.length,
  budgets: data.budgets?.length,
});
```

**Expected**:

- [ ] All transactions included
- [ ] All accounts included
- [ ] All categories (including hierarchy)
- [ ] All budgets included
- [ ] No data type missing

---

### 10.2 Restore Preserves Relationships ✓

After restore, verify:

**Expected**:

- [ ] Transaction → Account relationships intact
- [ ] Transaction → Category relationships intact
- [ ] Category parent → child relationships intact
- [ ] Budget → Category associations intact
- [ ] Transfer pairs still linked (same `transfer_group_id`)

---

### 10.3 Sync State After Restore ✓

After restore:

**Expected**:

- [ ] Sync queue may need rebuilding (implementation dependent)
- [ ] Device ID preserved
- [ ] Vector clocks may need reset
- [ ] App remains functional for offline use

---

## Success Criteria Summary

### Core Functionality

- [ ] Backup creates successfully (8/8 tests pass)
- [ ] Restore works correctly (5/5 tests pass)
- [ ] Progress tracking accurate
- [ ] Data integrity maintained 100%

### Storage & Metadata

- [ ] Backups stored in R2 correctly
- [ ] Snapshot metadata recorded in Supabase
- [ ] Checksums match across storage
- [ ] File paths follow naming convention

### UI/UX

- [ ] BackupButton component works
- [ ] BackupHistory component displays correctly
- [ ] Progress bars update smoothly
- [ ] Error messages are clear
- [ ] Loading states handled

### Error Handling

- [ ] Offline scenarios handled gracefully
- [ ] Retry logic works (3 attempts with backoff)
- [ ] Corrupted backups detected
- [ ] Session expiry handled
- [ ] Network interruptions recovered

### Performance

- [ ] 1,000 transactions backup: <15 seconds
- [ ] 1,000 transactions restore: <10 seconds
- [ ] 10,000 transactions backup: <60 seconds
- [ ] No memory issues with large datasets

### Security

- [ ] Backups are encrypted (verified binary)
- [ ] Cross-user isolation enforced
- [ ] No sensitive data in logs
- [ ] Checksum verification prevents tampering

---

## Final Verification Checklist

Before marking complete:

1. **Run all tests**:

   ```bash
   npm test backup-manager
   npm test restore-manager
   npm test retry-utils
   npm run type-check
   ```

2. **Manual flow testing**: Complete at least 15 of the manual verification tests

3. **Create 3 backups** with different data sizes

4. **Restore each backup** and verify data integrity

5. **Test error scenarios**: At least 3 failure cases

6. **Performance check**: Backup and restore with 1,000+ transactions

7. **Security audit**:
   - [ ] Download R2 object, verify encrypted
   - [ ] Check console logs for sensitive data
   - [ ] Test cross-user isolation

8. **Code review**:
   - [ ] No hardcoded credentials
   - [ ] Error handling comprehensive
   - [ ] Progress callbacks working
   - [ ] Retry logic implemented correctly

---

## Known Limitations (MVP)

- **No automated backups**: Manual only (Phase C feature)
- **No backup scheduling**: User must trigger manually
- **No backup to local device**: Cloud-only for MVP
- **No differential backups**: Always full backup
- **20 backup limit**: Older backups not auto-deleted yet (manual cleanup)

---

## Next Steps

Once all criteria met:

1. **Commit changes**:

   ```bash
   git add src/lib/backup-manager.ts src/lib/restore-manager.ts
   git commit -m "feat: implement backup orchestration system (chunk 040)

   - Add BackupManager with retry logic
   - Add RestoreManager with checksum verification
   - Create BackupButton and BackupHistory components
   - Add backups management page
   - Implement exponential backoff for network failures
   - Add comprehensive tests

   Refs: chunk 040, Decision #83 (Phase B backups)"
   ```

2. **Update progress tracker**: Mark chunks 037-040 as complete

3. **Test end-to-end**: Full backup → restore → verify workflow

4. **Consider Phase C features**:
   - Automated scheduled backups
   - Backup cleanup job (delete old backups)
   - Local device backup option
   - Backup compression level options

---

**Status**: ✅ Backup orchestration complete

**Phase B Milestone**: Multi-Device Sync with Backups COMPLETE
