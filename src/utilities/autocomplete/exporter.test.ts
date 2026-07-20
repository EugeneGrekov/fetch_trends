import { describe, expect, it } from 'vitest';
import { getOutputPaths, renderMarkdownReport } from './exporter.js';
import type { RunReport, UniquePrediction } from './types.js';

describe('autocomplete exporter', () => {
  it('includes a markdown sidecar path next to the other outputs', () => {
    expect(getOutputPaths('./results/company.csv')).toEqual({
      csv: './results/company.csv',
      json: './results/company.json',
      md: './results/company.md',
      summaryCsv: './results/company.summary.csv',
      summaryJson: './results/company.summary.json',
      resume: './results/company.resume.json',
    });
  });

  it('renders discovery sections, seed metrics, and rejected noise', () => {
    const markdown = renderMarkdownReport(createReport());

    expect(markdown).toContain('# Autocomplete Report');
    expect(markdown).toContain('## Strong Organic Suggestions');
    expect(markdown).toContain('## Repeated Suggestions Across Seeds');
    expect(markdown).toContain('## Tool-Seeking Phrases');
    expect(markdown).toContain('## Informational And How-To Phrases');
    expect(markdown).toContain('## Gmail Workflow Phrases');
    expect(markdown).toContain('## Chrome Extension Phrases');
    expect(markdown).toContain('## Modifier-Only Suggestions');
    expect(markdown).toContain('## No-Signal Seeds');
    expect(markdown).toContain('## Rejected Noise');
    expect(markdown).toContain('## Recommended Next Validation Phrases');
    expect(markdown).toContain('| website owner email finder | tool-seeking | 90 | organic | 1.5 |');
    expect(markdown).toContain('| company email email website owner finder | irrelevant | 0 | modifier | 1 |');
    expect(markdown).toContain('| no signal seed | 1 | 0 | 1 |');
    expect(markdown.indexOf('website owner email finder')).toBeLessThan(markdown.indexOf('company email email website owner finder'));
  });
});

