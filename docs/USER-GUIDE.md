# Household Hub - Getting Started Guide

Welcome to Household Hub! This guide will help you start tracking your household finances with confidence.

## What is Household Hub?

Household Hub is an **offline-first** financial management app designed for households. Track income, expenses, budgets, and account balances - all in one place, accessible even without internet connection.

### Key Features

- 📱 **Works Offline** - Create transactions without internet, syncs when back online
- 🔄 **Multi-Device Sync** - Use on phone, tablet, and computer seamlessly
- 🔐 **Privacy-First** - Your data stays on your devices, encrypted backups only
- 📊 **Visual Reports** - See spending patterns and budget progress at a glance
- ⚡ **Lightning Fast** - Handles 10,000+ transactions smoothly
- 💾 **Export Anytime** - Download your data in CSV or JSON format

---

## Quick Start (5 Minutes)

### 1. Create Your Account

1. Visit the Household Hub app
2. Click **"Sign Up"**
3. Enter your email and create a secure password (min 8 characters)
4. Verify your email address (check your inbox)
5. Sign in with your new credentials

**Tip**: Use a password manager for strong, unique passwords!

### 2. Set Up Your First Account

**Accounts** represent your bank accounts, cash, credit cards, or e-wallets.

1. Click **"Accounts"** in the sidebar
2. Click **"+ New Account"**
3. Fill in the details:
   - **Name**: e.g., "BDO Checking", "Cash Wallet", "GCash"
   - **Type**:
     - **Joint** (shared with household members)
     - **Personal** (only visible to you)
   - **Initial Balance**: Current balance in Philippine Pesos (₱)
4. Click **"Create Account"**

**Example**:

```
Name: BDO Checking
Type: Joint
Initial Balance: 25,000.00
```

### 3. Create Categories (Optional - Pre-installed available)

Categories help organize your spending and income. Household Hub comes with **pre-installed categories**:

**Expense Categories**:

- 🍔 **Food & Dining** → Groceries, Restaurants, Delivery
- 🏠 **Home** → Rent, Utilities, Maintenance
- 🚗 **Transportation** → Gas, Public Transit, Parking
- 💊 **Healthcare** → Doctors, Pharmacy, Insurance
- 🎉 **Entertainment** → Movies, Hobbies, Subscriptions
- 👔 **Personal** → Clothing, Grooming, Gifts

**Income Categories**:

- 💰 **Salary** → Employment income
- 💼 **Freelance** → Side gigs and projects
- 🎁 **Gifts** → Money received as gifts
- 📈 **Investments** → Dividends, interest

**Add your own**:

1. Click **"Categories"** → **"+ New Category"**
2. Choose **parent category** (e.g., Food & Dining)
3. Name your subcategory (e.g., "Coffee Shops")
4. Pick an emoji icon
5. Click **"Create"**

### 4. Add Your First Transaction

1. Click **"Transactions"** → **"+ New Transaction"**
2. Fill in the form:
   - **Amount**: `1,500.50` (auto-formats to ₱1,500.50)
   - **Type**: Choose **Income** or **Expense**
   - **Category**: Select from dropdown
   - **Account**: Which account to use
   - **Date**: When the transaction occurred
   - **Description**: Brief note (e.g., "Grocery shopping at SM")
   - **Status**:
     - **Pending** - Not yet cleared by bank
     - **Cleared** - Confirmed in your bank account
3. Click **"Save Transaction"**

**Example Transaction**:

```
Amount: 500.00
Type: Expense
Category: Food & Dining → Groceries
Account: BDO Checking
Date: January 15, 2025
Description: Weekly groceries at Puregold
Status: Cleared
```

---

## Core Features Explained

### Managing Accounts

#### View Account Balance

1. Go to **"Accounts"** tab
2. See real-time balance for each account
3. Balance updates automatically as you add transactions

**Balance Calculation**:

- **Cleared Balance**: Confirmed transactions only
- **Pending Balance**: Includes uncleared transactions
- **Formula**: Initial Balance + Income - Expenses

#### Edit or Delete Account

1. Click on account name
2. Click **"Edit"** or **"Delete"** button
3. Confirm changes

**⚠️ Warning**: Deleting an account also deletes all its transactions!

### Working with Transactions

#### Search and Filter

1. Use the search bar in **"Transactions"** tab
2. **Search by**:
   - Amount (e.g., "500")
   - Description (e.g., "grocery")
   - Category name
