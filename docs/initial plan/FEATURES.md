# Feature Specifications

## Financial Tracker (Phase A - Core MVP)

### 1. Transaction Management

#### 1.1 Transaction Entry

```typescript
interface TransactionForm {
  // Required fields
  date: Date; // Date picker, defaults to today
  type: "income" | "expense"; // Transaction type selector
  category: CategorySelect; // Hierarchical dropdown
  description: string; // Description/memo
  amount: number; // Always positive (UI enforces)

  // Optional fields
  account?: BankAccount; // Bank/cash account
  status?: "pending" | "cleared";
  visibility?: "household" | "personal"; // Default: household
  taggedUsers?: User[]; // @mention other users
  notes?: string; // Additional notes
  attachments?: File[]; // Receipt images/PDFs (Phase B: encryption)
  transfer_group_id?: string; // Links paired transfer transactions
}
```

**Features:**

- Auto-complete for frequently used remarks
- Recent transactions quick-copy
- Multi-select for bulk status updates
- Keyboard shortcuts for power users
- Voice input support (future)

#### 1.2 Transaction Views

**Dump View (All Transactions)**

- Complete transaction list with all fields
- Advanced filtering and sorting
- Bulk operations (edit, delete, export)
- Inline editing for quick updates
- Column customization and saved views

**Filtered by Month**

- Calendar month selector
- Running balance display
- Month-over-month comparison
- Export month statement

**Filtered by Category**

- Category hierarchy navigation
- Spending trends visualization
- Budget vs actual comparison
- Drill-down to transactions

**Filtered by Account**

- Account balance tracking
- Transaction reconciliation
- Statement matching tools
- Transfer detection

**Filtered by "To Pay"**

- Pending payments dashboard
- Due date tracking
- Quick payment marking
- Reminder notifications

**Custom Views**

- User-defined filter combinations
- Saved view templates
- Share views between users
- Quick access toolbar

#### 1.3 Transfer Management

**Transfer Creation Flow:**

```typescript
interface TransferForm {
  date: Date;
  fromAccount: BankAccount;
  toAccount: BankAccount;
  amount: number; // Always positive
  description: string;
  notes?: string;
}

// Creates two linked transactions:
// 1. Expense from source account
// 2. Income to destination account
// Both share same transfer_group_id
```

**Features:**

- Automatic double-entry creation
- Transfer detection in imports
- Visual linking in transaction list
- Bulk transfer reconciliation
- Different dates per leg supported
- Partial clearing (one leg pending, one cleared)

#### 1.4 Transaction Reconciliation

**Reconciliation Process:**

```typescript
interface ReconciliationWorkflow {
  // Status Management
  status: "pending" | "cleared";

  // Statement Matching
  statementDate: Date;
  statementBalance: number;

  // Bulk Operations
  bulkMarkCleared: (transactionIds: string[]) => void;
  bulkMarkPending: (transactionIds: string[]) => void;

  // Balance Calculations
  clearedBalance: number; // Only cleared transactions
  pendingBalance: number; // Only pending transactions
  projectedBalance: number; // Cleared + pending
}
```

**UI Flow:**

1. User imports bank statement or enters ending balance
2. System shows cleared vs pending transactions
3. User matches transactions against statement
4. Bulk operations to mark as cleared
5. System calculates discrepancies
6. User resolves unmatched items
7. Confirm reconciliation (locks cleared transactions for audit)

**Features:**

- Side-by-side statement view
- Automatic matching by amount/date/description
- Highlight unmatched transactions
- Running cleared balance display
- Reconciliation history log
- Export reconciliation report
- Visual indicators for matched/unmatched items
- Quick-match suggestions

**Reconciliation Report:**

```typescript
interface ReconciliationReport {
  date: Date;
  account: BankAccount;
  statementBalance: number;
  systemBalance: number;
  discrepancy: number;
  matchedCount: number;
  unmatchedCount: number;
  pendingCount: number;
}
```

### 2. Budget Management

#### 2.1 Budget Target Allocation

```typescript
interface BudgetTarget {
  category: Category;
  monthlyTarget: number; // Reference spending target (not a balance)
  copyForwardEnabled: boolean; // Copy target to next month
  alertThreshold: number; // Percentage (e.g., 80%, 90%)
  alertRecipients: User[];
}
```

**Conceptual Model:**

- Budgets are **spending targets**, not account balances
- No mathematical rollover - each month is independent
- Track **actual vs target variance**
- Can copy previous month's targets forward for convenience

**Features:**

- Visual budget editor with target amounts
- Template-based target allocation
- Historical average suggestions
- Zero-based budgeting option
- Copy targets from previous month

#### 2.2 Budget Tracking

- Real-time spending vs target comparison
- Color-coded variance status (green/yellow/red)
  - Green: Under target (good)
  - Yellow: Approaching target (80-100%)
  - Red: Over target (alert)
