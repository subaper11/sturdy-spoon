-- v5.12: lets the Edge Function report whether the clean-up job is really scheduled (pg_cron is optional in the schema, REQUIRED in production).
-- Read-only, server-only. True only when pg_cron is installed AND the job 'eas-cleanup-stale-games' exists and is active.
create or replace function public.eas_cleanup_scheduled()
returns boolean language plpgsql security definer set search_path = '' as $$
declare found boolean := false;
begin
  if to_regclass('cron.job') is null then return false; end if;
  execute $q$select exists (select 1 from cron.job where jobname = 'eas-cleanup-stale-games' and active)$q$ into found;
  return coalesce(found, false);
exception when others then return false;
end $$;
revoke all on function public.eas_cleanup_scheduled() from public, anon, authenticated;
grant execute on function public.eas_cleanup_scheduled() to service_role;
