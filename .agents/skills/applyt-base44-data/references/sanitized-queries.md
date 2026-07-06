# Sanitized Applyt Base44 Queries

Use these with Supabase MCP `execute_sql` when the diagnostic script is unavailable or a custom query is needed. Do not return raw tokenized URLs.

## Runtime State

```sql
select
  a.id,
  a.name,
  a.status as app_status,
  a.base44_provider_status,
  a.ready_at,
  a.updated_at as app_updated_at,
  a.version,
  a.latest_job_id,
  a.latest_job_feedback,
  a.failure_reason,
  nullif(btrim(coalesce(a.base44_app_id, '')), '') is not null as has_base44_app_id,
  nullif(btrim(coalesce(a.base44_app_url, '')), '') is not null as has_base44_app_url,
  nullif(btrim(coalesce(a.base44_embed_url, '')), '') is not null as has_base44_embed_url,
  c.last_ready_at,
  c.last_ready_version,
  c.updated_at as cache_updated_at,
  c.runtime_health->>'status' as cache_health_status,
  c.runtime_health->>'reason' as cache_health_reason,
  c.runtime_health->>'source' as cache_health_source,
  c.runtime_health->>'checkedAt' as cache_checked_at,
  c.screenshot_url is not null as has_screenshot,
  position('_preview_token=' in coalesce(c.embed_url, '')) > 0 as cache_embed_has_preview_token,
  position('_preview_token=' in coalesce(c.direct_url, '')) > 0 as cache_direct_has_preview_token,
  md5(coalesce(c.embed_url, '')) as cache_embed_hash,
  md5(coalesce(c.direct_url, '')) as cache_direct_hash
from public.operating_system_apps a
left join public.operating_system_runtime_cache c on c.operating_system_id = a.id
where a.id = '<operating_system_id>'::uuid;
```

## Recent Proxy Tickets

```sql
select
  t.created_at,
  t.expires_at,
  t.last_used_at,
  t.provider_app_id,
  t.provider_origin,
  position('_preview_token=' in coalesce(t.provider_base_url, '')) > 0 as ticket_has_preview_token,
  md5(coalesce(t.provider_base_url, '')) as ticket_base_hash,
  t.provider_base_url = c.embed_url as ticket_matches_cache_embed,
  t.provider_base_url = c.direct_url as ticket_matches_cache_direct
from public.operating_system_proxy_tickets t
left join public.operating_system_runtime_cache c
  on c.operating_system_id = t.operating_system_id
where t.operating_system_id = '<operating_system_id>'::uuid
order by t.created_at desc
limit 10;
```

## Provider OAuth Health

```sql
select
  c.status,
  c.auth_mode,
  c.token_expires_at,
  c.last_checked_at,
  c.last_success_at,
  c.last_refresh_at,
  c.last_error,
  c.last_error_at,
  c.failure_count,
  c.alert_reason_code
from public.base44_connections c
order by c.updated_at desc nulls last, c.created_at desc nulls last
limit 5;
```

## Latest Jobs And Events

```sql
select
  j.id,
  j.job_type,
  j.status,
  j.progress_percent,
  j.current_step,
  j.provider_status,
  j.error_message,
  j.started_at,
  j.completed_at,
  j.updated_at
from public.operating_system_jobs j
where j.operating_system_id = '<operating_system_id>'::uuid
order by j.created_at desc
limit 5;

select
  e.event_type,
  e.role,
  left(coalesce(e.content, ''), 500) as content_preview,
  e.observed_at,
  e.created_at
from public.operating_system_job_events e
where e.operating_system_id = '<operating_system_id>'::uuid
order by e.observed_at desc nulls last, e.created_at desc
limit 10;
```

## Interpretation

- App `ready` with cache `preview_loading` means the OS previously completed, but the current Provider runtime is not serving usable app HTML.
- Ticket hashes matching cache URL hashes mean tickets are still targeting the cached URL.
- Tokenized cached URLs are short-lived Provider credentials, but token presence alone does not prove expiry.
- Direct Provider `503` with `Preview Loading - Base44` means Provider loading/startup.
- Provider login/auth HTML means the URL/access path is not usable as app runtime.
