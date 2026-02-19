# Offline & Sync - QA Test Scripts

---

## Test ID: OFF-001

## Create transaction while offline

## Priority: High

### Preconditions

- Logged in as test@example.com
- App has been used online at least once (IndexedDB populated)

### Steps

1. Open Chrome DevTools (F12) > Network tab
2. Check the "Offline" checkbox to simulate offline mode
3. Verify the offline indicator appears in the UI (`[data-testid="offline-indicator"]` or status bar)
4. Navigate to `http://localhost:3000/transactions`
5. Click "Add Transaction"
6. Fill in:
   - Description: "[E2E] Offline Transaction"
   - Amount: "250"
   - Type: "expense"
   - Date: today
7. Click "Save"

### Expected Results

- [ ] Transaction is saved successfully (no error)
- [ ] Transaction appears in the transactions list immediately
- [ ] Offline indicator is visible (shows "Offline" or disconnected icon)
- [ ] Toast may say "Saved offline" or similar
- [ ] Transaction is stored in IndexedDB (visible in DevTools > Application > IndexedDB)

### Cleanup

1. Go back online (uncheck "Offline")
2. Wait for sync
3. Delete the "[E2E] Offline Transaction"

---

## Test ID: OFF-002

## Verify sync on reconnect

## Priority: High

### Preconditions

- Continue from OFF-001 (offline transaction exists in queue)
- Or: create a transaction offline per OFF-001

### Steps

1. While still offline, verify the transaction is in the sync queue:
   - DevTools > Application > IndexedDB > household-hub > syncQueue
   - Should see an item with status "queued"
2. Uncheck "Offline" in DevTools Network tab
3. Wait for automatic sync (up to 5 seconds)
4. Observe the sync indicator

### Expected Results

- [ ] Sync starts automatically when connection is restored
- [ ] Sync indicator shows "Syncing..." briefly
- [ ] After sync completes, indicator shows "Online" or connected icon
- [ ] Sync queue is emptied (status changes to "completed")
- [ ] Transaction now has a server-generated UUID (check DevTools IndexedDB)
- [ ] Pending changes counter goes to 0

### Cleanup

Delete the "[E2E] Offline Transaction" if not already cleaned up

---

## Test ID: OFF-003

## Manual sync button

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- At least one pending item in the sync queue (create offline transaction per OFF-001)

### Steps

1. Go back online
2. Before auto-sync triggers, locate the manual sync button
3. Look for: `[data-testid="sync-button"]`, sync icon in header, or "Sync Now" in settings
4. Click the sync button

### Expected Results

- [ ] Sync starts immediately on button click
- [ ] Button shows loading state (spinner or disabled)
- [ ] Toast notification: "Sync complete" or similar with count
- [ ] Pending changes counter updates to 0
- [ ] Sync timestamp updates to current time

### Cleanup

None needed

---

## Test ID: OFF-004

## Sync indicator status changes

## Priority: Medium

### Preconditions

- Logged in as test@example.com

### Steps

1. Observe the sync/connection status indicator in the app header or sidebar
2. Note its current state (should show "Online" or green indicator)
3. Open DevTools > Network > check "Offline"
4. Observe the indicator change
5. Uncheck "Offline"
6. Observe the indicator change back

### Expected Results

- [ ] Online state: Green indicator, "Online" text, or connected icon
- [ ] Offline state: Red/orange indicator, "Offline" text, or disconnected icon
- [ ] Transition from online → offline is immediate (within 1-2 seconds)
- [ ] Transition from offline → online triggers a sync attempt
- [ ] During sync: Indicator may show "Syncing..." briefly
- [ ] After sync: Returns to "Online" state

### Cleanup

Ensure DevTools "Offline" is unchecked when done
