#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { DEFAULT_MODIFIERS } from '../utilities/autocomplete/constants.js';
import { resolveModifiers } from '../utilities/autocomplete/input.js';
import { runValidationJob } from '../validation/orchestrator.js';

const program = new Command();

program
  .name('fetch-trends-validate')
  .description('Run the first local validation pipeline and persist evidence to SQLite.')
  .requiredOption('--idea <text>', 'idea description to validate')
  .option('--ai <boolean>', 'enable AI normalization and report drafting: true/false', parseBoolean, true)
  .option('--ai-model <model>', 'Codex model override for AI tasks')
  .option('--ai-reasoning <effort>', 'Codex reasoning effort override for AI tasks')
  .option('--keep-ai-artifacts <boolean>', 'keep AI input/prompt/output artifacts on disk: true/false', parseBoolean, true)
  .option('--db <path>', 'SQLite database path')
  .option('--outDir <path>', 'directory for autocomplete artifacts', './results/validate')
  .option('--country <country>', 'Google country code', 'US')
  .option('--language <language>', 'Google interface language', 'en')
  .option('--depth <depth>', 'collection depth: 1 or 2', parseDepth, 1)
  .option('--modifier <value>', 'custom modifier; can be passed multiple times', collectValues, [])
  .option('--modifiers <items-or-path>', 'comma-separated custom modifiers or a TXT file path', collectValues, [])
  .option('--headless <boolean>', 'run browser headless: true/false', parseBoolean, true)
  .option('--no-headless', 'run browser in visible/manual mode')
  .option('--delayMs <ms>', 'base random delay between prefixes', parseNonNegativeInteger, 1200)
  .option('--maxPrefixes <count>', 'maximum depth-1 prefixes per seed', parsePositiveInteger, 500)
  .option('--maxDepth2Prefixes <count>', 'maximum depth-2 prefixes per seed', parsePositiveInteger, 100)
  .action(async (rawOptions: {
    ai: boolean;
    aiModel?: string;
    aiReasoning?: string;
    idea: string;
    db?: string;
    outDir: string;
    country: string;
    language: string;
    depth: 1 | 2;
    modifier: string[];
    modifiers: string[];
    headless: boolean;
    delayMs: number;
    keepAiArtifacts: boolean;
    maxPrefixes: number;
    maxDepth2Prefixes: number;
  }) => {
    try {
      const modifiers = rawOptions.modifier.length === 0 && rawOptions.modifiers.length === 0
        ? [...DEFAULT_MODIFIERS]
        : await resolveModifiers(rawOptions.modifier, rawOptions.modifiers);

      const result = await runValidationJob({
        ai: rawOptions.ai,
        aiModel: rawOptions.aiModel,
        aiReasoning: rawOptions.aiReasoning,
        idea: rawOptions.idea,
        dbPath: rawOptions.db,
        outDir: rawOptions.outDir,
        country: rawOptions.country,
        language: rawOptions.language,
        depth: rawOptions.depth,
        modifiers,
        headless: rawOptions.headless,
        delayMs: rawOptions.delayMs,
        keepAiArtifacts: rawOptions.keepAiArtifacts,
        maxPrefixes: rawOptions.maxPrefixes,
        maxDepth2Prefixes: rawOptions.maxDepth2Prefixes,
      });

      process.stdout.write(`Validation job ${result.job.id} completed.\n`);
      process.stdout.write(`Database: ${result.dbPath}\n`);
      process.stdout.write(`Autocomplete artifacts: ${result.outputPath}\n`);
      process.stdout.write(`Score: ${result.score.total_score} (${result.score.decision})\n`);
      process.stdout.write(`Stored report ${result.report.id} for idea ${result.idea.id}.\n`);
      process.stdout.write(`AI used: ${result.ai.used ? 'yes' : 'no'}\n`);

      for (const warning of result.ai.warnings) {
        process.stderr.write(`Warning: ${warning}\n`);
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