- Projected month-end spending
- Daily burn rate calculation
- Variance analysis (actual - target)

#### 2.3 Budget Target Management

- Set monthly targets per category
- Copy forward targets from previous month (optional)
- Adjust targets mid-month if needed
- View historical target changes
- Compare targets across months

#### 2.4 Budget Alerts

```typescript
interface BudgetAlert {
  triggers: {
    percentage: number; // 80%, 90%, 100%
    daysBeforeEnd: number; // 5 days before month end
    overspend: boolean; // Immediate alert
  };
  channels: {
    inApp: boolean;
    push: boolean;
    email: boolean;
  };
}
```

### 3. Multi-User Features

#### 3.1 Visibility Types

**Household Visibility (Default):**

- All household members can view/edit
- Shared budgets and categories
- Collaborative management
- Joint accounts and expenses
- Appears in household reports

**Personal Visibility:**

- Only creator can view/edit
- Private from other household members
- Personal allowance tracking
- Individual expense management
- Excluded from household totals unless opted-in

#### 3.2 User Interactions

- @mention in transactions
- Comment threads on transactions
- Change notifications
- Activity feed

### 4. Bank Account Management

```typescript
interface BankAccount {
  name: string;
  nickname?: string;
  type: "checking" | "savings" | "credit" | "cash";
  initialBalance: number;
  currentBalance: number; // Calculated
  color: string;
  icon: string;

  // Reconciliation
  lastReconciledDate?: Date;
  lastReconciledBalance?: number;
}
```

**Features:**

- Multiple account support
- Balance tracking
- Transfer management
- Account archiving

### 5. Category System

```typescript
interface Category {
  parentCategory: string; // Main grouping
  name: string; // Specific category
  type: "income" | "expense" | "transfer";
  budgetAmount?: number;
  color: string;
  icon: string;

  // Rules
  autoAssignRules?: {
    keywords: string[];
    amounts: { min?: number; max?: number };
  };
}
```

**Initial Categories (from Excel):**

- **Savings**: Forever House, Just Savings, Retirement, Big Ticket Items
- **Recurring Expenses**: Utilities, Subscriptions, Insurance
- **Variable Expenses**: Groceries, Transportation, Medical
- **Personal**: Individual allowances
- **Investments**: Various investment accounts

### 6. Data Import/Export

#### 6.1 Import

- CSV/Excel file upload
- Column mapping interface
- Data validation and preview
- Duplicate detection
- Rollback capability

#### 6.2 Export

```typescript
interface ExportOptions {
  format: "csv" | "xlsx" | "pdf";
  dateRange: { start: Date; end: Date };
  accounts?: BankAccount[];
  categories?: Category[];
  includeExcluded: boolean;
  groupBy?: "date" | "category" | "account";
}
```

#### 6.2.1 Export Format Specification

**CSV Export Contract:**

- **Encoding**: UTF-8 with BOM (for Excel compatibility)
- **Date Format**: ISO 8601 (YYYY-MM-DD)
- **Amount Format**: Decimal (1500.50, no currency symbol)
- **Column Order** (guaranteed stable):
  1. date
  2. type (income|expense|transfer)
  3. description
  4. amount
  5. category
  6. account
  7. status (pending|cleared)
  8. notes
  9. created_at
  10. created_by

**Excel Export Contract:**

- **Format**: XLSX (Office 2007+)
- **Sheets**:
  - "Transactions": Main data with all columns
  - "Summary": Monthly totals by category
  - "Categories": Category breakdown with spending
  - "Accounts": Account balances and transaction counts
