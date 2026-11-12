# A transfer can change its envelope

A transfer leaves one envelope in its from account and arrives in one envelope in its to account. Usually both are the same; when they differ, one record moves the money's account and its category together. This replaces ADR 0006's rule that a transfer carries one envelope and that a change of category is a transfer plus an allocation.

We chose this because members move money as one thought ("BPI Groceries to GCash Dining"). Saved as a transfer and an allocation, the two can disagree after an edit on either one, or after two offline devices edit each, and Unassigned goes negative until someone notices. One record cannot disagree with itself, which is ADR 0006's own reason for being one record.

## Considered options

- **A transfer and an allocation, unlinked:** no data change, but an edit to one leaves the other behind.
- **A transfer and an allocation, linked:** every write must touch both with one clock, a rule each new path can break; Distribute's one transfer for many allocations does not fit the link.

## Consequences

- Transfer events gain a version; the decoder reads older transfers as arriving in the envelope they left.
- A transfer between categories adds to one category's money and takes from another's, so it shows in both ledgers. It still never counts as income, spending, or against a budget.
- A move inside one account stays an allocation. A transfer into a credit card still arrives in that card's Card Payment.
- The accounts must still differ and share visibility (ADR 0002), and the arrival category must be able to hold money in the to account (ADR 0005).
