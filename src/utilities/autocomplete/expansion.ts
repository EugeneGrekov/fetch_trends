import { ALPHABET } from './constants.js';
import { normalizeQuery, normalizeSpaces } from './normalize.js';
import type { GeneratedPrefix, PredictionRecord, RunMode } from './types.js';

export function generateDepth1Prefixes(
  seed: string,
  modifiers: string[],
  maxPrefixes: number,
  options: { mode?: RunMode; includeDigits?: boolean } = {},
): GeneratedPrefix[] {
  const cleanedSeed = normalizeSpaces(seed);
  const mode = options.mode ?? 'modifier';
  const prefixes = mode === 'organic'
    ? generateOrganicPrefixes(cleanedSeed, Boolean(options.includeDigits))
    : generateModifierPrefixes(cleanedSeed, modifiers);

  return uniquePrefixes(prefixes)
    .slice(0, maxPrefixes)
    .map((prefix) => {
      const modifierUsed = mode === 'modifier' ? findModifierForPrefix(prefix, cleanedSeed, modifiers) : undefined;

      return {
      seed: cleanedSeed,
      prefix,
      depth: 1,
      sourceMode: mode,
      modifierUsed,
      };
    });
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
        sourceMode: 'organic',
        sourcePrediction: prediction,
      });

      if (depth2Prefixes.length >= maxDepth2Prefixes) {
        return depth2Prefixes;
      }
    }
  }

  return depth2Prefixes;
}

function generateOrganicPrefixes(seed: string, includeDigits: boolean): string[] {
  const suffixes = includeDigits ? [...ALPHABET, ...'0123456789'.split('')] : ALPHABET;

  return [
    seed,
    ...suffixes.map((suffix) => `${seed} ${suffix}`),
  ];
}

function generateModifierPrefixes(seed: string, modifiers: string[]): string[] {
  return [
    ...modifiers.map((modifier) => `${modifier} ${seed}`),
    ...modifiers.map((modifier) => `${seed} ${modifier}`),
  ];
}

function findModifierForPrefix(prefix: string, seed: string, modifiers: string[]): string | undefined {
  const normalizedPrefix = normalizeQuery(prefix);
  const normalizedSeed = normalizeQuery(seed);

  return modifiers.find((modifier) => {
    const normalizedModifier = normalizeQuery(modifier);
    return (
      normalizedPrefix === normalizeQuery(`${modifier} ${seed}`) ||
      normalizedPrefix === normalizeQuery(`${seed} ${modifier}`) ||
      (normalizedModifier && normalizedPrefix.replace(normalizedSeed, '').trim() === normalizedModifier)
    );
  });
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
