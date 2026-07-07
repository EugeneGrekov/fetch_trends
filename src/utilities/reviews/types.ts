import type { CollectorOutput } from '../external/types.js';

export interface ReviewsCollectorInput {
  queries: string[];
  country: string;
  language: string;
  limit: number;
}

export interface ReviewSourceItem {
  query: string;
  url: string;
  title: string;
  snippet: string;
  domain: string;
}

export type ReviewsCollectorOutput = CollectorOutput<ReviewSourceItem>;
