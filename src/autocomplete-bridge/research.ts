import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PlaywrightAutocompleteCollector } from '../utilities/autocomplete/collector.js';
import { getOutputPaths } from '../utilities/autocomplete/exporter.js';
import { runAutocompleteResearch } from '../utilities/autocomplete/runner.js';
import type { AutocompleteResearchRunner } from './types.js';

export function createAutocompleteResearchRunner(resultsDir: string): AutocompleteResearchRunner {
  return async (job) => {
    const outputPath = job.outputPath ?? join(resultsDir, `job-${job.id}.csv`);
    const modifiers = job.modifiers;
    const report = await runAutocompleteResearch(
      {
        seeds: job.seeds,
        country: 'US',
        language: 'en',
        depth: 1,
        out: outputPath,
        modifiers,
        mode: modifiers.length > 0 ? 'modifier' : 'organic',
        includeDigits: false,
        headless: true,
        delayMs: 1200,
        maxPrefixes: 500,
        maxDepth2Prefixes: 100,
        resume: true,
      },
      new PlaywrightAutocompleteCollector(true),
    );

    if (report.finalSummary.stopped) {
      throw new Error('Autocomplete collection stopped after Google showed a CAPTCHA or anti-bot page.');
    }

    if (report.finalSummary.predictionCount === 0 && report.finalSummary.errorCount > 0) {
      throw new Error(report.errors[0]?.message ?? 'Autocomplete collection failed without predictions.');
    }

    return {
      markdown: await readFile(getOutputPaths(outputPath).md, 'utf8'),
      outputPath,
    };
  };
}
