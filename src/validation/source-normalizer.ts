import type { CreateSourceInput, SourceRow } from '../db/schema.js';
import type { SerpResultItem } from '../utilities/serp/types.js';
import { isReviewDomain } from '../utilities/reviews/collector.js';

const FORUM_HOSTS = ['reddit.com', 'news.ycombinator.com', 'stackoverflow.com', 'superuser.com'];
const SOCIAL_HOSTS = ['x.com', 'twitter.com', 'facebook.com', 'linkedin.com', 'instagram.com', 'tiktok.com'];

export function toSerpSourceInput(ideaId: number, item: SerpResultItem, fetchedAt: string): CreateSourceInput {
  return {
    ideaId,
    url: item.url,
    sourceType: classifySerpSourceType(item),
    title: normalizeSourceText(item.title),
    snippet: normalizeSourceText(item.snippet),
    fetchedAt,
  };
}

export function toSourceInput(args: {
  ideaId: number;
  url: string;
  sourceType: string;
  title?: string | null;
  snippet?: string | null;
  fetchedAt: string;
}): CreateSourceInput {
  return {
    ideaId: args.ideaId,
    url: args.url,
    sourceType: args.sourceType,
    title: normalizeSourceText(args.title ?? null),
    snippet: normalizeSourceText(args.snippet ?? null),
    fetchedAt: args.fetchedAt,
  };
}

export function classifySerpSourceType(item: SerpResultItem): string {
  const host = extractHost(item.url);
  if (host.includes('reddit.com')) {
    return 'reddit_thread';
  }

  if (host.includes('youtube.com') || host === 'youtu.be') {
    return 'youtube_video';
  }

  if (isReviewDomain(host)) {
    return 'review_page';
  }

  if (item.resultType === 'discussion' || isForumHost(host)) {
    return 'forum_thread';
  }

  return 'serp_result';
}

export function isPotentialCompetitorUrl(url: string): boolean {
  const host = extractHost(url);
  if (!host) {
    return false;
  }

  if (host.includes('google.com') || host.includes('serpapi.com')) {
    return false;
  }

  if (host.includes('youtube.com') || host === 'youtu.be') {
    return false;
  }

  if (host.includes('reddit.com') || isForumHost(host) || isReviewDomain(host)) {
    return false;
  }

  return !SOCIAL_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

export function isEvidenceFriendlySource(source: Pick<SourceRow, 'source_type'>): boolean {
  return ['reddit_thread', 'forum_thread', 'review_page', 'youtube_video', 'youtube_comment'].includes(source.source_type);
}

export function extractHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isForumHost(host: string): boolean {
  return FORUM_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function normalizeSourceText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}
