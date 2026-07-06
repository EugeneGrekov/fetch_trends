import { ALPHABET } from './constants.js';
import { normalizeQuery, normalizeSpaces } from './normalize.js';
import type { GeneratedPrefix, PredictionRecord } from './types.js';

export function generateDepth1Prefixes(seed: string, modifiers: string[], maxPrefixes: number): GeneratedPrefix[] {
  const cleanedSeed = normalizeSpaces(seed);
  const prefixes = [
    cleanedSeed,
    ...ALPHABET.map((letter) => `${cleanedSeed} ${letter}`),
    ...modifiers.map((modifier) => `${modifier} ${cleanedSeed}`),
    ...modifiers.map((modifier) => `${cleanedSeed} ${modifier}`),
    `how to ${cleanedSeed}`,
    `best ${cleanedSeed}`,
    `${cleanedSeed} app`,
    `${cleanedSeed} android`,
    `${cleanedSeed} iphone`,
    `${cleanedSeed} automatically`,
    `${cleanedSeed} not working`,
  ];

  return uniquePrefixes(prefixes)
    .slice(0, maxPrefixes)
    .map((prefix) => ({
      seed: cleanedSeed,
      prefix,
      depth: 1,
    }));
}

export function generateDepth2Prefixes(
  seed: string,
  depth1Records: PredictionRecord[],
  maxDepth2Prefixes: number,
): GeneratedPrefix[] {
  const uniquePredictions = uniquePrefixes(
    depth1Records
      .filter((record) => record.originalSeed === seed && record.depth === 1)
      .map((record) => record.prediction),
  );

  const depth2Prefixes: GeneratedPrefix[] = [];

  for (const prediction of uniquePredictions) {
    for (const letter of ALPHABET) {
      depth2Prefixes.push({
        seed,
        prefix: `${prediction} ${letter}`,
        depth: 2,
        sourcePrediction: prediction,
      });

      if (depth2Prefixes.length >= maxDepth2Prefixes) {
        return depth2Prefixes;
      }
    }
  }

  return depth2Prefixes;
}

export function prefixKey(prefix: Pick<GeneratedPrefix, 'seed' | 'prefix' | 'depth'>): string {
  return `${normalizeQuery(prefix.seed)}\u0000${prefix.depth}\u0000${normalizeQuery(prefix.prefix)}`;
}

function uniquePrefixes(prefixes: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const prefix of prefixes) {
    const cleaned = normalizeSpaces(prefix);
    const key = normalizeQuery(cleaned);
    if (!cleaned || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(cleaned);
  }

  return output;
}
