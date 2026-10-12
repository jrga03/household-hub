# A budget names its funding account

This amends ADR 0003. A budget is still a monthly target, never a balance, but it now also names the account that funds the category: the account Distribute money sends that category's share to. A budget is set from a month (`budget.set`: category, from month, amount, funding account) and stands until a later month replaces it, so each set is a version and the versions are the category's budget history. Within one month the latest HLC wins; an amount of 0 or none clears it.

We needed the account because a category's money can sit in several accounts (ADR 0003). When a payday is distributed, each budget's money has to land somewhere, and members fund a category from the same account month after month. The funding account must share the category's visibility and cannot be a credit card.

## Considered options

- **A home account on the category itself:** one place to change it, but it loses the history (which account funded Groceries last year) and can't change from a given month.
- **Choosing the account each time money is distributed:** tedious on every payday, which is the screen used most.
- **A budget per month that must be set again each month:** simple to project, but members would retype unchanged budgets every month.

## Consequences

- A budget's ID comes from its category and month, so two devices setting the same month converge on one record.
- "Spent" stays derived: expenses minus refunds in the category by local date, transfers excluded, card purchases on their purchase date.
