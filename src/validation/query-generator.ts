import { classifyIntent } from '../utilities/autocomplete/analysis.js';
import { normalizeQuery, uniqueNormalized } from '../utilities/autocomplete/normalize.js';
import type { NormalizedIdea } from './types.js';

export interface GeneratedValidationQuery {
  query: string;
  normalizedQuery: string;
  intentType: string;
  source: string;
  priorityScore: number;
}

export function generateInitialQueries(idea: NormalizedIdea): GeneratedValidationQuery[] {
  const compact = idea.keywordTokens.join(' ');
  const candidates = uniqueNormalized(
    [
      idea.cleanedIdea,
      compact.length >= 3 ? compact : undefined,
      compact.length >= 3 && !compact.includes('app') ? `${compact} app` : undefined,
      compact.length >= 3 && !compact.startsWith('how to') ? `how to ${compact}` : undefined,
    ].filter((value): value is string => Boolean(value)),
  );

  return candidates.map((query, index) => ({
    query,
    normalizedQuery: normalizeQuery(query),
    intentType: classifyIntent(query),
    source: index === 0 ? 'idea' : 'heuristic',
    priorityScore: Math.max(100 - index * 15, 40),
  }));
}
