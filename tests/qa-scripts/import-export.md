# Import & Export - QA Test Scripts

---

## Test ID: IMP-001

## Upload CSV and auto-detect columns

## Priority: High

### Preconditions

- Logged in as test@example.com
- Have a CSV file with headers: Date, Description, Amount, Type, Account, Category

### Steps

1. Navigate to `http://localhost:3000/import` (or `/transactions/import`)
2. Click "Choose File" or drag-and-drop area (`input[type="file"]`)
3. Select a CSV file with standard column headers
4. Wait for the file to be parsed

### Expected Results

- [ ] File name displayed after upload
- [ ] CSV headers detected and shown in the mapping UI
- [ ] Row count displayed (e.g., "8 rows found")
- [ ] Preview of first few rows visible
- [ ] Auto-mapping attempts to match column names (Date → date, Description → description, etc.)

### Cleanup

None needed (no data imported yet)

---

## Test ID: IMP-002

## Manual column mapping

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- CSV file uploaded (continue from IMP-001)

### Steps

1. In the mapping step, examine the auto-detected mappings
2. Change one mapping manually (e.g., map "Amount" column to "amount_cents")
3. Verify each required field has a column mapped:
   - Date → date column
   - Description → description column
   - Amount → amount column
   - Type → type column (or default to "expense")
4. Click "Next" or "Continue"

### Expected Results

- [ ] Dropdown/select for each field shows available CSV columns
- [ ] Required fields are marked with asterisk or highlighted
- [ ] Unmapped required fields prevent advancing to next step
- [ ] Preview updates when mapping changes

### Cleanup

None needed

---

## Test ID: IMP-003

## Duplicate detection and resolution

## Priority: High

### Preconditions

- Logged in as test@example.com
- Import a CSV file that contains rows matching existing transactions
- Existing transaction: description="Grocery Shopping", amount=1500.50, date=2025-01-15, account="Cash"

### Steps

1. Upload a CSV with a matching row (same description, amount, date, account)
2. Advance through mapping step
3. Observe the duplicate detection step

### Expected Results

- [ ] Duplicate matches are highlighted or listed
- [ ] Each duplicate shows: import row vs existing transaction
- [ ] Confidence score shown (1.0 for exact match)
- [ ] Resolution options available: Skip, Keep Both, Replace
- [ ] User can select different resolutions per duplicate

### Cleanup

Delete any imported "[E2E]" transactions

---

## Test ID: IMP-004

## Complete import with results

## Priority: High

### Preconditions

- Logged in as test@example.com
- CSV file uploaded with [E2E] prefixed descriptions
- Mapping and duplicates steps completed

### Steps

1. In the validation step, verify all rows are valid
2. Click "Import" or "Start Import"
3. Wait for import to complete
4. Observe the results summary

### Expected Results

- [ ] Progress bar shows import progress (0% → 100%)
- [ ] Current row counter updates during import
- [ ] Results summary shows: imported count, skipped count, failed count
- [ ] "Complete" or success state reached
- [ ] Imported transactions visible on the transactions page

### Cleanup

1. Navigate to `/transactions`
2. Search for "[E2E]" transactions
3. Delete all imported test transactions

---

## Test ID: EXP-001

## Export transactions CSV

## Priority: High

### Preconditions

- Logged in as test@example.com
- At least 5 transactions exist

### Steps

1. Navigate to `http://localhost:3000/settings`
2. Locate the "Export" section
3. Click "Export Transactions" button (`[data-testid="export-transactions-btn"]`)
4. Wait for CSV download to start

### Expected Results

- [ ] CSV file downloads (check Downloads folder)
- [ ] Filename includes "transactions" and current date
- [ ] CSV opens correctly in a spreadsheet app
- [ ] Headers: date, type, description, amount, category, account, status, notes, created_at
- [ ] Amounts are plain decimals (no ₱ symbol) for spreadsheet compatibility
- [ ] UTF-8 BOM present (for Excel compatibility)

### Cleanup

None needed (read-only export)

---

## Test ID: EXP-002

## Export accounts CSV

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- At least 2 accounts exist

### Steps

1. Navigate to `http://localhost:3000/settings`
2. Click "Export Accounts" button (`[data-testid="export-accounts-btn"]`)
3. Wait for download

### Expected Results

- [ ] CSV file downloads with "accounts" in the filename
- [ ] Each account row includes: name, type, initial balance
- [ ] Data is correct and matches the app's account list

### Cleanup

None needed (read-only export)
