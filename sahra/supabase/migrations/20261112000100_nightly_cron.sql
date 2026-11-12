-- Schedule the nightly job with pg_cron (available on Supabase Free).
-- 00:15 UTC = 03:15 in Amman. Skipped when pg_cron isn't available (local tests).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('sahra-nightly', '15 0 * * *', 'select public.nightly_maintenance()');
  end if;
end
$$;
