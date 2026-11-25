-- v5.11.1: shared, atomic limiter for room-code guessing (replaces the per-Edge-Function-instance counter, which a client could bypass
-- by reaching different instances). Forward-only and safe to rerun (if not exists / create or replace). Touches no existing table or data.
-- Keys are opaque strings the Edge Function builds: 'u:<user uuid>' and 'n:<keyed hash of the network address>'. Raw IP addresses are never stored.
create table if not exists public.join_misses (
  key          text primary key check (char_length(key) <= 80),
  n            integer     not null default 1 check (n >= 0),
  window_start timestamptz not null default now()
);
create index if not exists join_misses_window_idx on public.join_misses (window_start);

-- Server-only: RLS on, no policy, no grant to client roles (same pattern as game_private / game_actions).
alter table public.join_misses enable row level security;
revoke all on public.join_misses from public, anon, authenticated;

-- True when any key already has its limit (p_maxes[i] for p_keys[i]) or more misses inside the current window.
create or replace function public.eas_join_blocked(p_keys text[], p_maxes integer[], p_window_ms integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from unnest(p_keys, p_maxes) as t(k, mx)
    join public.join_misses m on m.key = t.k
    where m.n >= t.mx and m.window_start > now() - make_interval(secs => p_window_ms / 1000.0));
$$;

-- Records one failed guess per key, atomically (one INSERT ... ON CONFLICT, so concurrent requests cannot lose counts), and prunes old rows.
create or replace function public.eas_join_miss(p_keys text[], p_window_ms integer)
returns void language plpgsql security definer set search_path = '' as $$
declare w interval := make_interval(secs => p_window_ms / 1000.0);
begin
  insert into public.join_misses as m (key, n, window_start)
    select k, 1, now() from unnest(p_keys) as k where k is not null and char_length(k) <= 80
  on conflict (key) do update
    set n = case when m.window_start <= now() - w then 1 else m.n + 1 end,
        window_start = case when m.window_start <= now() - w then now() else m.window_start end;
  delete from public.join_misses where window_start < now() - interval '1 hour';
end $$;

revoke all on function public.eas_join_blocked(text[], integer[], integer) from public, anon, authenticated;
revoke all on function public.eas_join_miss(text[], integer) from public, anon, authenticated;
grant execute on function public.eas_join_blocked(text[], integer[], integer) to service_role;
grant execute on function public.eas_join_miss(text[], integer) to service_role;
