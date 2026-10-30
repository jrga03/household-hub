# Spreadsheet history import

Household Hub does not import a household's past data from a spreadsheet (CSV) as accounts, categories, transactions and transfers.

## Why this is out of scope

The household went live on a fresh start (2026-10-29). Each account's starting balance is its real balance on that day, so it already includes every transaction the spreadsheet holds or missed. Nothing on screen reads history before the starting balance, and the spreadsheet stays as the archive. Importing the old rows would duplicate money the starting balances already count, or force a reconciliation against a spreadsheet that was about two months behind.

Getting outside data in is already covered where it is needed:

- Card statements: statement import reads the file the bank sends (Statement Lines, Drafts, Import Keys).
- Drift between logged and real balances: a Balance Correction, not a backfill.
- Restoring this app's own data: the event-log export and restore (#123, #242).

The decision is recorded in `docs/plans/2026-10-10-rearchitecture.md` ("Go live on a fresh start", and the fresh-start note for M5).

## When to revisit

If a report or analytics view needs the months before go-live, open a new issue that names that view and the months it needs. A history import would then also have to decide how imported rows sit against the starting balances.

## Prior requests

- #243: "Import a household's data from a spreadsheet (CSV)"
