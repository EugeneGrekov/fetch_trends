import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { runAutocompleteResearch } from './runner.js';
import type { AutocompleteCollector, CollectContext, RunOptions } from './types.js';

const tempDirs: string[] = [];

describe('autocomplete runner', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('runs depth-2 collection with a fake collector and writes all reports', async () => {
    const dir = await createTempDir();
    const out = join(dir, 'parking.csv');
    const collector = new FakeCollector();

    const report = await runAutocompleteResearch(
      options({
        out,
        depth: 2,
        maxPrefixes: 2,
        maxDepth2Prefixes: 3,
      }),
      collector,
    );

    expect(report.finalSummary.seedCount).toBe(1);
    expect(report.finalSummary.generatedPrefixCount).toBe(5);
    expect(report.finalSummary.completedPrefixCount).toBe(5);
    expect(report.finalSummary.uniquePredictionCount).toBeGreaterThan(0);
    expect(collector.calls).toHaveLength(5);

    const csv = await readFile(out, 'utf8');
    const json = JSON.parse(await readFile(join(dir, 'parking.json'), 'utf8')) as { finalSummary: { seedCount: number } };
    const summaryCsv = await readFile(join(dir, 'parking.summary.csv'), 'utf8');
    const resume = JSON.parse(await readFile(join(dir, 'parking.resume.json'), 'utf8')) as { completedPrefixes: unknown[] };

    expect(csv).toContain('query,normalized_query,intent,confidence_score');
    expect(json.finalSummary.seedCount).toBe(1);
    expect(summaryCsv).toContain('seed,prefixes_processed,predictions_collected');
    expect(resume.completedPrefixes).toHaveLength(5);
  });

  it('resumes by skipping already completed prefixes', async () => {
    const dir = await createTempDir();
    const out = join(dir, 'parking.csv');
    const firstCollector = new FakeCollector();
    await runAutocompleteResearch(options({ out, maxPrefixes: 1 }), firstCollector);
    expect(firstCollector.calls).toHaveLength(1);

    const secondCollector = new FakeCollector();
    const report = await runAutocompleteResearch(options({ out, maxPrefixes: 2 }), secondCollector);

    expect(secondCollector.calls).toEqual(['find my parked car a']);
    expect(report.finalSummary.completedPrefixCount).toBe(2);
  });

  it('ignores resume data when the seed set changes', async () => {
    const dir = await createTempDir();
    const out = join(dir, 'parking.csv');
    await runAutocompleteResearch(options({ out, maxPrefixes: 1 }), new FakeCollector());

    const collector = new FakeCollector();
    const report = await runAutocompleteResearch(
      options({
        out,
        seeds: ['parking reminder app'],
        maxPrefixes: 1,
      }),
      collector,
    );

    expect(collector.calls).toEqual(['parking reminder app']);
    expect(report.inputSeeds).toEqual(['parking reminder app']);
    expect(report.finalSummary.completedPrefixCount).toBe(1);
  });

  it('retries failed prefixes when resuming after a transient collector error', async () => {
    const dir = await createTempDir();
    const out = join(dir, 'parking.csv');

    const firstCollector = new FlakyCollector(true);
    const firstReport = await runAutocompleteResearch(options({ out, maxPrefixes: 1 }), firstCollector);

    expect(firstCollector.calls).toEqual(['find my parked car']);
    expect(firstReport.finalSummary.completedPrefixCount).toBe(0);
    expect(firstReport.finalSummary.errorCount).toBe(1);

    const secondCollector = new FlakyCollector(false);
    const secondReport = await runAutocompleteResearch(options({ out, maxPrefixes: 1 }), secondCollector);

    expect(secondCollector.calls).toEqual(['find my parked car']);
    expect(secondReport.finalSummary.completedPrefixCount).toBe(1);
    expect(secondReport.finalSummary.errorCount).toBe(0);
    expect(secondReport.finalSummary.predictionCount).toBeGreaterThan(0);
  });
});

class FakeCollector implements AutocompleteCollector {
  calls: string[] = [];

  async collect(prefix: string, _context: CollectContext): Promise<string[]> {
    this.calls.push(prefix);
    return [
      `${prefix} app`,
      `${prefix} bluetooth android`,
      'find my parked car app',
    ];
  }

  async close(): Promise<void> {
    return undefined;
  }
}

class FlakyCollector implements AutocompleteCollector {
  calls: string[] = [];

  constructor(private readonly fail: boolean) {}

  async collect(prefix: string, _context: CollectContext): Promise<string[]> {
    this.calls.push(prefix);

    if (this.fail) {
      throw new Error('browserType.launch: Executable does not exist');
    }

    return [`${prefix} app`, `${prefix} chrome extension`];
  }

  async close(): Promise<void> {
    return undefined;
  }
}

function options(overrides: Partial<RunOptions>): RunOptions {
  return {
    seeds: ['find my parked car'],
    country: 'US',
    language: 'en',
    depth: 1,
    out: './results/test.csv',
    modifiers: ['automatic', 'app'],
    headless: true,
    delayMs: 0,
    maxPrefixes: 3,
    maxDepth2Prefixes: 5,
    resume: true,
    ...overrides,
  };
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-'));
  tempDirs.push(dir);
  return dir;
}
