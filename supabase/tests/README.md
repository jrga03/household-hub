# pgTAP tests

Run with `supabase test db` against the local stack. Files run in name order, each in its own session.

pgTAP is supplied by `supabase test db` (the database has no pgtap extension), so these files cannot be run with plain `psql`.

- `000_helpers.sql` sorts first and commits the `tests` schema: `tests.id(label)`, `tests.create_users(...)`, `tests.authenticate_as(label)`, and `tests.clear_authentication()`.
- RLS denies a write in two ways: INSERT raises `42501`; UPDATE/DELETE silently match no rows. Assert the first with `throws_ok(…, '42501', …)` and the second with `is_empty($$ update … returning id $$, …)`.
- Never run `supabase test db --linked`: it targets production.
