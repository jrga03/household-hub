# AI-Assisted QA Test Scripts

These test scripts are designed to be executed by an AI assistant (Claude) using a browser (Chrome) to verify Household Hub functionality through the actual UI.

## How to Use

1. Start the dev server: `npm run dev` (or `npm run preview` for production build)
2. Open `http://localhost:3000` in Chrome
3. Provide Claude with one of these script files
4. Claude follows the steps and verifies expected results
5. Report any failures with screenshots

## Test Script Index

| File                                 | Feature           | Scenarios | Priority |
| ------------------------------------ | ----------------- | --------- | -------- |
| [auth.md](auth.md)                   | Authentication    | 5         | High     |
| [dashboard.md](dashboard.md)         | Dashboard         | 4         | High     |
| [transactions.md](transactions.md)   | Transactions CRUD | 8         | High     |
| [budgets.md](budgets.md)             | Budgets           | 6         | High     |
| [transfers.md](transfers.md)         | Transfers         | 5         | High     |
| [categories.md](categories.md)       | Categories        | 5         | Medium   |
| [import-export.md](import-export.md) | Import/Export     | 6         | Medium   |
| [analytics.md](analytics.md)         | Analytics         | 4         | Medium   |
| [debts.md](debts.md)                 | Debts             | 5         | Medium   |
| [offline-sync.md](offline-sync.md)   | Offline & Sync    | 4         | High     |

## Conventions

- All test-created data uses the `[E2E]` prefix for easy identification and cleanup
- Test credentials: `test@example.com` / `TestPassword123!`
- Each scenario includes manual cleanup steps to leave the app in a clean state
- Selectors include both `data-testid` attributes and text-based fallbacks
- Priority: High = must pass for release, Medium = should pass, Low = nice to have

## Total Scenarios: 52
