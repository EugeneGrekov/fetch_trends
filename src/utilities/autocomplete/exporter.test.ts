import { describe, expect, it } from 'vitest';
import { getOutputPaths, renderMarkdownReport } from './exporter.js';
import type { RunReport } from './types.js';

describe('autocomplete exporter', () => {
  it('includes a markdown sidecar path next to the other outputs', () => {
    expect(getOutputPaths('./results/parking.csv')).toEqual({
      csv: './results/parking.csv',
      json: './results/parking.json',
      md: './results/parking.md',
      summaryCsv: './results/parking.summary.csv',
      summaryJson: './results/parking.summary.json',
      resume: './results/parking.resume.json',
    });
  });

  it('renders a compact markdown report with input, summaries, predictions, and errors', () => {
    const markdown = renderMarkdownReport(createReport());

    expect(markdown).toContain('# Autocomplete Report');
    expect(markdown).toContain('## Input');
    expect(markdown).toContain('`find my parked car`');
    expect(markdown).toContain('- Modifiers: `automatic`, `app`');
    expect(markdown).toContain('## Output Summary');
    expect(markdown).toContain('## Per-Seed Summary');
    expect(markdown).toContain('## Top Unique Predictions');
    expect(markdown).toContain('find my parked car app');
    expect(markdown).toContain('## Errors');
    expect(markdown).toContain('temporary collector failure');
    expect(markdown).toContain('| find my parked car | 1 | 1 | 1 | 1 | failed |');
    expect(markdown).toContain('| find my parked car app | high purchase intent | 85 | unknown |');
    expect(markdown).toContain('| 2026-07-10T12:02:00.000Z | find my parked car | find my parked car b | 1 | PREFIX_FAILED | temporary collector failure |');
    expect(markdown.indexOf('find my parked car app')).toBeLessThan(markdown.indexOf('apple maps vs google maps'));
  });
});

function createReport(): RunReport {
  return {
    runMetadata: {
      startedAt: '2026-07-10T12:00:00.000Z',
      completedAt: '2026-07-10T12:05:00.000Z',
      country: 'US',
      language: 'en',
      depth: 2,
      modifiers: ['automatic', 'app'],
      delayMs: 1200,
      maxPrefixes: 10,
      maxDepth2Prefixes: 5,
      resume: true,
      outputPath: './results/parking.csv',
    },
    inputSeeds: ['find my parked car'],
    generatedPrefixes: [
      { seed: 'find my parked car', prefix: 'find my parked car a', depth: 1 },
    ],
    collectedPredictions: [
      {
        originalSeed: 'find my parked car',
        sourcePrefix: 'find my parked car a',
        prediction: 'find my parked car app',
        timestamp: '2026-07-10T12:01:00.000Z',
        country: 'US',
        language: 'en',
        depth: 1,
      },
    ],
    uniqueNormalizedPredictions: [
      {
        query: 'apple maps vs google maps',
        normalizedQuery: 'apple maps vs google maps',
        intent: 'comparison intent',
        confidenceScore: 100,
        platform: 'Google Maps',
        sourceSeeds: ['find my parked car'],
        sourceSeedCount: 1,
        sourcePrefixes: ['Google Maps find my parked car'],
        sourcePrefixCount: 1,
        country: 'US',
        language: 'en',
        timestamp: '2026-07-10T12:01:00.000Z',
        nextValidationStep: 'analyze competitors and pricing',
      },
      {
        query: 'find my parked car app',
        normalizedQuery: 'find my parked car app',
        intent: 'high purchase intent',
        confidenceScore: 85,
        platform: 'unknown',
        sourceSeeds: ['find my parked car'],
        sourceSeedCount: 1,
        sourcePrefixes: ['find my parked car a'],
        sourcePrefixCount: 1,
        country: 'US',
        language: 'en',
        timestamp: '2026-07-10T12:01:00.000Z',
        nextValidationStep: 'check Keyword Planner and Google page 1 competitors',
      },
    ],
    perSeedSummaries: [
      {
        seed: 'find my parked car',
        prefixesProcessed: 1,
        predictionsCollected: 1,
        uniquePredictionsCollected: 1,
        errorCount: 1,
        status: 'failed',
      },
    ],
    errors: [
      {
        seed: 'find my parked car',
        prefix: 'find my parked car b',
        depth: 1,
        message: 'temporary collector failure',
        code: 'PREFIX_FAILED',
        timestamp: '2026-07-10T12:02:00.000Z',
      },
    ],
    finalSummary: {
      seedCount: 1,
      generatedPrefixCount: 1,
      completedPrefixCount: 1,
      predictionCount: 1,
      uniquePredictionCount: 2,
      errorCount: 1,
      stopped: false,
    },
  };
}
