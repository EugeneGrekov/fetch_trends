import type { AutocompleteCollector, CollectContext } from '../utilities/autocomplete/types.js';
import type { CompetitorCollectorInput, CompetitorCollectorOutput } from '../utilities/competitors/types.js';
import type { EvidenceCollector } from '../utilities/external/types.js';
import type { RedditCollectorInput, RedditCollectorOutput } from '../utilities/reddit/types.js';
import type { ReviewsCollectorInput, ReviewsCollectorOutput } from '../utilities/reviews/types.js';
import type { SerpCollectorOutput, SerpQueryInput } from '../utilities/serp/types.js';
import type { YouTubeCollectorInput, YouTubeCollectorOutput } from '../utilities/youtube/types.js';
import type { ExternalCollectorOverrides } from '../validation/external-types.js';

export class FakeAutocompleteCollector implements AutocompleteCollector {
  async collect(prefix: string, _context: CollectContext): Promise<string[]> {
    return [
      `${prefix} app`,
      `${prefix} android`,
      `${prefix} not working`,
    ];
  }

  async close(): Promise<void> {
    return undefined;
  }
}

export class FakeSerpCollector implements EvidenceCollector<SerpQueryInput, SerpCollectorOutput> {
  readonly name = 'serp';

  async collect(input: SerpQueryInput): Promise<SerpCollectorOutput> {
    return {
      blocked: false,
      errors: [],
      fetchedAt: '2026-07-07T10:00:00.000Z',
      items: [
        {
          query: input.queries[0] ?? 'parking location app',
          url: 'https://parksaver.app',
          title: 'Park Saver',
          snippet: 'One-time parking location app with automatic save.',
          position: 1,
          resultType: 'organic',
          domain: 'parksaver.app',
        },
        {
          query: input.queries[0] ?? 'parking location app',
          url: 'https://reddit.com/r/androidapps/comments/example',
          title: 'Parking app keeps losing location',
          snippet: 'The app loses my parked location unless I open it first.',
          position: 2,
          resultType: 'discussion',
          domain: 'reddit.com',
        },
      ],
      rawMetadata: { provider: 'fake-serp' },
    };
  }
}

export class FakeRedditCollector implements EvidenceCollector<RedditCollectorInput, RedditCollectorOutput> {
  readonly name = 'reddit';

  async collect(input: RedditCollectorInput): Promise<RedditCollectorOutput> {
    return {
      blocked: false,
      errors: [],
      fetchedAt: '2026-07-07T10:00:01.000Z',
      items: [
        {
          query: input.queries[0] ?? 'parking location app',
          url: 'https://reddit.com/r/androidapps/comments/example',
          title: 'Parking app keeps losing location',
          snippet: 'The app loses my parked location unless I open it first.',
          community: 'r/androidapps',
          score: 12,
          commentCount: 8,
          createdAt: null,
        },
      ],
      rawMetadata: { provider: 'fake-reddit' },
    };
  }
}

export class FakeYouTubeCollector implements EvidenceCollector<YouTubeCollectorInput, YouTubeCollectorOutput> {
  readonly name = 'youtube';

  async collect(input: YouTubeCollectorInput): Promise<YouTubeCollectorOutput> {
    return {
      blocked: false,
      errors: [],
      fetchedAt: '2026-07-07T10:00:02.000Z',
      items: [
        {
          query: input.queries[0] ?? 'parking location app',
          url: 'https://youtube.com/watch?v=abc123',
          title: 'How to recover a lost parking location',
          description: 'Manual workaround if the parking app is not working.',
          channelTitle: 'Parking Hacks',
          publishedAt: null,
          viewCount: null,
        },
      ],
      rawMetadata: { provider: 'fake-youtube' },
    };
  }
}

export class FakeReviewCollector implements EvidenceCollector<ReviewsCollectorInput, ReviewsCollectorOutput> {
  readonly name = 'reviews';

  async collect(input: ReviewsCollectorInput): Promise<ReviewsCollectorOutput> {
    return {
      blocked: false,
      errors: [],
      fetchedAt: '2026-07-07T10:00:03.000Z',
      items: [
        {
          query: input.queries[0] ?? 'parking location app',
          url: 'https://play.google.com/store/apps/details?id=example',
          title: 'Parking App Reviews',
          snippet: 'Paid app but users say it stops working and ask for a refund.',
          domain: 'play.google.com',
        },
      ],
      rawMetadata: { provider: 'fake-reviews' },
    };
  }
}

export class FakeCompetitorCollector implements EvidenceCollector<CompetitorCollectorInput, CompetitorCollectorOutput> {
  readonly name = 'competitors';

  async collect(_input: CompetitorCollectorInput): Promise<CompetitorCollectorOutput> {
    return {
      blocked: false,
      errors: [],
      fetchedAt: '2026-07-07T10:00:04.000Z',
      items: [
        {
          name: 'Park Saver',
          url: 'https://parksaver.app',
          productType: 'direct_competitor',
          priceText: '$29 one-time',
          pricingModel: 'one-time',
          positioning: 'Automatically save your parking location.',
          strengths: [],
          weaknesses: [],
          reviewSummary: 'Users want better reliability.',
          excerpt: 'Automatically save your parking location.',
        },
      ],
      rawMetadata: { provider: 'fake-competitor' },
    };
  }
}

export function createFakeExternalCollectors(): Required<ExternalCollectorOverrides> {
  return {
    competitors: new FakeCompetitorCollector(),
    reddit: new FakeRedditCollector(),
    reviews: new FakeReviewCollector(),
    serp: new FakeSerpCollector(),
    youtube: new FakeYouTubeCollector(),
  };
}
