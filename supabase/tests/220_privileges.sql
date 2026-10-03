begin;
select plan(27);

select table_privs_are('public', 'accounts', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on accounts');
select table_privs_are('public', 'accounts', 'anon', ARRAY[]::text[], 'anon has no privileges on accounts');
select table_privs_are('public', 'budgets', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on budgets');
select table_privs_are('public', 'budgets', 'anon', ARRAY[]::text[], 'anon has no privileges on budgets');
select table_privs_are('public', 'categories', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on categories');
select table_privs_are('public', 'categories', 'anon', ARRAY[]::text[], 'anon has no privileges on categories');
select table_privs_are('public', 'debt_payments', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on debt_payments');
select table_privs_are('public', 'debt_payments', 'anon', ARRAY[]::text[], 'anon has no privileges on debt_payments');
select table_privs_are('public', 'debts', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on debts');
select table_privs_are('public', 'debts', 'anon', ARRAY[]::text[], 'anon has no privileges on debts');
select table_privs_are('public', 'devices', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on devices');
select table_privs_are('public', 'devices', 'anon', ARRAY[]::text[], 'anon has no privileges on devices');
select table_privs_are('public', 'internal_debts', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on internal_debts');
select table_privs_are('public', 'internal_debts', 'anon', ARRAY[]::text[], 'anon has no privileges on internal_debts');
select table_privs_are('public', 'profiles', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on profiles');
select table_privs_are('public', 'profiles', 'anon', ARRAY[]::text[], 'anon has no privileges on profiles');
select table_privs_are('public', 'push_subscriptions', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on push_subscriptions');
select table_privs_are('public', 'push_subscriptions', 'anon', ARRAY[]::text[], 'anon has no privileges on push_subscriptions');
select table_privs_are('public', 'sync_queue', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on sync_queue');
select table_privs_are('public', 'sync_queue', 'anon', ARRAY[]::text[], 'anon has no privileges on sync_queue');
select table_privs_are('public', 'transaction_events', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on transaction_events');
select table_privs_are('public', 'transaction_events', 'anon', ARRAY[]::text[], 'anon has no privileges on transaction_events');
select table_privs_are('public', 'transactions', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has DML only on transactions');
select table_privs_are('public', 'transactions', 'anon', ARRAY[]::text[], 'anon has no privileges on transactions');
select table_privs_are('public', 'transactions_non_transfer', 'authenticated', ARRAY['SELECT'], 'authenticated can only select the view');
select table_privs_are('public', 'transactions_non_transfer', 'anon', ARRAY[]::text[], 'anon has no privileges on the view');
select is_empty(
  $$ select d.defaclobjtype, a.privilege_type from pg_default_acl d
     cross join lateral aclexplode(d.defaclacl) a
     where d.defaclnamespace = 'public'::regnamespace
       and d.defaclrole = 'postgres'::regrole
       and d.defaclobjtype = 'r'
       and a.grantee in ('anon'::regrole, 'authenticated'::regrole) $$,
  'no default table privileges for anon or authenticated: new tables start unexposed');

select * from finish();
rollback;
