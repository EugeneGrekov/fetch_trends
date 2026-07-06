#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_TICKET_LIMIT = 10;

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`Usage: os-runtime-diagnostic --os-id <uuid> [options]

Options:
  --env-file <path>          Env file to load; defaults to .env.local then .env
  --ticket-limit <number>    Recent proxy tickets to summarize (default: 10)
  --skip-provider-fetch      Do not fetch/classify the Provider runtime URL
  --json                     Print JSON only
  -h, --help                 Show this help
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    osId: "",
    envFile: "",
    ticketLimit: DEFAULT_TICKET_LIMIT,
    providerFetch: true,
    jsonOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case "--os-id":
        args.osId = argv[++index] ?? "";
        break;
      case "--env-file":
        args.envFile = argv[++index] ?? "";
        break;
      case "--ticket-limit":
        args.ticketLimit = Number(argv[++index] ?? DEFAULT_TICKET_LIMIT);
        break;
      case "--skip-provider-fetch":
        args.providerFetch = false;
        break;
      case "--json":
        args.jsonOnly = true;
        break;
      case "-h":
      case "--help":
        usage(0);
        break;
      default:
        throw new Error(`Unknown argument: ${value}`);
    }
  }

  if (!args.osId.trim()) throw new Error("--os-id is required");
  if (!Number.isFinite(args.ticketLimit) || args.ticketLimit < 1 || args.ticketLimit > 100) {
    throw new Error("--ticket-limit must be between 1 and 100");
  }
  args.ticketLimit = Math.trunc(args.ticketLimit);
  return args;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;
  const key = match[1];
  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadEnvFile(explicitPath) {
  const candidates = explicitPath
    ? [explicitPath]
    : [".env.local", ".env"];
  const loaded = [];
  for (const candidate of candidates) {
    const fullPath = path.resolve(process.cwd(), candidate);
    if (!fs.existsSync(fullPath)) continue;
    const text = fs.readFileSync(fullPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      if (parsed.key === "NODE_OPTIONS") continue;
      if (!process.env[parsed.key]) process.env[parsed.key] = parsed.value;
    }
    loaded.push(fullPath);
    if (explicitPath) break;
  }
  return loaded;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function hash(value) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value ?? "")),
  );
  return Buffer.from(buffer).toString("hex").slice(0, 16);
}

function hasPreviewToken(url) {
  return typeof url === "string" && url.includes("_preview_token=");
}

function urlOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function titleOf(text) {
  return (text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim().slice(0, 160);
}

function classifyProviderHtml(text) {
  const normalized = text.slice(0, 20_000).toLowerCase();
  const title = titleOf(text).toLowerCase();
  const loading = [
    "preview is loading",
    "preview is starting up",
    "preview loading - base44",
    "preview loading - provider",
    "app preview is being prepared",
    "automatically refresh in a few seconds",
  ].some((needle) => normalized.includes(needle));
  const login = (
    /\b(sign in|log in|login)\b/.test(title) && /base44|provider/.test(normalized)
  ) || (
    /app\.base44\.com\/login/.test(normalized) ||
    /loginvia|authprovider|navigatetologin/i.test(text)
  );
  return { loading, login };
}

function compactText(text, length = 220) {
  return text.replace(/\s+/g, " ").trim().slice(0, length);
}

async function restQuery(supabaseUrl, serviceRole, table, params) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${table} query failed with HTTP ${response.status}: ${compactText(text, 500)}`);
  }
  return text.trim() ? JSON.parse(text) : [];
}

