# Household Hub

A private, shared money notebook for a group of people who manage money together. It records what happened to their money and shows what it means; it never moves money.

## People

**Household**:
A group of people who manage money together; every record belongs to exactly one. One person alone is a household of one.
_Avoid_: Family, group, team, workspace

**Member**:
A person who belongs to a household. All members have equal standing over the household's records. A person is a member of at most one household at a time and must belong to one before recording anything.
_Avoid_: User (in domain talk), participant

**Owner**:
The member who controls who is in the household: approves join requests, removes members, and replaces the household code. Has no extra power over money. Must hand ownership to another member before leaving; the last member leaving dissolves the household.
_Avoid_: Admin

**Household Code**:
A short shareable code that lets a person ask to join a household. On its own it grants no access.
_Avoid_: Invite link, password

**Join Request**:
A person's pending ask to join a household, which the owner accepts or declines and the requester can cancel.
_Avoid_: Invitation

## Money

**Account**:
A pocket money sits in: a bank account, credit card, cash wallet, e-wallet, or investment account. Its balance is always derived from its starting balance and its transactions.
_Avoid_: Wallet (as the general term), source

**Visibility**:
Whether an account is **Household** (every member sees it and it counts toward household totals) or **Personal** (only its owning member sees it, and it goes with them between households). Fixed when the account is created. Transactions take the visibility of their account.
_Avoid_: Private, shared, scope

**Retired**:
An account, group or category no longer in use. It leaves the main list and the pickers but keeps its history, stays under a Retired view, and can be unretired. A group retires only once its categories are retired. A category holding money retires only after its money moves into another category.
_Avoid_: Archived, closed, deleted

**Deleted**:
A retired account, group or category that nothing ever used, gone from every list and the Retired view. Only a record with no history can be deleted; a record with history stays retired, and history recorded on another device turns a deleted record back into a retired one.
_Avoid_: Removed (that is for transactions), purged

**Transaction**:
One thing that happened to money in one account on one date: an amount, always positive, and a direction (income or expense).
_Avoid_: Entry, record, line item, event

**Transfer**:
One record of money moving between two accounts of the same visibility, shown as two legs: out of one account, into the other. It carries one envelope (a category, Unassigned, or a Card Payment), the same on both sides. It doesn't count as income, spending, or against a budget. Money crossing between a personal and a household account is not a transfer: it is household income or spending.
_Avoid_: Internal transaction, move

**Balance Correction**:
One record of the difference between an account's cleared balance at the end of a date and the balance a member saw at the bank that day, so the logged balance matches the real one without rewriting the past. It carries one envelope (a category or Unassigned) that takes the difference; on a credit card, the difference moves between that envelope and the card's Card Payment in its Paying Account, as a purchase or refund would. It is never edited, only removed and recorded again. It doesn't count as income, spending, or against a budget.
_Avoid_: Adjustment, reconciliation, starting balance edit

**Credit Card**:
An account whose balance is an amount owed. It holds no category money.
_Avoid_: Card account, liability account

**Paying Account**:
The account a credit card's bill is normally paid from: a non-card account of the same visibility, chosen when the card is added and changeable by editing the card or when paying.
_Avoid_: Source account

**Card Payment**:
The money in a paying account that is set aside for a credit card's bill. It grows as card spending is recorded and shrinks as refunds are recorded or the bill is paid. Members can also allocate money into or out of it, like a category.
_Avoid_: Card reserve, float

**Cleared** / **Pending**:
Whether a transaction has gone through at the bank (cleared) or is committed but not yet final (pending).
_Avoid_: Posted, reconciled

## Tracking

**Category**:
A named envelope of real money, arranged in two levels: a group containing categories. Money sits only in categories; a group's money is the sum of its categories. A category's money can sit in several accounts at once and carries over from month to month. It can go negative when overspent. Like an account, a category is Household or Personal, fixed when it is created, and holds money only in accounts of the same visibility.
_Avoid_: Tag, bucket

**Group**:
A named set of categories, such as Food containing Groceries and Restaurants. It holds no money of its own.
_Avoid_: Parent category, section

**Unassigned**:
The part of an account's money not yet in any category. A transaction that names no category, income or expense, adds to or draws from it. An account's balance always equals its Unassigned plus its category money. Ideally zero: money waits here until it is given a category.
_Avoid_: To assign, ready to assign, free money

