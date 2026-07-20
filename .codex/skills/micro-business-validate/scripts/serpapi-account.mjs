#!/usr/bin/env node

const args = process.argv.slice(2);
let neededCredits = 0;
let json = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === '--json') {
    json = true;
    continue;
  }

  if (arg === '--needed') {
    const value = args[index + 1];
    if (!value || !/^\d+$/.test(value)) {
      fail('Expected a non-negative integer after --needed.', 2);
    }
    neededCredits = Number(value);
    index += 1;
    continue;
  }

  fail(`Unknown argument: ${arg}`, 2);
}

const apiKey = process.env.SERP_API_KEY?.trim();
if (!apiKey) {
  fail('SERP_API_KEY is missing. Set it before running external search collectors.', 2);
}

const url = new URL('https://serpapi.com/account.json');
url.searchParams.set('api_key', apiKey);

try {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const payload = await readJson(response);

  if (!response.ok || typeof payload.error === 'string') {
    fail(payload.error ?? `SerpAPI account endpoint responded with ${response.status}.`, 1);
  }

  const summary = summarize(payload, neededCredits);

  if (json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    printHuman(summary);
  }

  if (summary.enough_credits === false) {
    process.exitCode = 3;
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), 1);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`SerpAPI account endpoint returned non-JSON response: ${text.slice(0, 120)}`);
  }
}

function summarize(payload, needed) {
  const totalSearchesLeft = numberOrNull(payload.total_searches_left);
  const planSearchesLeft = numberOrNull(payload.plan_searches_left);
  const extraCredits = numberOrNull(payload.extra_credits);
  const searchesPerMonth = numberOrNull(payload.searches_per_month);
  const thisMonthUsage = numberOrNull(payload.this_month_usage);
  const thisHourSearches = numberOrNull(payload.this_hour_searches);
  const accountRateLimitPerHour = numberOrNull(payload.account_rate_limit_per_hour);

  const comparableRemaining = totalSearchesLeft ?? planSearchesLeft;

  return {
    account_status: stringOrNull(payload.account_status),
    plan_name: stringOrNull(payload.plan_name),
    searches_per_month: searchesPerMonth,
    plan_searches_left: planSearchesLeft,
    extra_credits: extraCredits,
    total_searches_left: totalSearchesLeft,
    this_month_usage: thisMonthUsage,
    this_hour_searches: thisHourSearches,
    account_rate_limit_per_hour: accountRateLimitPerHour,
    plan_renewal_date: stringOrNull(payload.plan_renewal_date),
    needed_credits: needed,
    enough_credits: needed > 0 && comparableRemaining != null ? comparableRemaining >= needed : null,
  };
}

function printHuman(summary) {
  const lines = [
    'SerpAPI account check',
    `Status: ${summary.account_status ?? 'unknown'}`,
    `Plan: ${summary.plan_name ?? 'unknown'}`,
    `Usage this month: ${formatNumber(summary.this_month_usage)} / ${formatNumber(summary.searches_per_month)}`,
    `Plan searches left: ${formatNumber(summary.plan_searches_left)}`,
    `Extra credits: ${formatNumber(summary.extra_credits)}`,
    `Total searches left: ${formatNumber(summary.total_searches_left)}`,
    `Hourly usage: ${formatNumber(summary.this_hour_searches)} / ${formatNumber(summary.account_rate_limit_per_hour)}`,
    `Plan renewal date: ${summary.plan_renewal_date ?? 'unknown'}`,
  ];

  if (summary.needed_credits > 0) {
    lines.push(`Needed credits: ${summary.needed_credits}`);
    lines.push(`Enough credits: ${summary.enough_credits === true ? 'yes' : 'no'}`);
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function formatNumber(value) {
  return value == null ? 'unknown' : String(value);
}

function fail(message, code) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(code);
}

