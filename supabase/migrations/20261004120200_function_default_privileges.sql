-- New functions were still executable by anon: Postgres grants EXECUTE on
-- functions to PUBLIC by default, and per-schema default privileges can only add
-- to that, never subtract from it. Revoke it globally for objects postgres
-- creates. Existing functions are unchanged.
-- authenticated and service_role keep EXECUTE on new public functions through a
-- schema default: older images (production, 17.6.1.063) already have it, and the
-- grant below adds it on newer images, whose postgres default grants only postgres.
alter default privileges for role postgres revoke execute on functions from public;

alter default privileges for role postgres in schema public
  grant execute on functions to authenticated, service_role;
