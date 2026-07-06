import { describe, expect, it } from 'vitest';
import { buildUniquePredictions, classifyIntent, detectPlatform, scoreConfidence } from './analysis.js';
import { normalizeQuery } from './normalize.js';
import type { PredictionRecord } from './types.js';

describe('prediction analysis', () => {
  it('normalizes punctuation and spacing differences', () => {
    expect(normalizeQuery("Can't   find parked-car!!")).toBe('can t find parked car');
  });

  it('classifies intent and platform signals', () => {
    expect(classifyIntent('how to find my parked car')).toBe('how-to intent');
    expect(classifyIntent('find parked car app bluetooth android')).toBe('high purchase intent');
    expect(classifyIntent('find parked car not working')).toBe('problem intent');
    expect(classifyIntent('google maps settings parked car')).toBe('low intent');
    expect(detectPlatform('parking app for google maps android')).toBe('Android');
    expect(detectPlatform('apple maps parked car')).toBe('Apple Maps');
  });

  it('scores stronger signals higher than generic queries', () => {
    const strong = scoreConfidence('automatic bluetooth parking location app android', 2, 3);
    const generic = scoreConfidence('parked car', 1, 1);

    expect(strong).toBeGreaterThan(generic);
    expect(strong).toBe(100);
    expect(generic).toBe(0);
  });

  it('deduplicates predictions and preserves source seed/prefix counts', () => {
    const unique = buildUniquePredictions([
      predictionRecord('find my parked car app', 'find my parked car', 'find my parked car a'),
      predictionRecord('Find my parked car app!', 'automatic parking location app', 'automatic parking location app f'),
      predictionRecord('find my parked car bluetooth', 'find my parked car', 'find my parked car b'),
    ]);

    const appPrediction = unique.find((prediction) => prediction.normalizedQuery === 'find my parked car app');

    expect(appPrediction?.sourceSeedCount).toBe(2);
    expect(appPrediction?.sourcePrefixCount).toBe(2);
    expect(appPrediction?.sourceSeeds).toEqual(['automatic parking location app', 'find my parked car']);
  });
});

function predictionRecord(prediction: string, originalSeed: string, sourcePrefix: string): PredictionRecord {
  return {
    originalSeed,
    sourcePrefix,
    prediction,
    timestamp: '2026-07-06T00:00:00.000Z',
    country: 'US',
    language: 'en',
    depth: 1,
  };
}
