# pgTAP tests

Run with `supabase test db` against the local stack. Files run in name order, each in its own session.

- `000_helpers.sql` commits a `tests` schema (fixture ids, role switching, `tests.seed()`). It is test-only and never belongs in a migration.
- Every other file wraps its assertions in `begin; … rollback;`, calls `tests.seed()` as the superuser, then switches role with `tests.authenticate_as('a1' | 'a2' | 'b1')` or `tests.authenticate_as_anon()`.
- Fixture: household h1 has users a1 and a2, household h2 has b1. Both households are fresh ids, so local dev data is invisible to fixture users.
- RLS denies a write in two ways: INSERT raises `42501`; UPDATE/DELETE silently match no rows. Assert the first with `throws_ok(…, '42501', …)` and the second with `is_empty($$ update … returning id $$, …)`.
- Never run `supabase test db --linked`: it targets production.
