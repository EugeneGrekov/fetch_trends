import type { CollectorOutput } from '../external/types.js';

export interface CompetitorCollectorInput {
  candidateUrls: string[];
  idea: {
    title: string;
    cleanedIdea: string;
    targetMarket: string | null;
  };
  maxPages: number;
}

export interface CompetitorItem {
  name: string;
  url: string;
  productType: string;
  priceText: string | null;
  pricingModel: string;
  positioning: string | null;
  strengths: string[];
  weaknesses: string[];
  reviewSummary: string | null;
  excerpt: string | null;
}

export type CompetitorCollectorOutput = CollectorOutput<CompetitorItem>;

export interface PageFetchResult {
  url: string;
  status: number;
  body: string;
}

export interface PageFetcher {
  fetch(url: string): Promise<PageFetchResult>;
}
