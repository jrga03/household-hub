-- Supabase Free pauses a project after a week without activity. A Cloudflare
-- cron (workers/keep-alive) calls this with the anon key. It reads no table, so
-- the key needs no access to household data.
create function public.keep_alive()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true
$$;

revoke execute on function public.keep_alive() from public, authenticated;
grant execute on function public.keep_alive() to anon;
