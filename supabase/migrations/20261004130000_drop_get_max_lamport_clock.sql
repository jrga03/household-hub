-- get_max_lamport_clock was SECURITY DEFINER with no search_path and read
-- transaction_events across households. Nothing in src/ calls it. Dropped
-- rather than hardened; re-add as SECURITY INVOKER if Phase B device init
-- needs a server-side max clock.
drop function if exists public.get_max_lamport_clock(text);