3. **Filter by**:
   - Date range (This week, This month, Custom)
   - Account
   - Category
   - Status (Pending/Cleared)
   - Type (Income/Expense)

#### Bulk Operations

- **Select multiple** transactions using checkboxes
- **Bulk actions**:
  - Mark as cleared
  - Delete selected
  - Export to CSV

#### Edit Transaction

1. Click on transaction row
2. Update any field
3. Click **"Save Changes"**
4. Changes sync across all devices

#### Delete Transaction

1. Click on transaction row
2. Click **"Delete"** button
3. Confirm deletion
4. **Note**: Cannot be undone! (But synced devices may have backup)

### Transfers Between Accounts

Transfers move money from one account to another (e.g., ATM withdrawal, bank transfer).

**How to create a transfer**:

1. Click **"Transactions"** → **"+ New Transfer"**
2. Fill in:
   - **From Account**: Source account (e.g., BDO Checking)
   - **To Account**: Destination account (e.g., Cash Wallet)
   - **Amount**: Transfer amount (₱)
   - **Date**: When transfer occurred
   - **Description**: Optional note
3. Click **"Create Transfer"**

**What happens**:

- Creates **two linked transactions**:
  - **Expense** from source account
  - **Income** to destination account
- Both have the same `transfer_group_id` (invisible to you)
- **Automatically excluded from budgets** to avoid double-counting

**Example**:

```
From: BDO Checking
To: GCash
Amount: 2,000.00
Description: Load GCash for online payments
```

**Result**:

