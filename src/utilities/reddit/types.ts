import type { CollectorOutput } from '../external/types.js';

export interface RedditCollectorInput {
  queries: string[];
  subreddits: string[];
  country: string;
  language: string;
  limit: number;
}

export interface RedditThreadItem {
  query: string;
  url: string;
  title: string;
  snippet: string;
  community: string | null;
  score: number | null;
  commentCount: number | null;
  createdAt: string | null;
}

export type RedditCollectorOutput = CollectorOutput<RedditThreadItem>;
