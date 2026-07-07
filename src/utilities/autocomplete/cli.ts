#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { PlaywrightAutocompleteCollector } from './collector.js';
import { loadSeeds, resolveModifiers } from './input.js';
import { runAutocompleteResearch } from './runner.js';
import type { CliOptions, ProgressUpdate, RunOptions } from './types.js';

const program = new Command();

program
  .name('fetch-trends-autocomplete')
  .description('Collect Google Autocomplete predictions for local keyword validation research.')
  .option('--seed <phrase>', 'seed phrase; can be passed multiple times', collectValues, [])
  .option('--seeds <path>', 'TXT/CSV seed file path, or - for stdin; can be passed multiple times', collectValues, [])
  .option('--country <country>', 'Google country code', 'US')
  .option('--language <language>', 'Google interface language', 'en')
  .option('--depth <depth>', 'collection depth: 1 or 2', parseDepth, 1)
  .requiredOption('--out <path>', 'output path for CSV/JSON reports')
  .option('--modifier <value>', 'custom modifier; can be passed multiple times', collectValues, [])
  .option('--modifiers <items-or-path>', 'comma-separated custom modifiers or a TXT file path', collectValues, [])
  .option('--headless <boolean>', 'run browser headless: true/false', parseBoolean, true)
  .option('--no-headless', 'run browser in visible/manual mode')
  .option('--delayMs <ms>', 'base random delay between prefixes', parseNonNegativeInteger, 1200)
  .option('--maxPrefixes <count>', 'maximum depth-1 prefixes per seed', parsePositiveInteger, 500)
  .option('--maxDepth2Prefixes <count>', 'maximum depth-2 prefixes per seed', parsePositiveInteger, 100)
  .option('--resume <boolean>', 'resume from the matching .resume.json file: true/false', parseBoolean, true)
  .option('--no-resume', 'disable resume mode')
  .action(async (rawOptions: CliOptions) => {
    try {
      const seeds = await loadSeeds(rawOptions.seed, rawOptions.seeds);

      if (seeds.length === 0) {
        throw new InvalidArgumentError('At least one --seed or --seeds input is required.');
      }

      const modifiers = await resolveModifiers(rawOptions.modifier, rawOptions.modifiers);
      const options: RunOptions = {
        seeds,
        country: rawOptions.country.toUpperCase(),
        language: rawOptions.language,
        depth: rawOptions.depth,
        out: rawOptions.out,
        modifiers,
        headless: rawOptions.headless,
        delayMs: rawOptions.delayMs,
        maxPrefixes: rawOptions.maxPrefixes,
        maxDepth2Prefixes: rawOptions.maxDepth2Prefixes,
        resume: rawOptions.resume,
      };
      const collector = new PlaywrightAutocompleteCollector(options.headless);
      const report = await runAutocompleteResearch(options, collector, createProgressLogger());

      process.stderr.write('\n');
      process.stderr.write(
        [
          `Completed ${report.finalSummary.completedPrefixCount}/${report.finalSummary.generatedPrefixCount} prefixes.`,
          `Collected ${report.finalSummary.predictionCount} predictions.`,
          `Unique normalized predictions: ${report.finalSummary.uniquePredictionCount}.`,
          report.finalSummary.errorCount > 0 ? `Errors: ${report.finalSummary.errorCount}.` : undefined,
          report.finalSummary.stopped ? 'Stopped early because Google showed a CAPTCHA or anti-bot page.' : undefined,
        ]
          .filter(Boolean)
          .join(' '),
      );
      process.stderr.write('\n');

      if (report.errors.length > 0) {
        const firstError = report.errors[0];
        process.stderr.write(`First error: ${firstError.message}\n`);
      }

      if (report.finalSummary.predictionCount === 0 && report.finalSummary.errorCount > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseDepth(value: string): 1 | 2 {
  const parsed = Number(value);
  if (parsed === 1 || parsed === 2) {
    return parsed;
  }

  throw new InvalidArgumentError('--depth must be 1 or 2.');
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  throw new InvalidArgumentError('Expected a boolean value: true or false.');
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a positive integer.');
}

function parseNonNegativeInteger(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a non-negative integer.');
}

function createProgressLogger(): (update: ProgressUpdate) => void {
  let lastLine = '';

  return (update) => {
    const line = [
      `Seed ${update.seedIndex}/${update.seedCount}: ${update.currentSeed}`,
      `prefixes ${update.prefixesProcessed}/${update.prefixesTotal}`,
      `predictions ${update.predictionsCollected}`,
      `unique ${update.uniquePredictionsCollected}`,
    ].join(' | ');

    if (process.stderr.isTTY) {
      process.stderr.write(`\r${line.padEnd(lastLine.length)}`);
      lastLine = line;
      return;
    }

    process.stderr.write(`${line}\n`);
  };
}
