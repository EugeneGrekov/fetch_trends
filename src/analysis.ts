import { includesAny, normalizeQuery, startsWithAny } from './normalize.js';
import type { Intent, Platform, PredictionRecord, UniquePrediction } from './types.js';

const PURCHASE_TERMS = [
  'app',
  'tool',
  'software',
  'automatic',
  'automatically',
  'bluetooth',
  'no tap',
  'without opening app',
  'android',
  'iphone',
];

const COMPARISON_TERMS = ['best', 'alternative', 'vs', 'compare', 'review'];
const HOW_TO_STARTS = ['how to', 'can i', 'where', 'why', 'what is'];
const PROBLEM_TERMS = ['not working', 'forgot', 'lost', "can't find", 'cant find', 'issue', 'problem', 'failed'];
const LOW_INTENT_TERMS = ['free', 'settings', 'tutorial', 'apple maps settings', 'google maps settings'];
const AUTOMATION_TERMS = ['automatic', 'automatically', 'no tap', 'bluetooth'];
const PLATFORM_TERMS = ['android', 'iphone', 'ios', 'apple maps', 'google maps', 'carplay'];
const BUILT_IN_SETTINGS_TERMS = ['settings', 'apple maps settings', 'google maps settings', 'built in', 'built-in'];

export function classifyIntent(query: string): Intent {
  const normalized = normalizeQuery(query);

  if (isMainlyBuiltInOrLowIntent(normalized)) {
    return 'low intent';
  }

  if (startsWithAny(normalized, HOW_TO_STARTS)) {
    return 'how-to intent';
  }

  if (includesAny(normalized, PROBLEM_TERMS)) {
    return 'problem intent';
  }

  if (includesAny(normalized, COMPARISON_TERMS)) {
    return 'comparison intent';
  }

  if (includesAny(normalized, PURCHASE_TERMS)) {
    return 'high purchase intent';
  }

  return 'low intent';
}

export function detectPlatform(query: string): Platform {
  const normalized = normalizeQuery(query);

  if (normalized.includes('google maps android') || normalized.includes('android')) {
    return 'Android';
  }

  if (
    normalized.includes('iphone') ||
    normalized.includes('ios') ||
    normalized.includes('carplay')
  ) {
    return 'iPhone';
  }

  if (normalized.includes('google maps')) {
    return 'Google Maps';
  }

  if (normalized.includes('apple maps')) {
    return 'Apple Maps';
  }

  return 'unknown';
}

export function nextValidationStep(intent: Intent): string {
  switch (intent) {
    case 'high purchase intent':
      return 'check Keyword Planner and Google page 1 competitors';
    case 'how-to intent':
      return 'check if built-in or free solution solves it';
    case 'problem intent':
      return 'search Reddit and app reviews for complaints';
    case 'comparison intent':
      return 'analyze competitors and pricing';
    case 'low intent':
      return 'keep only if it reveals useful wording';
  }
}

export function scoreConfidence(query: string, sourceSeedCount: number, sourcePrefixCount: number): number {
  const normalized = normalizeQuery(query);
  const words = normalized.split(' ').filter(Boolean);
  let score = 0;

  if (words.length >= 4 && normalized.length >= 18) {
    score += 25;
  }

  if (includesAny(normalized, ['app', 'tool', 'software'])) {
    score += 20;
  }

  if (includesAny(normalized, AUTOMATION_TERMS)) {
    score += 20;
  }

  if (includesAny(normalized, PLATFORM_TERMS)) {
    score += 15;
  }

  if (includesAny(normalized, PROBLEM_TERMS)) {
    score += 15;
  }

  if (sourcePrefixCount > 1) {
    score += 10;
  }

  if (sourceSeedCount > 1) {
    score += 10;
  }

  if (isGeneric(normalized)) {
    score -= 20;
  }

  if (includesAny(normalized, BUILT_IN_SETTINGS_TERMS)) {
    score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

export function buildUniquePredictions(records: PredictionRecord[]): UniquePrediction[] {
  const groups = new Map<
    string,
    {
      query: string;
      normalizedQuery: string;
      timestamps: string[];
      sourceSeeds: Set<string>;
      sourcePrefixes: Set<string>;
      country: string;
      language: string;
    }
  >();

  for (const record of records) {
    const normalized = normalizeQuery(record.prediction);
    if (!normalized) {
      continue;
    }

    const existing = groups.get(normalized);
    if (existing) {
      existing.timestamps.push(record.timestamp);
      existing.sourceSeeds.add(record.originalSeed);
      existing.sourcePrefixes.add(record.sourcePrefix);
      continue;
    }

    groups.set(normalized, {
      query: record.prediction,
      normalizedQuery: normalized,
      timestamps: [record.timestamp],
      sourceSeeds: new Set([record.originalSeed]),
      sourcePrefixes: new Set([record.sourcePrefix]),
      country: record.country,
      language: record.language,
    });
  }

  return Array.from(groups.values())
    .map((group) => {
      const sourceSeeds = Array.from(group.sourceSeeds).sort((a, b) => a.localeCompare(b));
      const sourcePrefixes = Array.from(group.sourcePrefixes).sort((a, b) => a.localeCompare(b));
      const intent = classifyIntent(group.query);
      const sourceSeedCount = sourceSeeds.length;
      const sourcePrefixCount = sourcePrefixes.length;

      return {
        query: group.query,
        normalizedQuery: group.normalizedQuery,
        intent,
        confidenceScore: scoreConfidence(group.query, sourceSeedCount, sourcePrefixCount),
        platform: detectPlatform(group.query),
        sourceSeeds,
        sourceSeedCount,
        sourcePrefixes,
        sourcePrefixCount,
        country: group.country,
        language: group.language,
        timestamp: group.timestamps.sort()[0] ?? new Date().toISOString(),
        nextValidationStep: nextValidationStep(intent),
      };
    })
    .sort((a, b) => {
      if (b.confidenceScore !== a.confidenceScore) {
        return b.confidenceScore - a.confidenceScore;
      }

      return a.normalizedQuery.localeCompare(b.normalizedQuery);
    });
}

function isGeneric(normalized: string): boolean {
  const words = normalized.split(' ').filter(Boolean);
  return words.length <= 2 && !includesAny(normalized, [...PURCHASE_TERMS, ...PROBLEM_TERMS]);
}

function isMainlyBuiltInOrLowIntent(normalized: string): boolean {
  if (!includesAny(normalized, LOW_INTENT_TERMS)) {
    return false;
  }

  const hasStrongCommercialSignal = includesAny(normalized, ['app', 'tool', 'software', 'bluetooth', 'automatic', 'automatically']);
  const isSettingsQuery = includesAny(normalized, BUILT_IN_SETTINGS_TERMS);

  return isSettingsQuery || !hasStrongCommercialSignal;
}
