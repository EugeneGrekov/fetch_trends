import { describe, expect, it } from 'vitest';
import { analyzeRelevance, buildUniquePredictions, classifyIntent } from './analysis.js';
import { normalizeQuery } from './normalize.js';
import type { PredictionRecord, SourceMode } from './types.js';

describe('prediction analysis', () => {
  it('normalizes punctuation and spacing differences', () => {
    expect(normalizeQuery("Can't   find parked-car!!")).toBe('can t find parked car');
  });

  it('classifies the new intent categories without purchase-intent shortcuts', () => {
    expect(classifyIntent('how to find company email from website')).toBe('informational');
    expect(classifyIntent('website owner email finder')).toBe('tool-seeking');
    expect(classifyIntent('open gmail from website')).toBe('workflow');
    expect(classifyIntent('email finder pricing')).toBe('commercial');
    expect(classifyIntent('chrome extensions management')).toBe('irrelevant');
  });

  it('accepts useful phrases that span at least two concept groups', () => {
    expect(analyzeRelevance(normalizeQuery('website owner email finder'))).toMatchObject({
      status: 'relevant',
      groups: ['website', 'contact', 'action_tool'],
    });
    expect(analyzeRelevance(normalizeQuery('open gmail from website'))).toMatchObject({
      status: 'relevant',
      groups: ['website', 'contact', 'action_tool'],
    });
  });

  it('rejects awkward generated or off-topic phrases without deleting them', () => {
    expect(analyzeRelevance(normalizeQuery('company email email website owner finder'))).toMatchObject({
      status: 'rejected',
      reasons: expect.arrayContaining(['awkward_generated_or_off_topic_phrase']),
    });
    expect(analyzeRelevance(normalizeQuery('chrome extensions management'))).toMatchObject({
      status: 'rejected',
      reasons: expect.arrayContaining(['fewer_than_two_relevant_concept_groups']),
    });
  });

  it('deduplicates predictions while preserving original Google text and metadata', () => {
    const unique = buildUniquePredictions([
      predictionRecord('website owner email finder', 'website owner email finder', 'website owner email finder a', 1, 'organic'),
      predictionRecord('Website owner email finder ', 'find company email from website', 'find company email from website w', 2, 'organic'),
      predictionRecord('company email email website owner finder', 'website owner email finder', 'website owner email finder gmail', 1, 'modifier', 'gmail'),
    ]);

    const relevant = unique.find((prediction) => prediction.normalizedQuery === 'website owner email finder');
    const rejected = unique.find((prediction) => prediction.normalizedQuery === 'company email email website owner finder');

    expect(relevant).toMatchObject({
      exactPrediction: 'website owner email finder',
      sourceSeedCount: 2,
      sourcePrefixCount: 2,
      averageRank: 1.5,
      sourceMode: 'organic',
      relevanceStatus: 'relevant',
    });
    expect(relevant?.evidenceScore).toBeGreaterThan(75);
    expect(rejected).toMatchObject({
      intent: 'irrelevant',
      evidenceScore: 0,
      relevanceStatus: 'rejected',
      modifierUsedValues: ['gmail'],
    });
  });
});

function predictionRecord(
  exactPrediction: string,
  originalSeed: string,
  prefixSent: string,
  predictionRank: number,
  sourceMode: SourceMode,
  modifierUsed?: string,
): PredictionRecord {
  return {
    originalSeed,
    sourcePrefix: prefixSent,
    prediction: exactPrediction,
    prefixSent,
    exactPrediction,
    sourceMode,
    modifierUsed,
    predictionRank,
    timestamp: '2026-07-06T00:00:00.000Z',
    country: 'US',
    language: 'en',
    depth: 1,
  };
}
