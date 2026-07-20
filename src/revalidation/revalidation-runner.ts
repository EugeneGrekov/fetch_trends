import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createAutocompletePredictions, listAutocompletePredictionsByIdea } from '../db/repositories/autocomplete-predictions.js';
import { createCompetitors } from '../db/repositories/competitors.js';
import { createEvidence } from '../db/repositories/evidence.js';
import { getIdeaById } from '../db/repositories/ideas.js';
import { listQueriesByIdea } from '../db/repositories/queries.js';
import {
  blockRevalidationQueueItem,
  completeRevalidationQueueItem,
  completeRevalidationRun,
  createRevalidationRun,
  failRevalidationQueueItem,
  failRevalidationRun,
  listPendingRevalidationQueue,
  skipRevalidationQueueItem,
  startRevalidationQueueItem,
} from '../db/repositories/revalidation.js';
import { createReport } from '../db/repositories/reports.js';
import { createScore, listScoresByIdea } from '../db/repositories/scores.js';
import { createSources } from '../db/repositories/sources.js';
import type { CompetitorRow, IdeaRow, QueryRow, RevalidationQueueRow, ScoreRow, SourceRow } from '../db/schema.js';
import { buildUniquePredictions, classifyIntent, scoreConfidence } from '../utilities/autocomplete/analysis.js';
import { PlaywrightAutocompleteCollector } from '../utilities/autocomplete/collector.js';
import { DEFAULT_MODIFIERS } from '../utilities/autocomplete/constants.js';
import { normalizeQuery } from '../utilities/autocomplete/normalize.js';
import { runAutocompleteResearch } from '../utilities/autocomplete/runner.js';
import type { AutocompleteCollector, PredictionRecord, RunOptions, UniquePrediction } from '../utilities/autocomplete/types.js';
import { extractEvidenceFromSource } from '../validation/complaint-extractor.js';
import { buildDeterministicEvidenceSummary } from '../validation/report-generator.js';
import { buildSearchLanguageScore } from '../validation/scoring.js';
import { buildRevalidationReport } from './revalidation-report.js';
import { loadIdeaEvidenceSnapshot } from './scheduler.js';
import { evaluateIdeaStaleness } from './stale-evidence.js';
import type {
  RevalidationExecutionOptions,
  RevalidationRunResult,
  RevalidationServiceInput,
  RevalidationServiceResult,
  RevalidationServices,
  RevalidationTaskExecutionSummary,
  RevalidationTaskService,
} from './types.js';

export interface DefaultAutocompleteRevalidationOptions {
  createCollector?: (headless: boolean) => AutocompleteCollector;
  delayMs?: number;
  depth?: 1 | 2;
  headless?: boolean;
  maxDepth2Prefixes?: number;
  maxPrefixes?: number;
  modifiers?: string[];
  outDir?: string;
}

const DEFAULT_REVALIDATION_OUT_DIR = './results/revalidate';
const DEFAULT_COUNTRY = 'US';
const DEFAULT_LANGUAGE = 'en';

