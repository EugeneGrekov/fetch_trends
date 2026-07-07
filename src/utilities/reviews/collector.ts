import type { EvidenceCollector } from '../external/types.js';
import type { SerpProvider } from '../serp/types.js';
import type { ReviewSourceItem, ReviewsCollectorInput, ReviewsCollectorOutput } from './types.js';

const REVIEW_DOMAINS = [
  'apps.apple.com',
  'play.google.com',
  'chromewebstore.google.com',
  'g2.com',
  'capterra.com',
  'trustpilot.com',
  'producthunt.com',
];

export class ReviewMiningCollector implements EvidenceCollector<ReviewsCollectorInput, ReviewsCollectorOutput> {
  readonly name = 'reviews';

  constructor(private readonly provider: SerpProvider) {}

  async collect(input: ReviewsCollectorInput): Promise<ReviewsCollectorOutput> {
    const searchQueries = input.queries.map((query) => `${query} reviews`);
    const serpOutput = await this.provider.search({
      queries: searchQueries,
      country: input.country,
      language: input.language,
      limit: input.limit,
    });

    const seen = new Set<string>();
    const items: ReviewSourceItem[] = [];

    for (const result of serpOutput.items) {
      if (!isReviewDomain(result.domain) || seen.has(result.url)) {
        continue;
      }

      seen.add(result.url);
      items.push({
        query: result.query,
        url: result.url,
        title: result.title,
        snippet: result.snippet,
        domain: result.domain,
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

export function isReviewDomain(domain: string): boolean {
  return REVIEW_DOMAINS.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));
}
