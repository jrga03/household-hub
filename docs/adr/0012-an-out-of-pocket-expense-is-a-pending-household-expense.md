# An out-of-pocket expense is a pending household expense

When a member pays a household expense with their own money, it is recorded as an ordinary expense on the household account that will pay them back, with status pending and a `paidByUserId` naming that member. Paying them back is marking it cleared. There is no settlement record, no debt record, and no new account. The payer is set only by the member recording it, only on a household account that is not a credit card, and only in the creation event; it is never edited, so two devices can't disagree on who paid. A mistaken one is removed and added again.

This reuses what pending already means: the balance and the category's money drop on the purchase date, so budgets and Spending see it when it was bought, while the cleared balance still matches the bank until the payback actually leaves. Nothing on the member's side is recorded, which suits loose cash nobody tracks. Because the money crossing to the member is the payback of spending already counted, it is not household spending a second time (the boundary rule in ADR 0002 applies to the expense, not to the payback).

## Considered options

- **A card-like account per member, settled by one card payment:** reuses card mechanics and allows paying any amount, but adds an account per member and a transfer whose crossing to the member's pocket needs its own exception. Rejected for the extra records.
- **An Internal Debt record with its own screens:** the glossary's Debt is visibility only, and this would add screens for a flow that pending already covers. Rejected.

## Consequences

- An out-of-pocket expense can't be edited to income (the edit command refuses it): only an expense can be owed back.
- Paying back works on whole expenses only: three of five can be paid back, not ₱2,000 of one ₱3,000 expense.
- Pending without a payer still means "not final at the bank"; readers that mean out-of-pocket check the payer.
- A payback paid from another household account is an edit of the expense's account, then marking it paid back.
- The bank shows one payback line where the app shows several expenses; an imported statement's payback line is discarded by hand until import matching handles it.
- A member who leaves stays owed: the expenses are household records, and any member can mark them paid back.
