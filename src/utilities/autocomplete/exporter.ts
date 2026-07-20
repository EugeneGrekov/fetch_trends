import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { normalizeQuery } from './normalize.js';
import type { PredictionRecord, ResumeState, RunReport, SeedSummary, UniquePrediction } from './types.js';

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
    writeTextFile(paths.csv, predictionRecordsToCsv(report.collectedPredictions)),
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

function predictionRecordsToCsv(predictions: PredictionRecord[]): string {
  return toCsv(
    [
      'original_seed',
      'prefix_sent',
      'exact_prediction',
      'source_mode',
      'modifier_used',
      'prediction_rank',
      'country',
      'language',
      'timestamp',
    ],
    predictions.map((prediction) => [
      prediction.originalSeed,
      prediction.prefixSent,
      prediction.exactPrediction,
      prediction.sourceMode,
      prediction.modifierUsed ?? '',
      String(prediction.predictionRank),
      prediction.country,
      prediction.language,
      prediction.timestamp,
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
      'organic_predictions_found',
      'relevant_predictions_found',
      'irrelevant_predictions_found',
      'repeated_predictions',
      'strongest_exact_suggestion',
      'no_signal',
      'error_count',
      'status',
    ],
    summaries.map((summary) => [
      summary.seed,
      String(summary.prefixesProcessed),
      String(summary.predictionsCollected),
      String(summary.uniquePredictionsCollected),
      String(summary.organicPredictionsFound),
      String(summary.relevantPredictionsFound),
      String(summary.irrelevantPredictionsFound),
      String(summary.repeatedPredictions),
      summary.strongestExactSuggestion ?? '',
      String(summary.noSignal),
      String(summary.errorCount),
      summary.status,
    ]),
  );
}

export function renderMarkdownReport(report: RunReport): string {
  const sections = buildReportSections(report.uniqueNormalizedPredictions);
  const lines = [
    '# Autocomplete Report',
    '',
    '## Input',
    `- Seeds: ${formatCodeList(report.inputSeeds)}`,
    `- Country: \`${report.runMetadata.country}\``,
    `- Language: \`${report.runMetadata.language}\``,
    `- Depth: \`${String(report.runMetadata.depth)}\``,
    `- Mode: \`${report.runMetadata.mode}\``,
    `- Include Digits: \`${report.runMetadata.includeDigits ? 'yes' : 'no'}\``,
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
    '| Seed | Prefixes Processed | Organic Predictions | Relevant | Irrelevant | Repeated | Strongest Exact Suggestion | No Signal | Errors | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |',
    ...report.perSeedSummaries.map((summary) => markdownTableRow([
      summary.seed,
      String(summary.prefixesProcessed),
      String(summary.organicPredictionsFound),
      String(summary.relevantPredictionsFound),
      String(summary.irrelevantPredictionsFound),
      String(summary.repeatedPredictions),
      summary.strongestExactSuggestion ?? '',
      summary.noSignal ? 'yes' : 'no',
      String(summary.errorCount),
      summary.status,
    ])),
  );

  appendPredictionSection(lines, 'Strong Organic Suggestions', sections.strongOrganic);
  appendPredictionSection(lines, 'Repeated Suggestions Across Seeds', sections.repeatedAcrossSeeds);
  appendPredictionSection(lines, 'Tool-Seeking Phrases', sections.toolSeeking);
  appendPredictionSection(lines, 'Informational And How-To Phrases', sections.informational);
  appendPredictionSection(lines, 'Gmail Workflow Phrases', sections.gmailWorkflow);
  appendPredictionSection(lines, 'Chrome Extension Phrases', sections.chromeExtension);
  appendPredictionSection(lines, 'Modifier-Only Suggestions', sections.modifierOnly);
  appendNoSignalSeedsSection(lines, report.perSeedSummaries);
  appendPredictionSection(lines, 'Rejected Noise', sections.rejectedNoise, true);
  appendRecommendedNextValidationPhrases(lines, sections.recommendedNextValidation);

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

function buildReportSections(predictions: UniquePrediction[]): {
  strongOrganic: UniquePrediction[];
  repeatedAcrossSeeds: UniquePrediction[];
  toolSeeking: UniquePrediction[];
  informational: UniquePrediction[];
  gmailWorkflow: UniquePrediction[];
  chromeExtension: UniquePrediction[];
  modifierOnly: UniquePrediction[];
  rejectedNoise: UniquePrediction[];
  recommendedNextValidation: UniquePrediction[];
} {
  const relevant = predictions.filter((prediction) => prediction.relevanceStatus === 'relevant');
  const byEvidence = (left: UniquePrediction, right: UniquePrediction) =>
    right.evidenceScore - left.evidenceScore || left.normalizedQuery.localeCompare(right.normalizedQuery);

  return {
    strongOrganic: relevant
      .filter((prediction) => prediction.sourceModes.includes('organic'))
      .sort(byEvidence)
      .slice(0, 25),
    repeatedAcrossSeeds: relevant
      .filter((prediction) => prediction.sourceSeedCount > 1)
      .sort(byEvidence)
      .slice(0, 25),
    toolSeeking: relevant
      .filter((prediction) => prediction.intent === 'tool-seeking')
      .sort(byEvidence)
      .slice(0, 25),
    informational: relevant
      .filter((prediction) => prediction.intent === 'informational')
      .sort(byEvidence)
      .slice(0, 25),
    gmailWorkflow: relevant
      .filter((prediction) => prediction.intent === 'workflow' && prediction.normalizedQuery.includes('gmail'))
      .sort(byEvidence)
      .slice(0, 25),
    chromeExtension: relevant
      .filter((prediction) => prediction.normalizedQuery.includes('chrome extension'))
      .sort(byEvidence)
      .slice(0, 25),
    modifierOnly: relevant
      .filter((prediction) => prediction.sourceMode === 'modifier')
      .sort(byEvidence)
      .slice(0, 25),
    rejectedNoise: predictions
      .filter((prediction) => prediction.relevanceStatus === 'rejected')
      .sort((left, right) => left.normalizedQuery.localeCompare(right.normalizedQuery))
      .slice(0, 50),
    recommendedNextValidation: relevant.sort(byEvidence).slice(0, 10),
  };
}

function appendPredictionSection(
  lines: string[],
  title: string,
  predictions: UniquePrediction[],
  includeRejectionReason = false,
): void {
  lines.push('', `## ${title}`);
  const headers = includeRejectionReason
    ? ['Exact Prediction', 'Intent', 'Evidence Score', 'Source Mode', 'Avg Rank', 'Source Seeds', 'Rejection Reasons']
    : ['Exact Prediction', 'Intent', 'Evidence Score', 'Source Mode', 'Avg Rank', 'Source Seeds', 'Next Step'];

  lines.push(markdownTableRow(headers));
  lines.push(markdownTableSeparator(headers.length));

  if (predictions.length === 0) {
    lines.push(markdownTableRow(['No suggestions', '-', '-', '-', '-', '-', '-']));
    return;
  }

  for (const prediction of predictions) {
    lines.push(markdownTableRow([
      prediction.exactPrediction,
      prediction.intent,
      String(prediction.evidenceScore),
      prediction.sourceMode,
      String(prediction.averageRank),
      formatListPreview(prediction.sourceSeeds),
      includeRejectionReason ? prediction.rejectionReasons.join(', ') : prediction.nextValidationStep,
    ]));
  }
}

function appendNoSignalSeedsSection(lines: string[], summaries: SeedSummary[]): void {
  lines.push('', '## No-Signal Seeds');
  lines.push('| Seed | Prefixes Processed | Relevant Predictions | Irrelevant Predictions |');
  lines.push('| --- | ---: | ---: | ---: |');

  const noSignalSeeds = summaries.filter((summary) => summary.noSignal);
  if (noSignalSeeds.length === 0) {
    lines.push('| No no-signal seeds | - | - | - |');
    return;
  }

  for (const summary of noSignalSeeds) {
    lines.push(markdownTableRow([
      summary.seed,
      String(summary.prefixesProcessed),
      String(summary.relevantPredictionsFound),
      String(summary.irrelevantPredictionsFound),
    ]));
  }
}

function appendRecommendedNextValidationPhrases(lines: string[], predictions: UniquePrediction[]): void {
  lines.push('', '## Recommended Next Validation Phrases');

  if (predictions.length === 0) {
    lines.push('- No relevant suggestions found.');
    return;
  }

  for (const prediction of predictions) {
    lines.push(`- ${prediction.exactPrediction}`);
  }
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

function markdownTableSeparator(columnCount: number): string {
  return `| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`;
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
