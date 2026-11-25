-- v5.12: shared, atomic counter for create_room (the same server-only table as the room-code limiter, join_misses; keys are prefixed 'c:').
-- Forward-only and safe to rerun. Keys are opaque strings built by the Edge Function: 'c:<user uuid>:m', 'c:n:<keyed hash of the network address>:h', ...
-- Unlike eas_join_miss this counts EVERY attempt (a successful create_room is the thing being limited), and answers whether any key is over its maximum.
create or replace function public.eas_rate_hit(p_keys text[], p_maxes integer[], p_window_ms integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare w interval := make_interval(secs => p_window_ms / 1000.0); over boolean;
begin
  with t as (select k, mx from unnest(p_keys, p_maxes) as x(k, mx) where k is not null and char_length(k) <= 80),
  up as (
    insert into public.join_misses as m (key, n, window_start)
      select k, 1, now() from t
    on conflict (key) do update
      set n = case when m.window_start <= now() - w then 1 else m.n + 1 end,
          window_start = case when m.window_start <= now() - w then now() else m.window_start end
    returning m.key, m.n)
  select coalesce(bool_or(up.n > t.mx), false) into over from up join t on t.k = up.key;
  delete from public.join_misses where window_start < now() - interval '2 hours';
  return over;
end $$;
revoke all on function public.eas_rate_hit(text[], integer[], integer) from public, anon, authenticated;
grant execute on function public.eas_rate_hit(text[], integer[], integer) to service_role;
