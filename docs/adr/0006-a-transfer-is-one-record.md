# A transfer is one record

A transfer is its own entity (`transfer`: created, edited, removed, restored), not two linked transactions. One record holds the date, amount, from and to accounts, status and one envelope, and resolves by its own latest HLC. Screens show it as two legs: money leaving one account and arriving in the other.

We chose this because a pair of transactions can drift apart. Two offline devices can edit each leg, one device can remove one leg while another edits the other, and every projection would have to rejoin the pair and decide which leg wins. One record cannot be half applied, so the account sums stay order-independent with no cross-record rule.

The transfer carries one envelope, the same on both sides: a category, Unassigned, or Card Payment. Money that should land in a different category is a transfer plus an allocation, so a transfer never changes what the money is for. Its accounts must differ and share visibility (ADR 0002). Paying a credit card is a transfer from the paying account's Card Payment for that card into the card.

## Considered options

- **Two transactions with a shared link ID:** the old app's shape and this plan's earlier wording ("a role a transaction plays"). Rejected for the drift above, and because every income and spending total would need to look the link up to leave transfers out.

## Consequences

- Transfers sit beside transactions in the list as one row ("BPI → GCash · Groceries"), signed when an account filter is on, left out of income and expense totals and budgets, and counted in balances.
- Both legs share one cleared or pending status. Per-leg status comes with per-side dates.
- No transfers out of a credit card in Milestone 3; a cash advance is a card expense plus income.