function createReport(): RunReport {
  return {
    runMetadata: {
      startedAt: '2026-07-10T12:00:00.000Z',
      completedAt: '2026-07-10T12:05:00.000Z',
      country: 'US',
      language: 'en',
      depth: 1,
      modifiers: ['gmail'],
      mode: 'modifier',
      includeDigits: false,
      delayMs: 1200,
      maxPrefixes: 10,
      maxDepth2Prefixes: 5,
      resume: true,
      outputPath: './results/company.csv',
    },
    inputSeeds: ['website owner email finder', 'find company email from website', 'no signal seed'],
    generatedPrefixes: [
      { seed: 'website owner email finder', prefix: 'website owner email finder a', depth: 1, sourceMode: 'organic' },
      {
        seed: 'website owner email finder',
        prefix: 'website owner email finder gmail',
        depth: 1,
        sourceMode: 'modifier',
        modifierUsed: 'gmail',
      },
    ],
    collectedPredictions: [
      {
        originalSeed: 'website owner email finder',
        sourcePrefix: 'website owner email finder a',
        prediction: 'website owner email finder',
        prefixSent: 'website owner email finder a',
        exactPrediction: 'website owner email finder',
        sourceMode: 'organic',
        predictionRank: 1,
        timestamp: '2026-07-10T12:01:00.000Z',
        country: 'US',
        language: 'en',
        depth: 1,
      },
    ],
    uniqueNormalizedPredictions: [
      uniquePrediction({
        exactPrediction: 'website owner email finder',
        intent: 'tool-seeking',
        evidenceScore: 90,
        averageRank: 1.5,
        sourceMode: 'organic',
        sourceModes: ['organic'],
        sourceSeeds: ['find company email from website', 'website owner email finder'],
        sourcePrefixes: ['find company email from website w', 'website owner email finder a'],
      }),
      uniquePrediction({
        exactPrediction: 'how to find company email from website',
        intent: 'informational',
        evidenceScore: 75,
        averageRank: 2,
        sourceMode: 'organic',
        sourceModes: ['organic'],
      }),
      uniquePrediction({
        exactPrediction: 'open gmail from website',
        intent: 'workflow',
        evidenceScore: 70,
        averageRank: 3,
        sourceMode: 'organic',
        sourceModes: ['organic'],
      }),
      uniquePrediction({
        exactPrediction: 'email finder chrome extension',
        intent: 'tool-seeking',
        evidenceScore: 65,
        averageRank: 4,
        sourceMode: 'modifier',
        sourceModes: ['modifier'],
        modifierUsed: 'chrome extension',
        modifierUsedValues: ['chrome extension'],
      }),
      uniquePrediction({
        exactPrediction: 'company email email website owner finder',
        intent: 'irrelevant',
        evidenceScore: 0,
        averageRank: 1,
        sourceMode: 'modifier',
        sourceModes: ['modifier'],
        relevanceStatus: 'rejected',
        rejectionReasons: ['awkward_generated_or_off_topic_phrase'],
      }),
    ],
    perSeedSummaries: [
      {
        seed: 'website owner email finder',
        prefixesProcessed: 1,
        predictionsCollected: 1,
        uniquePredictionsCollected: 1,
        organicPredictionsFound: 1,
        relevantPredictionsFound: 1,
        irrelevantPredictionsFound: 0,
        repeatedPredictions: 1,
        strongestExactSuggestion: 'website owner email finder',
        noSignal: false,
        errorCount: 0,
        status: 'completed',
      },
      {
        seed: 'no signal seed',
        prefixesProcessed: 1,
        predictionsCollected: 1,
        uniquePredictionsCollected: 1,
        organicPredictionsFound: 1,
        relevantPredictionsFound: 0,
        irrelevantPredictionsFound: 1,
        repeatedPredictions: 0,
        noSignal: true,
        errorCount: 0,
        status: 'completed',
      },
    ],
    errors: [
      {
        seed: 'website owner email finder',
        prefix: 'website owner email finder b',
        depth: 1,
        message: 'temporary collector failure',
        code: 'PREFIX_FAILED',
        timestamp: '2026-07-10T12:02:00.000Z',
      },
    ],
    finalSummary: {
      seedCount: 3,
      generatedPrefixCount: 2,
      completedPrefixCount: 2,
      predictionCount: 1,
      uniquePredictionCount: 5,
      errorCount: 1,
      stopped: false,
    },
  };
}

function uniquePrediction(overrides: Partial<UniquePrediction> & { exactPrediction: string }): UniquePrediction {
  const normalizedQuery = overrides.exactPrediction.toLowerCase().replace(/\s+/g, ' ');
  const evidenceScore = overrides.evidenceScore ?? 50;
  const intent = overrides.intent ?? 'tool-seeking';
  const sourceMode = overrides.sourceMode ?? 'organic';
  const sourceModes = overrides.sourceModes ?? [sourceMode];

  return {
    query: overrides.exactPrediction,
    exactPrediction: overrides.exactPrediction,
    normalizedQuery,
    intent,
    intentClassification: intent,
    confidenceScore: evidenceScore,
    evidenceScore,
    averageRank: overrides.averageRank ?? 1,
    sourceMode,
    sourceModes,
    modifierUsed: overrides.modifierUsed,
    modifierUsedValues: overrides.modifierUsedValues ?? [],
    relevanceStatus: overrides.relevanceStatus ?? 'relevant',
    relevanceGroups: overrides.relevanceGroups ?? ['website', 'contact', 'action_tool'],
    rejectionReasons: overrides.rejectionReasons ?? [],
    platform: 'unknown',
    sourceSeeds: overrides.sourceSeeds ?? ['website owner email finder'],
    sourceSeedCount: overrides.sourceSeeds?.length ?? 1,
    sourcePrefixes: overrides.sourcePrefixes ?? ['website owner email finder a'],
    sourcePrefixCount: overrides.sourcePrefixes?.length ?? 1,
    country: 'US',
    language: 'en',
    timestamp: '2026-07-10T12:01:00.000Z',
    nextValidationStep: 'review manually',
  };
}
