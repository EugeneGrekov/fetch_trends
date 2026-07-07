import type { EvidenceCollector } from '../external/types.js';
import type { SerpProvider } from '../serp/types.js';
import type { YouTubeCollectorInput, YouTubeCollectorOutput, YouTubeVideoItem } from './types.js';

export class YouTubeSearchCollector implements EvidenceCollector<YouTubeCollectorInput, YouTubeCollectorOutput> {
  readonly name = 'youtube';

  constructor(private readonly provider: SerpProvider) {}

  async collect(input: YouTubeCollectorInput): Promise<YouTubeCollectorOutput> {
    const searchQueries = input.queries.map((query) => `site:youtube.com/watch ${query}`);
    const serpOutput = await this.provider.search({
      queries: searchQueries,
      country: input.country,
      language: input.language,
      limit: input.limit,
    });

    const seen = new Set<string>();
    const items: YouTubeVideoItem[] = [];

    for (const result of serpOutput.items) {
      if (!isYouTubeVideoUrl(result.url) || seen.has(result.url)) {
        continue;
      }

      seen.add(result.url);
      items.push({
        query: result.query,
        url: result.url,
        title: result.title,
        description: result.snippet,
        channelTitle: null,
        publishedAt: null,
        viewCount: null,
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

function isYouTubeVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /(^|\.)youtube\.com$/i.test(parsed.hostname) && parsed.pathname === '/watch';
  } catch {
    return false;
  }
}
