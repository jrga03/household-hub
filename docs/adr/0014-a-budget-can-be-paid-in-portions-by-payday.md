# A budget can be paid in portions by payday

Household income arrives in several paydays a month (for example the 15th and the 30th salary), and each payday pays for a known set of budgets, sometimes only part of one. A payday is a household-wide named income with an order and nothing else: no date, no expected amount, no visibility. A budget's amount is either paid by any payday, or made of portions, one per payday, that add up to it; never both. Portions live on the budget version (`budget.set`, ADR 0007), so they stand from their month until a later version replaces them, and one funding account still serves the whole budget.

When a payday is distributed, its line asks for the smaller of its portion and what is left of the whole budget this month (budget minus this month's net allocations into the category). We chose this over tagging allocations and transfers with the payday that paid them: it needs no change to those events, and it never over-funds a budget.

## Considered options

- **Payday on the category:** simpler, but it loses history and can't change from a given month.
- **Mixing portions with money any payday pays:** "what is left for this payday" becomes ambiguous.
- **Tagging each distribution with its payday:** exact per-payday tracking, but every allocation and transfer event gains a field, and money moved by hand has no payday to carry.

## Consequences

- `budget.set` gains a version; the decoder reads older budgets as paid by any payday.
- Distribute preselects by payday order, the list order members set rather than a date, assuming paydays earlier in the list are funded first.
- If a later payday is distributed first, the earlier one still asks for its full portion, capped by what is left of the budget. Moving money out of a category mid-month makes the next payday ask to refill it, as Distribute already does.
- A payday no budget version ever named is deleted directly. One that history names is retired, and only once no budget in force from this month has a portion on it, so the ledger's budget history keeps its name.
- A payday's place in the order is a position on the payday itself, and a move renumbers the paydays it changes. Two devices that reorder at the same time end with the same order, but it can match neither member's intent; the next move puts it right.
