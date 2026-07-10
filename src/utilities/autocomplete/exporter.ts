import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { normalizeQuery } from './normalize.js';
import type { ResumeState, RunReport, SeedSummary, UniquePrediction } from './types.js';

export interface OutputPaths {
  csv: string;
  json: string;
  md: string;
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
    md: `${base}.md`,
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
    writeTextFile(paths.md, renderMarkdownReport(report)),
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

export function renderMarkdownReport(report: RunReport): string {
  const topPredictions = selectTopPredictionsForMarkdown(report);
  const lines = [
    '# Autocomplete Report',
    '',
    '## Input',
    `- Seeds: ${formatCodeList(report.inputSeeds)}`,
    `- Country: \`${report.runMetadata.country}\``,
    `- Language: \`${report.runMetadata.language}\``,
    `- Depth: \`${String(report.runMetadata.depth)}\``,
    ...(report.runMetadata.modifiers && report.runMetadata.modifiers.length > 0
      ? [`- Modifiers: ${formatCodeList(report.runMetadata.modifiers)}`]
      : []),
    `- Delay: \`${report.runMetadata.delayMs} ms\``,
    `- Max Depth-1 Prefixes: \`${report.runMetadata.maxPrefixes}\``,
    `- Max Depth-2 Prefixes: \`${report.runMetadata.maxDepth2Prefixes}\``,
    `- Resume Enabled: \`${report.runMetadata.resume ? 'yes' : 'no'}\``,
    `- Output Path: \`${escapeInlineCode(report.runMetadata.outputPath)}\``,
    `- Started At: \`${report.runMetadata.startedAt}\``,
    `- Completed At: \`${report.runMetadata.completedAt ?? 'not completed'}\``,
  ];

  lines.push(
    '',
    '## Output Summary',
    `- Seed Count: \`${report.finalSummary.seedCount}\``,
    `- Generated Prefixes: \`${report.finalSummary.generatedPrefixCount}\``,
    `- Completed Prefixes: \`${report.finalSummary.completedPrefixCount}\``,
    `- Collected Predictions: \`${report.finalSummary.predictionCount}\``,
    `- Unique Predictions: \`${report.finalSummary.uniquePredictionCount}\``,
    `- Errors: \`${report.finalSummary.errorCount}\``,
    `- Stopped Early: \`${report.finalSummary.stopped ? 'yes' : 'no'}\``,
    '',
    '## Per-Seed Summary',
    '| Seed | Prefixes Processed | Predictions Collected | Unique Predictions | Errors | Status |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    ...report.perSeedSummaries.map((summary) => markdownTableRow([
      summary.seed,
      String(summary.prefixesProcessed),
      String(summary.predictionsCollected),
      String(summary.uniquePredictionsCollected),
      String(summary.errorCount),
      summary.status,
    ])),
    '',
    '## Top Unique Predictions',
    '| Query | Intent | Confidence | Platform | Source Seeds | Source Prefixes | Next Validation Step |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
    ...(topPredictions.length > 0
      ? topPredictions.map((prediction) => markdownTableRow([
          prediction.query,
          prediction.intent,
          String(prediction.confidenceScore),
          prediction.platform,
          formatListPreview(prediction.sourceSeeds),
          formatListPreview(prediction.sourcePrefixes),
          prediction.nextValidationStep,
        ]))
      : [markdownTableRow(['No unique predictions collected', '-', '-', '-', '-', '-', '-'])]),
  );

  if (report.errors.length > 0) {
    lines.push(
      '',
      '## Errors',
      '| Timestamp | Seed | Prefix | Depth | Code | Message |',
      '| --- | --- | --- | ---: | --- | --- |',
      ...report.errors.map((error) => markdownTableRow([
        error.timestamp,
        error.seed ?? '',
        error.prefix ?? '',
        error.depth ? String(error.depth) : '',
        error.code ?? '',
        error.message,
      ])),
    );
  }

  return `${lines.join('\n')}\n`;
}

function selectTopPredictionsForMarkdown(report: RunReport, limit = 25): UniquePrediction[] {
  const seedTerms = buildSeedTerms(report.inputSeeds);

  return report.uniqueNormalizedPredictions
    .map((prediction, index) => ({
      prediction,
      index,
      relevanceScore: scorePredictionRelevance(prediction.normalizedQuery, seedTerms),
    }))
    .sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }

      if (b.prediction.confidenceScore !== a.prediction.confidenceScore) {
        return b.prediction.confidenceScore - a.prediction.confidenceScore;
      }

      return a.index - b.index;
    })
    .slice(0, limit)
    .map((ranked) => ranked.prediction);
}

function buildSeedTerms(seeds: string[]): Set<string> {
  const terms = new Set<string>();

  for (const seed of seeds) {
    for (const term of normalizeQuery(seed).split(' ')) {
      if (term.length < 4 || IGNORED_RELEVANCE_TERMS.has(term)) {
        continue;
      }

      terms.add(term);
    }
  }

  return terms;
}

const IGNORED_RELEVANCE_TERMS = new Set([
  'find',
  'from',
  'with',
  'that',
  'this',
  'into',
  'open',
  'best',
  'free',
]);

function scorePredictionRelevance(normalizedQuery: string, seedTerms: Set<string>): number {
  let score = 0;

  for (const term of seedTerms) {
    if (normalizedQuery.includes(term)) {
      score += 1;
    }
  }

  return score;
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

function formatCodeList(values: string[]): string {
  if (values.length === 0) {
    return '_none_';
  }

  return values.map((value) => `\`${escapeInlineCode(value)}\``).join(', ');
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, '\\`');
}

function markdownTableRow(cells: string[]): string {
  return `| ${cells.map(escapeMarkdownTableCell).join(' | ')} |`;
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function formatListPreview(values: string[], limit = 3): string {
  if (values.length <= limit) {
    return values.join(', ');
  }

  return `${values.slice(0, limit).join(', ')} (+${values.length - limit} more)`;
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
