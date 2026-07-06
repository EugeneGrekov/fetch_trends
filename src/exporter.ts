import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { ResumeState, RunReport, SeedSummary, UniquePrediction } from './types.js';

export interface OutputPaths {
  csv: string;
  json: string;
  summaryCsv: string;
  summaryJson: string;
  resume: string;
}

export function getOutputPaths(outPath: string): OutputPaths {
  const extension = extname(outPath);
  const base = extension ? outPath.slice(0, -extension.length) : outPath;

  return {
    csv: `${base}.csv`,
    json: `${base}.json`,
    summaryCsv: `${base}.summary.csv`,
    summaryJson: `${base}.summary.json`,
    resume: `${base}.resume.json`,
  };
}

export async function ensureOutputDirectory(outPath: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
}

export async function writeFinalReport(report: RunReport, outPath: string): Promise<void> {
  const paths = getOutputPaths(outPath);
  await Promise.all([
    writeTextFile(paths.csv, uniquePredictionsToCsv(report.uniqueNormalizedPredictions)),
    writeJsonFile(paths.json, report),
    writeTextFile(paths.summaryCsv, seedSummariesToCsv(report.perSeedSummaries)),
    writeJsonFile(paths.summaryJson, {
      runMetadata: report.runMetadata,
      perSeedSummaries: report.perSeedSummaries,
      finalSummary: report.finalSummary,
      errors: report.errors,
    }),
  ]);
}

export async function saveResumeState(state: ResumeState, outPath: string): Promise<void> {
  const paths = getOutputPaths(outPath);
  await writeJsonFile(paths.resume, state);
}

export async function loadResumeState(outPath: string): Promise<ResumeState | undefined> {
  const paths = getOutputPaths(outPath);

  try {
    const raw = await readFile(paths.resume, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (isResumeState(parsed)) {
      return parsed;
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }

  return undefined;
}

function uniquePredictionsToCsv(predictions: UniquePrediction[]): string {
  return toCsv(
    [
      'query',
      'normalized_query',
      'intent',
      'confidence_score',
      'platform',
      'source_seeds',
      'source_seed_count',
      'source_prefixes',
      'source_prefix_count',
      'country',
      'language',
      'timestamp',
      'next_validation_step',
    ],
    predictions.map((prediction) => [
      prediction.query,
      prediction.normalizedQuery,
      prediction.intent,
      String(prediction.confidenceScore),
      prediction.platform,
      prediction.sourceSeeds.join(' | '),
      String(prediction.sourceSeedCount),
      prediction.sourcePrefixes.join(' | '),
      String(prediction.sourcePrefixCount),
      prediction.country,
      prediction.language,
      prediction.timestamp,
      prediction.nextValidationStep,
    ]),
  );
}

function seedSummariesToCsv(summaries: SeedSummary[]): string {
  return toCsv(
    [
      'seed',
      'prefixes_processed',
      'predictions_collected',
      'unique_predictions_collected',
      'error_count',
      'status',
    ],
    summaries.map((summary) => [
      summary.seed,
      String(summary.prefixesProcessed),
      String(summary.predictionsCollected),
      String(summary.uniquePredictionsCollected),
      String(summary.errorCount),
      summary.status,
    ]),
  );
}

function toCsv(headers: string[], rows: string[][]): string {
  return [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ].join('\n').concat('\n');
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await writeTextFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeTextFile(path: string, data: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = join(dirname(path), `.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  await writeFile(tempPath, data, 'utf8');
  await rename(tempPath, path);
}

function isResumeState(value: unknown): value is ResumeState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ResumeState>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.inputSeeds) &&
    Array.isArray(candidate.completedPrefixes) &&
    Array.isArray(candidate.generatedPrefixes) &&
    Array.isArray(candidate.collectedPredictions) &&
    Array.isArray(candidate.perSeedSummaries) &&
    Array.isArray(candidate.errors)
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