**Distribute**:
Giving one account's Unassigned to several categories in one step. Each line names a category, the account that will hold the money, and an amount; money for another account moves there as a transfer first. A category can take lines in several accounts.
_Avoid_: Assign, budget (as a verb)

**Allocation**:
Moving money inside one account between its categories, its Card Payments and its Unassigned. It is not a transaction: the account balance does not change and nothing counts as income or spending.
_Avoid_: Budgeting, assignment, reallocation

**Budget**:
A monthly target amount for a category, compared against what was spent that month, naming its funding account. Set from a month, it stands until a later month replaces it, so a category keeps a budget history. It never goes down as money is spent; the category's money does.
_Avoid_: Envelope, allocation, pot

**Spending**:
What a category's expenses came to over a period, less the income recorded in it (refunds, cashback). A card purchase is spending on its own date; paying the card is a transfer and never spending.
_Avoid_: Outflow, expenses (when refunds are netted)

**Reports**:
The screen for understanding patterns over time: spending by group and category, months compared, trends, and each figure opening the transactions behind it. Transfers never appear in it.
_Avoid_: Analytics, insights, dashboard (that is Home's Finances section)

**Period**:
The run of whole months Reports looks at: one month, or the last 3, 6 or 12 months, ending on a chosen month. The previous period is the run of the same length just before it.
_Avoid_: Range, window, timeframe

**Ledger**:
A category's month record by record: every transaction, transfer and allocation touching it, in date order, with a running balance from its money at the start of the month to its money at the end, and its budget history beneath.
_Avoid_: Statement, history

**Funding Account**:
The account a budget's money is distributed into. It shares the category's visibility and is never a credit card. Not to be confused with a credit card's Paying Account.
_Avoid_: Home account

**Opening Checklist**:
Home's three steps for a new household: set starting balances, distribute them into categories, set budgets. Each ticks itself off from the data; a member can dismiss it on their device.
_Avoid_: Onboarding, setup wizard

**Review**:
The list of things waiting for a member's attention: expenses without a category, open drafts on this device, Unassigned money that is not zero (one item however many accounts hold it), and, for the owner, join requests. Its count is the number of those items, shown on Home and in the navigation.
_Avoid_: Inbox, notifications, to-do

**Debt**:
Money owed, tracked for visibility only; it never moves money. **External** debts are owed outside the household (a credit card's balance is not one: the card already shows it); **Internal** debts are borrowing within it, between accounts, categories, or members.
_Avoid_: Loan (as the general term), liability

**Debt Payment**:
A link from a money movement to a debt that counts toward paying it down: an expense transaction for an external debt, a transfer when one account owes another, or an allocation when one category owes another. It is not a money movement of its own.
_Avoid_: Installment, repayment transaction

**Reversal**:
A visible correction that undoes a mistaken debt payment. It never creates or changes a transaction.
_Avoid_: Void, undo, delete

## Import

**Statement Line**:
One row read from a bank or credit card statement.

**Draft**:
A statement line held for review. It becomes a transaction only when a member confirms it.
_Avoid_: Pending transaction, staged import

**Import**:
The drafts read from one statement file, all belonging to one account. It is kept on the device that read the file until every draft is saved or discarded.
_Avoid_: Batch, upload

**Import Key**:
A fingerprint of a statement line, recorded on the transaction it became, so the same line is recognized as already imported on any device.

## Assistant

**Assistant**:
A chat in which a member asks about the household's money or describes something that happened to it in plain words. It reads what the member can already see and never records anything until the member confirms.
_Avoid_: Bot, chatbot, AI, copilot

**Proposal**:
A transaction the assistant has filled in from what a member said, shown for the member to check and change. It becomes a transaction only when the member confirms it; until then it is nothing.
_Avoid_: Draft (that comes from an import), suggestion, pending transaction

## Sync

**Waiting**:
A change made on this device that hasn't reached the server yet. It goes out on its own once the device is online.
_Avoid_: Pending (that is a transaction state), queued, unsynced

**Stuck**:
A change the server refused for good, or one made in a household the member has since left. It stays on the device until a member retries or discards it; discarding removes it as if it had never been made.
_Avoid_: Failed, rejected
