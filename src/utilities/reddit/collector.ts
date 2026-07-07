import type { EvidenceCollector } from '../external/types.js';
import type { SerpProvider } from '../serp/types.js';
import type { RedditCollectorInput, RedditCollectorOutput, RedditThreadItem } from './types.js';

export class RedditDiscoveryCollector implements EvidenceCollector<RedditCollectorInput, RedditCollectorOutput> {
  readonly name = 'reddit';

  constructor(private readonly provider: SerpProvider) {}

  async collect(input: RedditCollectorInput): Promise<RedditCollectorOutput> {
    const searchQueries = buildSearchQueries(input);
    const serpOutput = await this.provider.search({
      queries: searchQueries,
      country: input.country,
      language: input.language,
      limit: input.limit,
    });

    const seen = new Set<string>();
    const items: RedditThreadItem[] = [];

    for (const result of serpOutput.items) {
      if (!isRedditUrl(result.url) || seen.has(result.url)) {
        continue;
      }

      seen.add(result.url);
      items.push({
        query: result.query,
        url: result.url,
        title: result.title,
        snippet: result.snippet,
        community: extractCommunity(result.url),
        score: null,
        commentCount: null,
        createdAt: null,
      });
    }

    return {
      items: items.slice(0, input.limit),
      rawMetadata: {
        provider: this.provider.name,
        searchQueries,
        serp: serpOutput.rawMetadata,
      },
      errors: serpOutput.errors,
      blocked: serpOutput.blocked,
      fetchedAt: serpOutput.fetchedAt,
    };
  }
}

function buildSearchQueries(input: RedditCollectorInput): string[] {
  const queries = new Set<string>();

  for (const query of input.queries) {
    if (input.subreddits.length === 0) {
      queries.add(`site:reddit.com ${query}`);
      continue;
    }

    for (const subreddit of input.subreddits) {
      queries.add(`site:reddit.com/r/${subreddit.replace(/^r\//, '')} ${query}`);
    }
  }

  return [...queries];
}

function isRedditUrl(url: string): boolean {
  return /(^|\.)reddit\.com$/i.test(extractHostname(url));
}

function extractCommunity(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.split('/').filter(Boolean);
    const subredditIndex = pathname.indexOf('r');
    if (subredditIndex >= 0 && pathname[subredditIndex + 1]) {
      return `r/${pathname[subredditIndex + 1]}`;
    }
  } catch {
    return null;
  }

  return null;
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
