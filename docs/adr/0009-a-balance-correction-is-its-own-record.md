# A balance correction is its own record and stores the difference

When a logged balance drifts from the real one, a member records a Balance Correction: its own entity (`balance_correction`: created, removed, restored), not a transaction and not an edit to the starting balance. It holds the account, a date, the signed difference between the account's cleared balance at the end of that date and the balance the member entered, and one envelope (a category or Unassigned) that takes it. On a credit card it also records the card's Paying Account, and the difference moves between the envelope and the card's Card Payment there, as a purchase or refund would. It is never edited; a wrong one is removed and the balance entered again.

We chose a separate record because drift is not known to be spending: it may be unlogged cash, a mistyped amount, or a missed fee or interest credit. Like a transfer (ADR 0006), it changes balances and envelope money but never income, spending, budgets or Review, and no reader of transactions has to learn to skip it. We store the difference because it is plain to show and to sum, and a duplicate shows up as a second visible row.

## Considered options

- **A transaction with a correction flag:** every income, spending, budget, Review and import reader would need to skip the flag, and forgetting one counts drift as spending. Rejected.
- **Storing the balance the member saw, with the difference derived when read:** two offline devices recording the same balance would agree instead of doubling the difference. Rejected because a transaction dated earlier that syncs in later would be silently absorbed (the correction keeps the balance at what was entered), and the record's effect would change as other records arrive, which is hard to explain. Doubling is rare in a household of one or two and visible when it happens.
- **Editing the starting balance:** rewrites the past without a trace, against VISION's preference for visible corrections. It stays for fixing typos in the Opening Checklist.

## Consequences

- A correction counts as cleared and is compared against the cleared balance, so pending transactions never create a false gap.
- Two members correcting the same drift offline produce two corrections; one is removed by hand.
- The CSV export includes corrections as "Balance correction" rows so a spreadsheet total matches the app.
