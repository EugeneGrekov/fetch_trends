import { describe, expect, it } from 'vitest';
import { CompetitorPageCollector } from './competitors/collector.js';
import type { PageFetchResult, PageFetcher } from './competitors/types.js';
import { RedditDiscoveryCollector } from './reddit/collector.js';
import { ReviewMiningCollector } from './reviews/collector.js';
import type { SerpProvider, SerpQueryInput, SerpCollectorOutput } from './serp/types.js';
import { YouTubeSearchCollector } from './youtube/collector.js';

describe('external collectors', () => {
  it('filters Reddit threads from a SERP provider', async () => {
    const collector = new RedditDiscoveryCollector(new FakeSerpProvider());
    const output = await collector.collect({
      queries: ['parking app not working'],
      subreddits: [],
      country: 'US',
      language: 'en',
      limit: 10,
    });

    expect(output.items).toEqual([
      expect.objectContaining({
        url: 'https://reddit.com/r/androidapps/comments/example',
        community: 'r/androidapps',
      }),
    ]);
  });

  it('filters YouTube videos and review pages from a SERP provider', async () => {
    const provider = new FakeSerpProvider();
    const youtubeOutput = await new YouTubeSearchCollector(provider).collect({
      queries: ['parking app tutorial'],
      country: 'US',
      language: 'en',
      limit: 10,
    });
    const reviewOutput = await new ReviewMiningCollector(provider).collect({
      queries: ['parking app reviews'],
      country: 'US',
      language: 'en',
      limit: 10,
    });

    expect(youtubeOutput.items).toEqual([
      expect.objectContaining({ url: 'https://youtube.com/watch?v=abc123' }),
    ]);
    expect(reviewOutput.items).toEqual([
      expect.objectContaining({ domain: 'play.google.com' }),
    ]);
  });

  it('extracts pricing and positioning from competitor HTML', async () => {
    const collector = new CompetitorPageCollector(new FakePageFetcher(`
      <html>
        <head>
          <title>Park Saver | Parking App</title>
          <meta name="description" content="Automatically save your parking location in one tap.">
        </head>
        <body>
          <h1>Park Saver</h1>
          <p>$29 one-time purchase for lifetime access.</p>
        </body>
      </html>
    `));

    const output = await collector.collect({
      candidateUrls: ['https://parksaver.app'],
      idea: {
        title: 'Park Saver',
        cleanedIdea: 'parking location app',
        targetMarket: 'drivers',
      },
      maxPages: 3,
    });

    expect(output.items).toEqual([
      expect.objectContaining({
        name: 'Park Saver',
        priceText: expect.stringContaining('$29 one-time'),
        pricingModel: 'one-time',
        positioning: 'Automatically save your parking location in one tap.',
      }),
    ]);
  });
});

class FakeSerpProvider implements SerpProvider {
  readonly name = 'fake-serp';

  async search(_input: SerpQueryInput): Promise<SerpCollectorOutput> {
    return {
      items: [
        {
          query: 'parking app not working',
          url: 'https://reddit.com/r/androidapps/comments/example',
          title: 'Parking app keeps losing location',
          snippet: 'The app loses my parked location unless I open it first.',
          position: 1,
          resultType: 'discussion',
          domain: 'reddit.com',
        },
        {
          query: 'parking app tutorial',
          url: 'https://youtube.com/watch?v=abc123',
          title: 'How to recover a lost parking location',
          snippet: 'Manual workaround if the parking app is not working.',
          position: 2,
          resultType: 'video',
          domain: 'youtube.com',
        },
        {
          query: 'parking app reviews',
          url: 'https://play.google.com/store/apps/details?id=example',
          title: 'Parking App Reviews',
          snippet: 'Paid app but users say it stops working and ask for a refund.',
          position: 3,
          resultType: 'review',
          domain: 'play.google.com',
        },
      ],
      rawMetadata: { provider: this.name },
      errors: [],
      blocked: false,
      fetchedAt: '2026-07-07T10:00:00.000Z',
    };
  }
}

class FakePageFetcher implements PageFetcher {
  constructor(private readonly body: string) {}

  async fetch(url: string): Promise<PageFetchResult> {
    return {
      url,
      status: 200,
      body: this.body,
    };
  }
}