export async function runPendingRevalidation(
  db: DatabaseSync,
  options: RevalidationExecutionOptions = {},
): Promise<RevalidationRunResult> {
  const startedAt = options.now ?? new Date().toISOString();
  const run = createRevalidationRun(db, {
    ideaId: options.ideaId ?? null,
    mode: 'run_pending',
    status: 'running',
    startedAt,
  });
  const pending = listPendingRevalidationQueue(db, {
    ideaId: options.ideaId,
    limit: options.limit ?? 25,
  });
  const processed: RevalidationQueueRow[] = [];
  const summaries: RevalidationTaskExecutionSummary[] = [];
  const reports: RevalidationRunResult['reports'] = [];

  try {
    for (const item of pending) {
      const runningItem = startRevalidationQueueItem(db, item.id, run.id, new Date().toISOString());
      const summary = await executeQueueItem(db, runningItem, {
        country: options.country ?? DEFAULT_COUNTRY,
        language: options.language ?? DEFAULT_LANGUAGE,
        now: options.now ?? new Date().toISOString(),
        services: options.services ?? {},
        summaries,
      });
      summaries.push(summary);

      const completedAt = new Date().toISOString();
      if (summary.status === 'completed') {
        processed.push(completeRevalidationQueueItem(db, runningItem.id, completedAt));
      } else if (summary.status === 'blocked') {
        processed.push(blockRevalidationQueueItem(db, runningItem.id, summary.message ?? 'Task blocked.', completedAt));
      } else if (summary.status === 'skipped') {
        processed.push(skipRevalidationQueueItem(db, runningItem.id, summary.message ?? 'Task skipped.', completedAt));
      } else {
        processed.push(failRevalidationQueueItem(db, runningItem.id, summary.message ?? 'Task failed.', completedAt));
      }

      const reportId = summary.metadata?.reportId;
      if (typeof reportId === 'number') {
        const latestReport = loadIdeaEvidenceSnapshot(db, getIdeaById(db, runningItem.idea_id)).reports
          .find((report) => report.id === reportId);
        if (latestReport) {
          reports.push(latestReport);
        }
      }
    }

    const completedRun = completeRevalidationRun(
      db,
      run.id,
      JSON.stringify({
        processedCount: processed.length,
        statusCounts: countStatuses(summaries),
      }, null, 2),
      new Date().toISOString(),
    );

    return {
      processed,
      reports,
      run: completedRun,
      summaries,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedRun = failRevalidationRun(
      db,
      run.id,
      message,
      JSON.stringify({
        processedCount: processed.length,
        statusCounts: countStatuses(summaries),
      }, null, 2),
      new Date().toISOString(),
    );

    return {
      processed,
      reports,
      run: failedRun,
      summaries,
    };
  }
}

export function createDefaultRevalidationServices(
  options: DefaultAutocompleteRevalidationOptions = {},
): RevalidationServices {
  return {
    autocomplete: new LocalAutocompleteRevalidationService(options),
  };
}

class LocalAutocompleteRevalidationService implements RevalidationTaskService {
  constructor(private readonly options: DefaultAutocompleteRevalidationOptions) {}

  async refresh(input: RevalidationServiceInput): Promise<RevalidationServiceResult> {
    const seeds = selectAutocompleteSeeds(input.idea, input.queries);
    if (seeds.length === 0) {
      return {
        status: 'skipped',
        message: 'No query seeds are available for autocomplete revalidation.',
      };
    }

    const runOptions: RunOptions = {
      seeds,
      country: input.country.toUpperCase(),
      language: input.language,
      depth: this.options.depth ?? 1,
      out: join(
        this.options.outDir ?? DEFAULT_REVALIDATION_OUT_DIR,
        `idea-${input.idea.id}-queue-${input.queueItem.id}.csv`,
      ),
      modifiers: this.options.modifiers ?? [...DEFAULT_MODIFIERS],
      mode: 'modifier',
      includeDigits: false,
      headless: this.options.headless ?? true,
      delayMs: this.options.delayMs ?? 1200,
      maxPrefixes: this.options.maxPrefixes ?? 500,
      maxDepth2Prefixes: this.options.maxDepth2Prefixes ?? 100,
      resume: false,
    };
    const collectorFactory = this.options.createCollector ?? ((headless: boolean) => new PlaywrightAutocompleteCollector(headless));
    const report = await runAutocompleteResearch(runOptions, collectorFactory(runOptions.headless));

    if (report.finalSummary.stopped && report.finalSummary.predictionCount === 0) {
      return {
        status: 'blocked',
        message: report.runMetadata.stoppedReason ?? 'Autocomplete collection stopped before collecting predictions.',
        metadata: {
          outputPath: runOptions.out,
          finalSummary: report.finalSummary,
        },
      };
    }

    return {
      status: 'completed',
      autocompletePredictions: report.collectedPredictions.map((prediction) => ({
        country: prediction.country,
        createdAt: prediction.timestamp,
        language: prediction.language,
        prediction: prediction.prediction,
        sourcePrefix: prediction.sourcePrefix,
        sourceSeed: prediction.originalSeed,
      })),
      metadata: {
        outputPath: runOptions.out,
        finalSummary: report.finalSummary,
      },
    };
  }
}

async function executeQueueItem(
  db: DatabaseSync,
  item: RevalidationQueueRow,
  context: {
    country: string;
    language: string;
    now: string;
    services: RevalidationServices;
    summaries: RevalidationTaskExecutionSummary[];
  },
): Promise<RevalidationTaskExecutionSummary> {
  try {
    switch (item.task_type) {
      case 'refresh_autocomplete':
        return await executeServiceTask(db, item, context, context.services.autocomplete, 'autocomplete');
      case 'refresh_serp':
        return await executeServiceTask(db, item, context, context.services.serp, 'SERP');
      case 'refresh_competitors':
        return await executeServiceTask(db, item, context, context.services.competitors, 'competitor');
      case 'refresh_reviews':
        return await executeServiceTask(db, item, context, context.services.reviews, 'review');
      case 'refresh_score':
        return refreshScore(db, item, context.now);
      case 'refresh_report':
        return refreshReport(db, item, context.now, context.summaries);
      case 'refresh_measurement':
        return skippedSummary(item, 'Measurement events are historical records and must be refreshed by manual import.');
      case 'refresh_portfolio':
        return skippedSummary(item, 'Portfolio ranking is not implemented in this checkout.');
      default:
        return failedSummary(item, `Unsupported revalidation task type: ${item.task_type}.`);
    }
  } catch (error) {
    return failedSummary(item, error instanceof Error ? error.message : String(error));
  }
}

async function executeServiceTask(
  db: DatabaseSync,
  item: RevalidationQueueRow,
  context: {
    country: string;
    language: string;
    now: string;
  },
  service: RevalidationTaskService | undefined,
  label: string,
): Promise<RevalidationTaskExecutionSummary> {
  if (!service) {
    return blockedSummary(item, `${label} revalidation service is unavailable or not configured.`);
  }

  const idea = getIdeaById(db, item.idea_id);
  const queries = listQueriesByIdea(db, idea.id);
  const result = await service.refresh({
    country: context.country,
    idea,
    language: context.language,
    now: context.now,
    queries,
    queueItem: item,
  });

  if (result.status === 'blocked') {
    return blockedSummary(item, result.message ?? `${label} revalidation service is blocked.`, result.metadata);
  }

  if (result.status === 'skipped') {
    return skippedSummary(item, result.message ?? `${label} revalidation service skipped the task.`, result.metadata);
  }

  const metadata = persistServiceResult(db, idea, queries, result, context);
  return completedSummary(item, result.message, {
    ...result.metadata,
    ...metadata,
  });
}

function persistServiceResult(
  db: DatabaseSync,
  idea: IdeaRow,
  queries: QueryRow[],
  result: RevalidationServiceResult,
  context: { country: string; language: string; now: string },
): Record<string, unknown> {
  const createdPredictions = result.autocompletePredictions?.length
    ? createAutocompletePredictions(
        db,
        result.autocompletePredictions.map((prediction) => {
          const sourceSeed = prediction.sourceSeed ?? queries[0]?.query ?? idea.title;
          return {
            ideaId: idea.id,
            queryId: matchingQueryId(queries, sourceSeed),
            prediction: prediction.prediction,
            normalizedPrediction: normalizeQuery(prediction.prediction),
            intent: classifyIntent(prediction.prediction),
            confidenceScore: scoreConfidence(prediction.prediction, 1, 1),
            sourceSeed,
            sourcePrefix: prediction.sourcePrefix ?? sourceSeed,
            country: prediction.country ?? context.country,
            language: prediction.language ?? context.language,
            createdAt: prediction.createdAt ?? context.now,
          };
        }),
      )
    : [];

  const createdSources = result.sources?.length
    ? createSources(
        db,
        result.sources.map((source) => ({
          ideaId: idea.id,
          url: source.url,
          sourceType: source.sourceType,
          title: source.title ?? null,
          snippet: source.snippet ?? null,
          fetchedAt: source.fetchedAt ?? context.now,
        })),
      )
    : [];
  const createdEvidence = persistEvidenceFromSources(db, idea.id, createdSources, context.now);
  const createdCompetitors = result.competitors?.length
    ? createCompetitors(
        db,
        result.competitors.map((competitor) => ({
          ideaId: idea.id,
          name: competitor.name,
          url: competitor.url,
          productType: competitor.productType ?? null,
          priceText: competitor.priceText ?? null,
          pricingModel: competitor.pricingModel ?? null,
          strengthsJson: JSON.stringify(competitor.strengths ?? []),
          weaknessesJson: JSON.stringify(competitor.weaknesses ?? []),
          reviewSummary: competitor.reviewSummary ?? null,
          createdAt: competitor.createdAt ?? context.now,
        })),
      )
    : [];

  return {
    autocompletePredictionCount: createdPredictions.length,
    competitorCount: createdCompetitors.length,
    evidenceCount: createdEvidence.length,
    sourceCount: createdSources.length,
  };
}

function refreshScore(
  db: DatabaseSync,
  item: RevalidationQueueRow,
  now: string,
): RevalidationTaskExecutionSummary {
  const predictions = rowsToUniquePredictions(listAutocompletePredictionsByIdea(db, item.idea_id));
  if (predictions.length === 0) {
    return skippedSummary(item, 'No autocomplete predictions are available to score.');
  }

  const scoreModel = buildSearchLanguageScore(predictions);
  const score = createScore(db, {
    ideaId: item.idea_id,
    scoreType: 'revalidation_search_language',
    scoreJson: JSON.stringify({
      breakdown: scoreModel.breakdown,
      generatedFrom: 'scheduled_revalidation',
    }, null, 2),
    totalScore: scoreModel.totalScore,
    decision: scoreModel.decision,
    createdAt: now,
  });

  return completedSummary(item, `Created refreshed score ${score.id}.`, {
    scoreCount: 1,
    scoreId: score.id,
    totalScore: score.total_score,
    decision: score.decision,
  });
}

function refreshReport(
  db: DatabaseSync,
  item: RevalidationQueueRow,
  now: string,
  summaries: RevalidationTaskExecutionSummary[],
): RevalidationTaskExecutionSummary {
  const idea = getIdeaById(db, item.idea_id);
  const snapshot = loadIdeaEvidenceSnapshot(db, idea);
  const scores = listScoresByIdea(db, idea.id);
  const latestScore = scores[0] ?? null;
  const previousScore = selectPreviousScore(scores, latestScore);
  const taskSummaries = summaries.filter((summary) => summary.ideaId === idea.id);
  const staleness = evaluateIdeaStaleness(snapshot, new Date(now));
  const reportOutput = buildRevalidationReport({
    createdAt: now,
    idea,
    latestScore,
    previousScore,
    staleness,
    taskSummaries,
  });
  const report = createReport(db, {
    ideaId: idea.id,
    jobId: null,
    reportType: 'revalidation_report',
    markdown: reportOutput.markdown,
    json: JSON.stringify({
      ...reportOutput.json,
      deterministicEvidenceSummary: buildDeterministicEvidenceSummary({
        external: {
          enabled: true,
          warnings: [],
          collectorRuns: [],
          sources: snapshot.sources,
          evidence: snapshot.evidence,
          competitors: snapshot.competitors,
        },
        predictions: rowsToUniquePredictions(snapshot.autocompletePredictions),
        queries: snapshot.queries,
        score: latestScore
          ? {
              totalScore: latestScore.total_score,
              decision: latestScore.decision,
              breakdown: parseScoreBreakdown(latestScore),
            }
          : buildSearchLanguageScore([]),
      }),
    }, null, 2),
    createdAt: now,
  });

  return completedSummary(item, `Created revalidation report ${report.id}.`, {
    reportCount: 1,
    reportId: report.id,
  });
}

function rowsToUniquePredictions(rows: ReturnType<typeof listAutocompletePredictionsByIdea>): UniquePrediction[] {
  const records: PredictionRecord[] = rows.map((row) => ({
    originalSeed: row.source_seed,
    sourcePrefix: row.source_prefix,
    prediction: row.prediction,
    prefixSent: row.source_prefix,
    exactPrediction: row.prediction,
    sourceMode: 'organic',
    predictionRank: 1,
    timestamp: row.created_at,
    country: row.country,
    language: row.language,
    depth: 1,
  }));

  return buildUniquePredictions(records);
}

function parseScoreBreakdown(score: ScoreRow): ReturnType<typeof buildSearchLanguageScore>['breakdown'] {
  try {
    const parsed = JSON.parse(score.score_json) as Record<string, unknown>;
    if ('breakdown' in parsed && parsed.breakdown && typeof parsed.breakdown === 'object') {
      return parsed.breakdown as unknown as ReturnType<typeof buildSearchLanguageScore>['breakdown'];
    }

    return parsed as unknown as ReturnType<typeof buildSearchLanguageScore>['breakdown'];
  } catch {
    return buildSearchLanguageScore([]).breakdown;
  }
}

function persistEvidenceFromSources(
  db: DatabaseSync,
  ideaId: number,
  sources: SourceRow[],
  createdAt: string,
) {
  const evidence = sources.flatMap((source) =>
    extractEvidenceFromSource({
      createdAt,
      ideaId,
      source,
    }),
  );

  if (evidence.length === 0) {
    return [];
  }

  return createEvidence(db, evidence);
}

function matchingQueryId(queries: QueryRow[], seed: string): number | null {
  const normalizedSeed = normalizeQuery(seed);
  return queries.find((query) => query.normalized_query === normalizedSeed)?.id ?? null;
}

function selectAutocompleteSeeds(idea: IdeaRow, queries: QueryRow[]): string[] {
  const seeds = queries
    .slice()
    .sort((left, right) => (right.priority_score ?? 0) - (left.priority_score ?? 0))
    .map((query) => query.query)
    .filter((query) => query.trim().length > 0)
    .slice(0, 8);

  if (seeds.length > 0) {
    return seeds;
  }

  return [idea.title, idea.raw_description].filter((value, index, values) =>
    value.trim().length > 0 && values.indexOf(value) === index,
  );
}

function selectPreviousScore(scores: ScoreRow[], latestScore: ScoreRow | null): ScoreRow | null {
  if (!latestScore) {
    return null;
  }

  return scores.find((score) => score.id !== latestScore.id) ?? null;
}

function countStatuses(summaries: RevalidationTaskExecutionSummary[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const summary of summaries) {
    counts[summary.status] = (counts[summary.status] ?? 0) + 1;
  }

  return counts;
}

function completedSummary(
  item: RevalidationQueueRow,
  message?: string,
  metadata?: Record<string, unknown>,
): RevalidationTaskExecutionSummary {
  return {
    itemId: item.id,
    ideaId: item.idea_id,
    taskType: item.task_type as RevalidationTaskExecutionSummary['taskType'],
    status: 'completed',
    message,
    metadata,
  };
}

function skippedSummary(
  item: RevalidationQueueRow,
  message: string,
  metadata?: Record<string, unknown>,
): RevalidationTaskExecutionSummary {
  return {
    itemId: item.id,
    ideaId: item.idea_id,
    taskType: item.task_type as RevalidationTaskExecutionSummary['taskType'],
    status: 'skipped',
    message,
    metadata,
  };
}

function blockedSummary(
  item: RevalidationQueueRow,
  message: string,
  metadata?: Record<string, unknown>,
): RevalidationTaskExecutionSummary {
  return {
    itemId: item.id,
    ideaId: item.idea_id,
    taskType: item.task_type as RevalidationTaskExecutionSummary['taskType'],
    status: 'blocked',
    message,
    metadata,
  };
}

function failedSummary(
  item: RevalidationQueueRow,
  message: string,
): RevalidationTaskExecutionSummary {
  return {
    itemId: item.id,
    ideaId: item.idea_id,
    taskType: item.task_type as RevalidationTaskExecutionSummary['taskType'],
    status: 'failed',
    message,
  };
}
