import type { CollectorOutput } from '../external/types.js';

export interface YouTubeCollectorInput {
  queries: string[];
  country: string;
  language: string;
  limit: number;
}

export interface YouTubeVideoItem {
  query: string;
  url: string;
  title: string;
  description: string;
  channelTitle: string | null;
  publishedAt: string | null;
  viewCount: number | null;
}

export type YouTubeCollectorOutput = CollectorOutput<YouTubeVideoItem>;
