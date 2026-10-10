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
An account no longer in use. It leaves the main accounts list but keeps its history, stays under a Retired view, and can be unretired.
_Avoid_: Archived, closed, deleted

**Transaction**:
One thing that happened to money in one account on one date: an amount, always positive, and a direction (income or expense).
_Avoid_: Entry, record, line item, event

**Transfer**:
Two linked transactions recording one category's money moving between two accounts of the same visibility. Neither side counts as income, spending, or against a budget. Money crossing between a personal and a household account is not a transfer: it is household income or spending.
_Avoid_: Internal transaction, move

**Credit Card**:
An account whose balance is an amount owed. It holds no category money.
_Avoid_: Card account, liability account

**Paying Account**:
The account a credit card's bill is normally paid from, chosen when the card is added and changeable when paying.
_Avoid_: Funding account, source account

**Card Payment**:
The money in a paying account that is set aside for a credit card's bill. It grows as card spending is recorded and shrinks when the bill is paid.
_Avoid_: Card reserve, float

**Cleared** / **Pending**:
Whether a transaction has gone through at the bank (cleared) or is committed but not yet final (pending).
_Avoid_: Posted, reconciled

## Tracking

**Category**:
A named envelope of real money, arranged in two levels: a parent group containing categories. A category's money can sit in several accounts at once and carries over from month to month. It can go negative when overspent; every transaction says which category it draws from or adds to.
_Avoid_: Tag, bucket

**Unassigned**:
The part of an account's money not yet in any category. Income lands here unless it names a category. An account's balance always equals its Unassigned plus its category money.
_Avoid_: Ready to assign, free money

**Allocation**:
Moving money between categories inside one account. It is not a transaction: the account balance does not change and nothing counts as income or spending.
_Avoid_: Budgeting, assignment, reallocation

**Budget**:
A monthly target amount for a category, compared against what was spent that month. It never goes down as money is spent; the category's money does.
_Avoid_: Envelope, allocation, pot

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
