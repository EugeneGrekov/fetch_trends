import { normalizeQuery, normalizeSpaces } from '../utilities/autocomplete/normalize.js';
import { detectPlatform } from '../utilities/autocomplete/analysis.js';
import type { NormalizedIdea } from './types.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'app',
  'for',
  'from',
  'in',
  'my',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'when',
  'with',
]);

export function normalizeIdea(rawIdea: string): NormalizedIdea {
  const cleanedIdea = normalizeSpaces(rawIdea);
  const normalized = normalizeQuery(cleanedIdea);
  const keywordTokens = normalized
    .split(' ')
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token))
    .slice(0, 8);

  const platform = mapPlatform(detectPlatform(cleanedIdea));

  return {
    cleanedIdea,
    title: cleanedIdea.length <= 96 ? cleanedIdea : `${cleanedIdea.slice(0, 93).trimEnd()}...`,
    keywordTokens,
    targetMarket: inferTargetMarket(normalized),
    platform,
    expectedPrice: null,
    businessModel: inferBusinessModel(normalized),
  };
}

function inferTargetMarket(normalizedIdea: string): string | null {
  if (normalizedIdea.includes('small business')) {
    return 'small business owners';
  }

  if (normalizedIdea.includes('developer')) {
    return 'software developers';
  }

  if (normalizedIdea.includes('parent')) {
    return 'parents';
  }

  if (normalizedIdea.includes('driver') || normalizedIdea.includes('car')) {
    return 'drivers';
  }

  return null;
}

function inferBusinessModel(normalizedIdea: string): string | null {
  if (normalizedIdea.includes('subscription') || normalizedIdea.includes('monthly')) {
    return 'subscription';
  }

  if (normalizedIdea.includes('marketplace')) {
    return 'marketplace';
  }

  if (normalizedIdea.includes('app') || normalizedIdea.includes('software') || normalizedIdea.includes('tool')) {
    return 'software';
  }

  return null;
}

function mapPlatform(platform: ReturnType<typeof detectPlatform>): string | null {
  return platform === 'unknown' ? null : platform;
}