async function providerFetch(targetUrl) {
  if (!targetUrl) return null;
  const startedAt = Date.now();
  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Applyt Base44 runtime diagnostic",
      },
    });
    const text = await response.text().catch(() => "");
    return {
      target_hash: await hash(targetUrl),
      target_origin: urlOrigin(targetUrl),
      target_has_preview_token: hasPreviewToken(targetUrl),
      http_status: response.status,
      content_type: response.headers.get("content-type"),
      location_is_login: /login|signin|auth/i.test(response.headers.get("location") ?? ""),
      elapsed_ms: Date.now() - startedAt,
      title: titleOf(text),
      classification: classifyProviderHtml(text),
      body_prefix: compactText(text),
    };
  } catch (error) {
    return {
      target_hash: await hash(targetUrl),
      target_origin: urlOrigin(targetUrl),
      target_has_preview_token: hasPreviewToken(targetUrl),
      elapsed_ms: Date.now() - startedAt,
      error_name: error?.name ?? "Error",
      error_message: String(error?.message ?? error),
    };
  }
}

async function sanitizeApp(app) {
  if (!app) return null;
  const reference = app.base44_reference && typeof app.base44_reference === "object"
    ? app.base44_reference
    : {};
  return {
    id: app.id,
    name: app.name,
    status: app.status,
    version: app.version,
    ready_at: app.ready_at,
    updated_at: app.updated_at,
    latest_job_id: app.latest_job_id,
    latest_job_feedback: app.latest_job_feedback,
    failure_reason: app.failure_reason,
    base44_provider_status: app.base44_provider_status,
    base44_app_id_hash: app.base44_app_id ? await hash(app.base44_app_id) : null,
    has_base44_app_id: Boolean(app.base44_app_id),
    has_base44_app_url: Boolean(app.base44_app_url),
    has_base44_embed_url: Boolean(app.base44_embed_url),
    base44_app_url_origin: urlOrigin(app.base44_app_url),
    base44_embed_url_origin: urlOrigin(app.base44_embed_url),
    base44_app_url_has_preview_token: hasPreviewToken(app.base44_app_url),
    base44_embed_url_has_preview_token: hasPreviewToken(app.base44_embed_url),
    base44_app_url_hash: app.base44_app_url ? await hash(app.base44_app_url) : null,
    base44_embed_url_hash: app.base44_embed_url ? await hash(app.base44_embed_url) : null,
    direct_access_guard: reference.direct_access_guard ?? null,
    has_sandbox_preview_refresh: Boolean(reference.sandbox_preview_refresh),
    last_refresh_at: reference.last_refresh_at ?? null,
  };
}

async function sanitizeCache(cache) {
  if (!cache) return null;
  return {
    operating_system_id: cache.operating_system_id,
    last_ready_at: cache.last_ready_at,
    last_ready_version: cache.last_ready_version,
    updated_at: cache.updated_at,
    has_screenshot: Boolean(cache.screenshot_url),
    runtime_health: cache.runtime_health ?? null,
    embed_url_origin: urlOrigin(cache.embed_url),
    direct_url_origin: urlOrigin(cache.direct_url),
    embed_url_has_preview_token: hasPreviewToken(cache.embed_url),
    direct_url_has_preview_token: hasPreviewToken(cache.direct_url),
    embed_url_hash: cache.embed_url ? await hash(cache.embed_url) : null,
    direct_url_hash: cache.direct_url ? await hash(cache.direct_url) : null,
  };
}

async function sanitizeTickets(tickets, cache) {
  return Promise.all(tickets.map(async (ticket) => ({
    created_at: ticket.created_at,
    expires_at: ticket.expires_at,
    last_used_at: ticket.last_used_at,
    provider_origin: ticket.provider_origin,
    provider_app_id_hash: ticket.provider_app_id ? await hash(ticket.provider_app_id) : null,
    provider_base_url_hash: ticket.provider_base_url ? await hash(ticket.provider_base_url) : null,
    provider_base_url_has_preview_token: hasPreviewToken(ticket.provider_base_url),
    matches_cache_embed: Boolean(cache?.embed_url && ticket.provider_base_url === cache.embed_url),
    matches_cache_direct: Boolean(cache?.direct_url && ticket.provider_base_url === cache.direct_url),
  })));
}

