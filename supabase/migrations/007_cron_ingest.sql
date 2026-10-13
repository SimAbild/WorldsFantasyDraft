-- Ansvar: Kalder Edge Function ingest hvert 5. minut. Funktionen er idempotent og hurtig, når intet er nyt.
-- Nøglen er projektets offentlige anon-nøgle; Edge Function'en bruger selv service role internt.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('ingest-worlds', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://upeazblgasdqxmyaievq.supabase.co/functions/v1/ingest',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon-nøgle>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
