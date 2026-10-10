# Database migrations

Issue #16 dropped the 30 pre-re-architecture migrations (there was no production data). Milestone 1 (#15) rebuilds from a fresh baseline: `20261010120000_households.sql` adds households and membership; the event log follows. Run `npm run gen:types` and commit the result with each migration.