function sanitizeConnections(connections) {
  return connections.map((connection) => ({
    status: connection.status,
    auth_mode: connection.auth_mode,
    token_expires_at: connection.token_expires_at,
    last_checked_at: connection.last_checked_at,
    last_success_at: connection.last_success_at,
    last_refresh_at: connection.last_refresh_at,
    last_error: connection.last_error,
    last_error_at: connection.last_error_at,
    failure_count: connection.failure_count,
    alert_reason_code: connection.alert_reason_code,
  }));
}

function sanitizeJobs(jobs) {
  return jobs.map((job) => ({
    id: job.id,
    job_type: job.job_type,
    status: job.status,
    progress_percent: job.progress_percent,
    current_step: job.current_step,
    provider_status: job.provider_status,
    error_message: job.error_message,
    started_at: job.started_at,
    completed_at: job.completed_at,
    updated_at: job.updated_at,
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loadedEnvFiles = loadEnvFile(args.envFile);
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL");

  const appRows = await restQuery(supabaseUrl, serviceRole, "operating_system_apps", {
    select: "id,name,status,version,ready_at,updated_at,latest_job_id,latest_job_feedback,failure_reason,base44_app_id,base44_app_url,base44_embed_url,base44_provider_status,base44_reference",
    id: `eq.${args.osId}`,
    limit: "1",
  });
  const app = appRows[0] ?? null;
  if (!app) throw new Error(`Operating System not found: ${args.osId}`);

  const cacheRows = await restQuery(supabaseUrl, serviceRole, "operating_system_runtime_cache", {
    select: "operating_system_id,embed_url,direct_url,last_ready_at,last_ready_version,runtime_health,updated_at,screenshot_url",
    operating_system_id: `eq.${args.osId}`,
    limit: "1",
  });
  const cache = cacheRows[0] ?? null;

  const tickets = await restQuery(supabaseUrl, serviceRole, "operating_system_proxy_tickets", {
    select: "created_at,expires_at,last_used_at,provider_app_id,provider_origin,provider_base_url",
    operating_system_id: `eq.${args.osId}`,
    order: "created_at.desc",
    limit: String(args.ticketLimit),
  });

  const jobs = await restQuery(supabaseUrl, serviceRole, "operating_system_jobs", {
    select: "id,job_type,status,progress_percent,current_step,provider_status,error_message,started_at,completed_at,updated_at",
    operating_system_id: `eq.${args.osId}`,
    order: "created_at.desc",
    limit: "5",
  });

  const connections = await restQuery(supabaseUrl, serviceRole, "base44_connections", {
    select: "status,auth_mode,token_expires_at,last_checked_at,last_success_at,last_refresh_at,last_error,last_error_at,failure_count,alert_reason_code,updated_at,created_at",
    order: "updated_at.desc.nullslast,created_at.desc.nullslast",
    limit: "5",
  });

  const targetUrl = cache?.embed_url || cache?.direct_url || app.base44_embed_url || app.base44_app_url || null;
  const provider = args.providerFetch ? await providerFetch(targetUrl) : null;

  const result = {
    generated_at: new Date().toISOString(),
    loaded_env_files: loadedEnvFiles.map((file) => path.relative(process.cwd(), file) || file),
    project_ref_hint: (() => {
      try {
        return new URL(supabaseUrl).hostname.split(".")[0];
      } catch {
        return null;
      }
    })(),
    operating_system: await sanitizeApp(app),
    runtime_cache: await sanitizeCache(cache),
    recent_proxy_tickets: await sanitizeTickets(tickets, cache),
    latest_jobs: sanitizeJobs(jobs),
    base44_connections: sanitizeConnections(connections),
    provider_fetch: provider,
  };

  if (args.jsonOnly) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: error?.name ?? "Error",
    message: String(error?.message ?? error),
  }, null, 2));
  process.exit(1);
});
