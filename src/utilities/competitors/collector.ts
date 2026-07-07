import type { CollectorError, EvidenceCollector } from '../external/types.js';
import type {
  CompetitorCollectorInput,
  CompetitorCollectorOutput,
  CompetitorItem,
  PageFetchResult,
  PageFetcher,
} from './types.js';

export class HttpPageFetcher implements PageFetcher {
  async fetch(url: string): Promise<PageFetchResult> {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'fetch-trends/0.0.0 (+https://local.fetch-trends)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    return {
      url: response.url,
      status: response.status,
      body: await response.text(),
    };
  }
}

export class CompetitorPageCollector implements EvidenceCollector<CompetitorCollectorInput, CompetitorCollectorOutput> {
  readonly name = 'competitors';

  constructor(private readonly fetcher: PageFetcher = new HttpPageFetcher()) {}

  async collect(input: CompetitorCollectorInput): Promise<CompetitorCollectorOutput> {
    const fetchedAt = new Date().toISOString();
    const errors: CollectorError[] = [];
    const items: CompetitorItem[] = [];
    const candidateUrls = input.candidateUrls.slice(0, input.maxPages);

    for (const candidateUrl of candidateUrls) {
      try {
        const page = await this.fetcher.fetch(candidateUrl);
        if (page.status >= 400) {
          throw new Error(`Competitor page responded with ${page.status}.`);
        }

        if (looksBlocked(page.body)) {
          errors.push({
            code: 'competitor_page_blocked',
            message: 'Competitor page appears blocked or behind anti-bot protection.',
            retryable: true,
            details: { url: candidateUrl },
          });
          continue;
        }

        const text = htmlToText(page.body);
        const title = extractTitle(page.body) ?? fallbackNameFromUrl(page.url);
        const positioning = extractPositioning(page.body, text);
        const priceText = extractPriceText(text);
        items.push({
          name: cleanTitle(title),
          url: page.url,
          productType: classifyProductType(page.url, title, positioning),
          priceText,
          pricingModel: detectPricingModel(priceText),
          positioning,
          strengths: [],
          weaknesses: [],
          reviewSummary: null,
          excerpt: positioning ?? text.slice(0, 240),
        });
      } catch (error) {
        errors.push({
          code: 'competitor_page_failed',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          details: { url: candidateUrl },
        });
      }
    }

    return {
      items,
      rawMetadata: {
        candidateUrls,
      },
      errors,
      blocked: items.length === 0 && errors.length > 0,
      fetchedAt,
    };
  }
}

function looksBlocked(html: string): boolean {
  return /captcha|access denied|verify you are human/i.test(html);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function extractMetaDescription(html: string): string | null {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
    ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  return match?.[1]?.trim() ?? null;
}

function extractPositioning(html: string, text: string): string | null {
  const description = extractMetaDescription(html);
  if (description) {
    return description;
  }

  const sentence = text.split(/(?<=[.!?])\s+/).find((part) => part.length >= 40);
  return sentence?.trim() ?? null;
}

function extractPriceText(text: string): string | null {
  const sentence = text.split(/(?<=[.!?])\s+/).find((part) =>
    /(?:[$€£]\s?\d|\bfree\b|\bone-time\b|\bmonthly\b|\bper month\b|\bsubscription\b)/i.test(part),
  );
  return sentence?.trim() ?? null;
}

function detectPricingModel(priceText: string | null): string {
  if (!priceText) {
    return 'unknown';
  }

  if (/\bone-time\b/i.test(priceText)) {
    return 'one-time';
  }

  if (/\bsubscription\b|\bmonthly\b|\bper month\b|\byearly\b/i.test(priceText)) {
    return 'subscription';
  }

  if (/\bfree\b/i.test(priceText)) {
    return 'free';
  }

  return 'unknown';
}

function classifyProductType(url: string, title: string, positioning: string | null): string {
  const haystack = `${url} ${title} ${positioning ?? ''}`.toLowerCase();
  if (/support\.google|apple\.com|microsoft\.com|mozilla\.org/.test(haystack)) {
    return 'built_in_alternative';
  }

  return 'direct_competitor';
}

function cleanTitle(title: string): string {
  return title.split('|')[0]?.split(' - ')[0]?.trim() || title.trim();
}

function fallbackNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
