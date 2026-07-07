import { describe, expect, it } from 'vitest';
import { generateDepth1Prefixes, generateDepth2Prefixes } from './expansion.js';
import type { PredictionRecord } from './types.js';

describe('query expansion', () => {
  it('generates depth-1 seed, alphabet, modifier, and intent prefixes', () => {
    const prefixes = generateDepth1Prefixes('find my parked car', ['automatic', 'app'], 100).map(
      (prefix) => prefix.prefix,
    );

    expect(prefixes).toContain('find my parked car');
    expect(prefixes).toContain('find my parked car a');
    expect(prefixes).toContain('automatic find my parked car');
    expect(prefixes).toContain('find my parked car automatic');
    expect(prefixes).toContain('how to find my parked car');
    expect(prefixes).toContain('best find my parked car');
    expect(prefixes).toContain('find my parked car not working');
  });

  it('respects the depth-1 prefix limit', () => {
    const prefixes = generateDepth1Prefixes('find my parked car', ['automatic'], 3);

    expect(prefixes).toHaveLength(3);
  });

  it('generates capped depth-2 prefixes from collected depth-1 predictions', () => {
    const records: PredictionRecord[] = [
      predictionRecord('find my parked car app'),
      predictionRecord('find my parked car app'),
      predictionRecord('find my parked car bluetooth'),
    ];

    const prefixes = generateDepth2Prefixes('find my parked car', records, 4).map((prefix) => prefix.prefix);

    expect(prefixes).toEqual([
      'find my parked car app a',
      'find my parked car app b',
      'find my parked car app c',
      'find my parked car app d',
    ]);
  });
});

function predictionRecord(prediction: string): PredictionRecord {
  return {
    originalSeed: 'find my parked car',
    sourcePrefix: 'find my parked car',
    prediction,
    timestamp: '2026-07-06T00:00:00.000Z',
    country: 'US',
    language: 'en',
    depth: 1,
  };
}