- **Date Format**: Excel date format (respects user's locale)
- **Amount Format**: Number format with 2 decimals, accounting style
- **Formulas**: Summary sheets use formulas that update with data

**PDF Export Contract:**

- **Format**: Letter size (8.5" x 11")
- **Sections**:
  - Header: Date range, account(s), generated timestamp
  - Transaction table: Paginated with running balance
  - Footer: Page numbers, total pages
- **Styling**: Print-friendly, black & white compatible

**Round-Trip Guarantee:**

- Export → Import should produce identical data
- All fields preserved (including metadata)
- No data loss or transformation
- Special characters properly escaped
- Integration test verifies round-trip integrity

### 7. Analytics & Reports

#### 7.1 Dashboard Widgets

- Monthly spending summary
- Budget status overview
- Account balances
- Recent transactions
- Upcoming payments

#### 7.2 Reports

**Standard Reports:**

- Income Statement
- Cash Flow
- Budget Variance
- Category Analysis
- Account Summary

**Custom Reports:**

- User-defined metrics
- Custom date ranges
- Comparison periods
- Trend analysis

#### 7.3 Visualizations

- Spending pie charts
- Trend line graphs
- Budget gauges
- Heat maps (daily spending)
- Sankey diagrams (money flow)

### 8. Offline Capabilities

```typescript
interface OfflineSync {
  // Local storage
  storage: "IndexedDB";
  maxSize: "100MB";

  // Sync behavior
  autoSync: boolean;
  syncInterval: number; // minutes
  conflictResolution: "lastWrite" | "manual";

  // Data retention
  offlineDataDays: 90;
  compressOldData: boolean;
}
```

**Features:**

- Full CRUD operations offline
- Queue management UI
- Sync status indicators
- Conflict resolution UI
- Offline mode banner

### 9. Notifications

```typescript
interface NotificationPreferences {
  // Budget notifications
  budgetAlerts: {
    enabled: boolean;
    threshold: number;
    frequency: "immediate" | "daily" | "weekly";
  };

  // Transaction notifications
  mentions: boolean;
  largeTransactions: {
    enabled: boolean;
    threshold: number;
  };

  // Reminders
  upcomingPayments: boolean;
  monthEndSummary: boolean;

  // Channels
  push: boolean;
  email: boolean;
  inApp: boolean;
}
```

**iOS Safari Requirements:**

- Push notifications require PWA installation (iOS 16.4+)
- Users must install app to home screen first
- Background sync has limited support - use fallbacks
- Manual sync button always available
- Clear installation instructions in UI

### 10. Search & Filter

```typescript
interface SearchFilters {
  // Text search
  query?: string;
  searchIn: ("remarks" | "notes" | "category")[];

  // Date filters
  dateRange?: { start: Date; end: Date };

  // Amount filters
  amountRange?: { min: number; max: number };

  // Category filters
  categories?: Category[];
  parentCategories?: string[];

  // Account filters
  accounts?: BankAccount[];
  accountTypes?: AccountType[];

  // Status filters
  status?: TransactionStatus[];
  includeExcluded?: boolean;

  // User filters
  createdBy?: User[];
  taggedUsers?: User[];
}
```

## Future Features (Beyond MVP)

### Document Management (Post Phase C)

#### Insurance Repository

- Policy document upload
- Expiry date tracking
- Premium payment reminders
- Claim history
- Coverage summaries

#### Important Documents

- Google Drive integration
- Quick access links
- Document categories
- Search functionality
- Sharing permissions

### Home Management (Post Phase C)

#### Maintenance Tracker

- Scheduled maintenance
- Service provider contacts
- Cost tracking
- History log
- Warranty tracking

#### Inventory Management

- Item cataloging
- Purchase date/price
- Location tracking
- Quantity management
- Shopping lists

## Technical Features

### Security

- Row-level security (from day one)
- Session management via Supabase Auth
- Audit logging with event sourcing
- Attachment storage via signed URLs (Phase A)
- Client-side encryption for attachments (Phase B)
- 2FA support (future enhancement)

### Performance

- Lazy loading
- Virtual scrolling
- Image optimization
- Code splitting
- Cache management

### Accessibility

- Keyboard navigation
- Screen reader support
- High contrast mode
- Font size adjustment
- Color blind friendly

### Progressive Web App

```typescript
interface PWAFeatures {
  installable: true;
  offline: true;
  pushNotifications: true;
  backgroundSync: true;
  shareTarget: true;

  // App capabilities
  fileHandling: ["csv", "xlsx"];
  shortcuts: [
    { name: "Add Transaction"; url: "/transaction/new" },
    { name: "View Budget"; url: "/budget" },
  ];
}
```

## User Interface

### Design System

- Consistent color palette
- Typography scale
- Spacing system
- Component library
- Dark mode support

### Navigation

```typescript
interface Navigation {
  primary: ["Dashboard", "Transactions", "Budget", "Accounts", "Reports"];

  secondary: ["Categories", "Settings", "Import/Export"];

  quick: ["+ Transaction", "🔍 Search", "🔔 Notifications"];
}
```

### Responsive Design

- Mobile-first approach
- Tablet optimization
- Desktop power features
- Adaptive layouts
- Touch gestures

## Long-term Roadmap

### Next Major Release (Post MVP)

- Bank API integration
- Receipt OCR scanning
- Bill payment automation
- Investment tracking
- Tax preparation

### Future Vision

- AI spending insights
- Predictive budgeting
- Shared family accounts
- Marketplace integration
- Crypto support

## Success Metrics

### Technical

- Page load < 2 seconds
- Offline sync < 5 seconds
- 99.9% uptime
- Zero data loss

### User Experience

- Transaction entry < 30 seconds
- Monthly reconciliation < 10 minutes
- Budget setup < 15 minutes
- Report generation < 3 seconds

### Business

- 100% data accuracy
- Complete Excel feature parity
- Multi-device seamless sync
- Full audit trail