- BDO Checking: -₱2,000 (expense)
- GCash: +₱2,000 (income)
- Budget impact: ₱0 (transfers don't count!)

### Setting Monthly Budgets

Budgets are **spending targets** for each category per month.

**Create a budget**:

1. Click **"Budgets"** tab
2. Select **month** (e.g., January 2025)
3. For each category, enter **target amount**:
   - Groceries: ₱15,000
   - Restaurants: ₱5,000
   - Transportation: ₱3,000
4. Click **"Save Budgets"**

**Track progress**:

- **Green**: Under budget ✅
- **Yellow**: 80-100% of budget ⚠️
- **Red**: Over budget ❌

**Example**:

```
Category: Groceries
Budget: ₱15,000
Spent: ₱12,450 (83%)
Status: 🟡 On track
Remaining: ₱2,550
```

**Important Notes**:

- Budgets are **reference targets only** (not balance rollover)
- Unused budget does NOT carry to next month
- Only **expense categories** have budgets (income excluded)
- **Transfers automatically excluded** from budget calculations

### Viewing Reports & Analytics

#### Monthly Spending by Category

1. Go to **"Analytics"** tab
2. See pie chart of spending by category
3. Click category to see transactions

#### Income vs Expenses Trend

- View monthly trends over time
- See surplus or deficit for each month
- Identify spending patterns

#### Budget vs Actual Comparison

- See how actual spending compares to budgets
- Identify categories where you overspend
- Adjust future budgets accordingly

---

## Offline Mode

### How Offline Mode Works

Household Hub is **offline-first**, meaning it works without internet!

**When offline**:

1. All data stored locally in your device (IndexedDB)
2. Create, edit, delete transactions normally
3. Changes queued for sync when back online
4. Visual indicator shows **"Offline"** in top-right corner

**When back online**:

1. App automatically syncs queued changes
2. Uploads to cloud (Supabase)
3. Downloads updates from other devices
4. **Conflict resolution**: Automatic (last-write-wins for MVP)

### Installing as an App (PWA)

Install Household Hub on your device for the best offline experience!

**Desktop (Chrome/Edge)**:

1. Visit the app
2. Look for **install icon** in address bar (⊕)
3. Click **"Install"**
4. App opens in standalone window (no browser UI)

**Mobile (Android)**:

1. Visit the app in Chrome
2. Tap **"Add to Home Screen"** prompt
3. Or: Menu → **"Install app"**
4. Icon appears on home screen

**Mobile (iOS)**:

1. Visit the app in Safari
2. Tap **Share** button
3. Scroll and tap **"Add to Home Screen"**
4. Tap **"Add"**

**Benefits**:

- Works fully offline
- Faster load times
- No browser UI (cleaner experience)
- Push notifications (coming soon!)

---

## Multi-Device Sync

### How Sync Works

1. **Device Registration**: Each device gets a unique ID
2. **Event Sourcing**: Changes stored as immutable events
3. **Automatic Sync**: Uploads/downloads in background
4. **Conflict Resolution**: Automatic (MVP uses last-write-wins)

### Using Multiple Devices

**Best practices**:

- ✅ Use the same account on all devices
- ✅ Wait for sync indicator before closing app
- ✅ Have internet on at least one device daily
- ⚠️ Avoid editing same transaction simultaneously on different devices

**Sync Status Indicators**:

- ✅ **Synced**: All changes uploaded
- 🔄 **Syncing**: Uploading changes now
- ⏸️ **Pending**: Queued, waiting for internet
- ❌ **Failed**: Retry or check connection

### Troubleshooting Sync Issues

**"Sync failed" message**:

1. Check internet connection
2. Refresh the page (Ctrl/Cmd + R)
3. Wait 30 seconds and retry
4. If persists: **Export your data** (Settings → Export) and contact support

**Duplicate transactions appearing**:

- Usually resolves automatically
- Refresh the page
- If persists, manually delete duplicates (app will sync deletion)

---

## Privacy & Security

### Your Data is Private

- **Offline-first**: Data stored locally on your device
- **End-to-end encrypted backups**: Coming in Phase 2
- **No selling of data**: Ever. Your finances are yours alone.
- **Minimal analytics**: Only error tracking (Sentry) with PII scrubbing

### What Data is Collected?

**Stored locally**:

- All transactions, accounts, categories, budgets
- Device ID (for multi-device sync)
- User preferences

**Stored in cloud** (Supabase):

- Same data as above (for sync)
- Encrypted in transit (HTTPS)
- Row-level security policies enforced

**NOT collected**:

- Your password (hashed only)
- Payment information (we don't process payments)
- Browsing history
- Location data

### Error Tracking (Sentry)

When errors occur, we send **anonymized error reports** to Sentry to fix bugs.

**PII Scrubbing** (automatically removed):

- ✂️ Transaction amounts
- ✂️ Account balances
- ✂️ Descriptions and notes
- ✂️ Email addresses
- ✂️ Account numbers

**What IS sent**:

- Error message (sanitized)
- Browser type and version
- Page where error occurred
- Stack trace (code location)

---

## Exporting Your Data

### Export to CSV

1. Go to **"Settings"** → **"Export Data"**
2. Choose **"CSV"** format
3. Select data to export:
   - All transactions
   - Specific date range
   - Specific accounts
4. Click **"Download CSV"**
5. Open in Excel, Google Sheets, or any spreadsheet app

**CSV includes**:

- Date, Amount, Type, Category, Account, Description, Status

**Use cases**:

- Tax preparation
- External accounting software
- Backup for peace of mind
- Data portability

### Export to JSON

1. Go to **"Settings"** → **"Export Data"**
2. Choose **"JSON"** format
3. Click **"Download JSON"**

**JSON includes**:

- All transactions
- All accounts
- All categories
- All budgets
- Complete data structure (restore-capable)

**Use cases**:

- Complete backup
- Migration to another system
- Developer integrations

---

## Tips & Tricks

### Keyboard Shortcuts

Speed up your workflow with these shortcuts:

- `Ctrl/Cmd + N`: New transaction
- `Ctrl/Cmd + K`: Quick search
- `Ctrl/Cmd + S`: Save current form
- `Esc`: Close open dialog
- `Tab`: Navigate form fields
- `Enter`: Submit form

### Tagging Household Members

Use `@` mentions to tag who a transaction benefits:

**Example**:

```
Description: "Lunch with @John @Mary"
```

This helps split expenses or track who spent what (visual only for MVP, split calculations coming in Phase 2).

### Recurring Transactions (Coming Soon!)

For now, manually create monthly bills. Full recurring transaction support coming in Phase 2:

- Auto-create transactions
- Skip or adjust individual occurrences
- Budget forecasting

### Smart Descriptions

Add context to transactions for easier searching:

**Good**:

- "Groceries at Puregold - weekly supplies"
- "Electricity bill - Jan 2025"
- "Birthday gift for Mom"

**Not as useful**:

- "Store"
- "Payment"
- "Stuff"

### Using Categories Effectively

**Best practices**:

- Keep it simple (10-15 categories max)
- Use parent categories for reporting
- Subcategories for detailed tracking
- Review monthly and adjust as needed

**Example hierarchy**:

```
Food & Dining (parent)
├── Groceries (weekly supplies)
├── Restaurants (dining out)
├── Delivery (food apps)
└── Coffee Shops (daily coffee runs)
```

---

## Troubleshooting

### Common Issues

#### "Cannot connect to server"

**Cause**: No internet connection or server down

**Solution**:

1. Check your internet connection
2. Changes saved offline automatically
3. Will sync when back online
4. Look for "Offline" indicator in top-right

#### "Sync failed"

**Solution**:

1. Refresh the page (Ctrl/Cmd + R)
2. Check internet connection
3. Wait 30 seconds and retry
4. Check Supabase status: https://status.supabase.com/
5. If persists: Export data and contact support

#### Budget shows wrong total

**Possible causes**:

1. **Transfers included**: Transfers should be auto-excluded, check `transfer_group_id`
2. **Duplicate transactions**: Search for duplicates and delete
3. **Wrong date range**: Ensure filtering correct month
4. **Pending vs Cleared**: Toggle filter to see all transactions

**Solution**:

1. Go to Transactions tab
2. Filter by category showing wrong total
3. Verify each transaction
4. Delete duplicates if found

#### Lost device / Need to use new device

**Solution**:

1. Sign in from new device with same email/password
2. All data syncs automatically from cloud
3. Old device will be marked as inactive after 90 days
4. **No data loss** - cloud backup protects you!

#### Account balance is incorrect

**Check**:

1. Initial balance set correctly?
2. Any missing transactions?
3. Transfers linked properly?
4. Any duplicate transactions?

**Recalculate**:

1. Go to Accounts tab
2. Click on account
3. Review transaction history
4. Manually verify math: `Initial + Income - Expenses = Current`

---

## Getting Help

### Documentation

- **Implementation Plan**: See `docs/implementation/` for technical details
- **Database Schema**: See `docs/initial plan/DATABASE.md`
- **API Reference**: Coming soon

### Support Channels

- **GitHub Issues**: [Report bugs or request features](https://github.com/your-org/household-hub/issues)
- **Documentation**: This guide and others in `docs/`
- **Email**: support@household-hub.app (check repo README for actual contact)

### Reporting Bugs

When reporting bugs, include:

1. **What you expected**: Describe expected behavior
2. **What happened**: Describe actual behavior
3. **Steps to reproduce**: How to trigger the bug
4. **Screenshots**: If visual issue
5. **Browser/Device**: Chrome 120 on Windows, Safari on iPhone, etc.
6. **Console errors**: Open DevTools → Console, copy errors

**Example bug report**:

```
Title: Cannot create transaction with ₱0.50 amount

Expected: Allow 50 centavos transaction
Actual: Shows "Amount must be greater than 0" error

Steps to reproduce:
1. Click New Transaction
2. Enter amount: 0.50
3. Fill other fields
4. Click Save
5. Error appears

Browser: Chrome 120 on Windows 11
Console: "validateAmount failed: amount too low"
```

---

## What's Next?

### Explore Advanced Features

- 📊 **Analytics Dashboard**: Discover spending insights
- 📈 **Budget Tracking**: Set and monitor monthly budgets
- 🔄 **Multi-Device Sync**: Access from anywhere
- 📤 **Data Export**: Download your data anytime

### Coming in Phase 2

- 🔁 **Recurring Transactions**: Auto-create monthly bills
- 💱 **Multi-Currency**: Track USD, EUR, and other currencies
- 🏠 **Multiple Households**: Manage separate household finances
- 🔐 **Encrypted Backups**: Automatic R2 backups with encryption
- 📨 **Push Notifications**: Budget alerts and reminders
- 📊 **Advanced Reports**: Custom date ranges, category comparisons
- 👥 **Shared Budgets**: Collaborate with household members

### Stay Updated

- ⭐ Star the repo on GitHub
- 👀 Watch for new releases
- 📝 Read release notes
- 💬 Join community discussions

---

## Feedback

We'd love to hear from you!

- 👍 What features do you love?
- 💡 What could be better?
- 🐛 Found a bug?
- ✨ Have a feature idea?

Open an issue on GitHub or email support@household-hub.app

---

**Enjoy tracking your finances with Household Hub!** 🎉

Built with ❤️ for households who value privacy and control over their financial data.

---

_Last updated: January 2025 | Version 0.0.1 MVP_
