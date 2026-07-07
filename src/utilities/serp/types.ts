import type { CollectorOutput } from '../external/types.js';

export interface SerpQueryInput {
  queries: string[];
  country: string;
  language: string;
  limit: number;
}

export type SerpResultType = 'organic' | 'discussion' | 'video' | 'review' | 'unknown';

export interface SerpResultItem {
  query: string;
  url: string;
  title: string;
  snippet: string;
  position: number | null;
  resultType: SerpResultType;
  domain: string;
}

export type SerpCollectorOutput = CollectorOutput<SerpResultItem>;

export interface SerpProvider {
  readonly name: string;
  search(input: SerpQueryInput): Promise<SerpCollectorOutput>;
}
