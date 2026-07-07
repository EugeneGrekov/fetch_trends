import type { CollectorError, EvidenceCollector } from '../external/types.js';
import type { SerpCollectorOutput, SerpProvider, SerpQueryInput, SerpResultItem, SerpResultType } from './types.js';

export class SerpCollector implements EvidenceCollector<SerpQueryInput, SerpCollectorOutput> {
  readonly name = 'serp';

  constructor(private readonly provider: SerpProvider) {}

  async collect(input: SerpQueryInput): Promise<SerpCollectorOutput> {
    return this.provider.search(input);
  }
}

export interface SerpApiProviderOptions {
  apiKey: string;
  endpoint?: string;
}

export class SerpApiProvider implements SerpProvider {
  readonly name = 'serpapi';

  private readonly apiKey: string;

  private readonly endpoint: string;

  constructor(options: SerpApiProviderOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? 'https://serpapi.com/search.json';
  }

  async search(input: SerpQueryInput): Promise<SerpCollectorOutput> {
    const fetchedAt = new Date().toISOString();
    const items: SerpResultItem[] = [];
    const errors: CollectorError[] = [];
    const queryMetadata: Array<Record<string, unknown>> = [];

    for (const query of input.queries) {
      try {
        const response = await fetch(buildSearchUrl(this.endpoint, this.apiKey, input, query), {
          headers: {
            accept: 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          throw new Error(`SERP API responded with ${response.status}.`);
        }

        const payload = await response.json() as Record<string, unknown>;
        queryMetadata.push({
          query,
          searchMetadata: readRecord(payload.search_metadata),
          searchParameters: readRecord(payload.search_parameters),
        });
        items.push(...normalizeSerpApiPayload(query, payload, input.limit));
      } catch (error) {
        errors.push({
          code: 'serp_request_failed',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          details: { query },
        });
      }
    }

    return {
      items,
      rawMetadata: {
        provider: this.name,
        queries: queryMetadata,
      },
      errors,
      blocked: items.length === 0 && errors.length > 0,
      fetchedAt,
    };
  }
}

function buildSearchUrl(endpoint: string, apiKey: string, input: SerpQueryInput, query: string): URL {
  const url = new URL(endpoint);
  url.searchParams.set('engine', 'google');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('gl', input.country.toLowerCase());
  url.searchParams.set('hl', input.language);
  url.searchParams.set('num', String(input.limit));
  return url;
}

function normalizeSerpApiPayload(query: string, payload: Record<string, unknown>, limit: number): SerpResultItem[] {
  const items: SerpResultItem[] = [];
  const seen = new Set<string>();

  for (const result of readArray(payload.organic_results)) {
    const item = normalizeResult(query, result, 'organic');
    if (!item || seen.has(item.url)) {
      continue;
    }

    seen.add(item.url);
    items.push(item);
  }

  for (const result of readArray(payload.discussions_and_forums)) {
    const item = normalizeResult(query, result, 'discussion');
    if (!item || seen.has(item.url)) {
      continue;
    }

    seen.add(item.url);
    items.push(item);
  }

  for (const result of readArray(payload.video_results)) {
    const item = normalizeResult(query, result, 'video');
    if (!item || seen.has(item.url)) {
      continue;
    }

    seen.add(item.url);
    items.push(item);
  }

  return items.slice(0, limit);
}

function normalizeResult(
  query: string,
  raw: Record<string, unknown>,
  resultType: SerpResultType,
): SerpResultItem | null {
  const url = getString(raw.link) ?? getString(raw.url);
  if (!url) {
    return null;
  }

  return {
    query,
    url,
    title: getString(raw.title) ?? url,
    snippet: getString(raw.snippet) ?? getString(raw.description) ?? '',
    position: getNumber(raw.position),
    resultType,
    domain: extractDomain(url),
  };
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
