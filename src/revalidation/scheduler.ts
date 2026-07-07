import type { DatabaseSync } from 'node:sqlite';
import { listAutocompletePredictionsByIdea } from '../db/repositories/autocomplete-predictions.js';
import { listCompetitorsByIdea } from '../db/repositories/competitors.js';
import { listEvidenceByIdea } from '../db/repositories/evidence.js';
import { getIdeaById, listIdeas } from '../db/repositories/ideas.js';
import {
  completeRevalidationRun,
  createRevalidationQueueItem,
  createRevalidationRun,
  failRevalidationRun,
  findOpenRevalidationQueueItem,
} from '../db/repositories/revalidation.js';
import { listReportsByIdea } from '../db/repositories/reports.js';
import { listScoresByIdea } from '../db/repositories/scores.js';
import { listSourcesByIdea } from '../db/repositories/sources.js';
import { listQueriesByIdea } from '../db/repositories/queries.js';
import type { IdeaRow } from '../db/schema.js';
import { queueStaleRevalidationTasks } from './queue.js';
import { evaluateIdeaStaleness } from './stale-evidence.js';
import type {
  IdeaEvidenceSnapshot,
  RevalidationScanResult,
  RevalidationTaskType,
  StalenessResult,
} from './types.js';

export interface RevalidationScanOptions {
  ideaId?: number;
  limit?: number;
  now?: string;
  portfolio?: boolean;
}

export function scanForRevalidation(
  db: DatabaseSync,
  options: RevalidationScanOptions = {},
): RevalidationScanResult {
  const startedAt = options.now ?? new Date().toISOString();
  const run = createRevalidationRun(db, {
    ideaId: options.ideaId ?? null,
    mode: options.portfolio ? 'scan_portfolio' : 'scan',
    status: 'running',
    startedAt,
  });

  try {
    const ideas = selectIdeas(db, options);
    const staleResults: StalenessResult[] = [];
    const queued: RevalidationScanResult['queued'] = [];
    const skippedExisting: RevalidationScanResult['skippedExisting'] = [];

    for (const idea of ideas) {
      const snapshot = loadIdeaEvidenceSnapshot(db, idea);
      const result = evaluateIdeaStaleness(snapshot, new Date(startedAt));
      if (!result.stale) {
        continue;
      }

      staleResults.push(result);
      const queueResult = queueStaleRevalidationTasks(db, result, startedAt);
      queued.push(...queueResult.queued);
      skippedExisting.push(...queueResult.skippedExisting);
    }

    if (options.portfolio && staleResults.length > 0) {
      for (const result of staleResults) {
        const portfolioQueueResult = queuePortfolioRefresh(db, result, startedAt);
        if (portfolioQueueResult.queued) {
          queued.push(portfolioQueueResult.queued);
        }
        if (portfolioQueueResult.skippedExisting) {
          skippedExisting.push(portfolioQueueResult.skippedExisting);
        }
      }
    }

    const completedRun = completeRevalidationRun(
      db,
      run.id,
      JSON.stringify({
        ideaCount: ideas.length,
        portfolio: Boolean(options.portfolio),
        queuedCount: queued.length,
        skippedExistingCount: skippedExisting.length,
        staleIdeaCount: staleResults.length,
      }, null, 2),
      new Date().toISOString(),
    );

    return {
      queued,
      skippedExisting,
      staleResults,
      run: completedRun,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failRevalidationRun(
      db,
      run.id,
      message,
      JSON.stringify({ error: message }, null, 2),
      new Date().toISOString(),
    );
    throw error;
  }
}

export function loadIdeaEvidenceSnapshot(db: DatabaseSync, idea: IdeaRow): IdeaEvidenceSnapshot {
  return {
    autocompletePredictions: listAutocompletePredictionsByIdea(db, idea.id),
    competitors: listCompetitorsByIdea(db, idea.id),
    evidence: listEvidenceByIdea(db, idea.id),
    idea,
    queries: listQueriesByIdea(db, idea.id),
    reports: listReportsByIdea(db, idea.id),
    scores: listScoresByIdea(db, idea.id),
    sources: listSourcesByIdea(db, idea.id),
  };
}

function selectIdeas(db: DatabaseSync, options: RevalidationScanOptions): IdeaRow[] {
  if (options.ideaId != null) {
    return [getIdeaById(db, options.ideaId)];
  }

  return listIdeas(db, options.limit ?? 500);
}

function queuePortfolioRefresh(
  db: DatabaseSync,
  result: StalenessResult,
  now: string,
): {
  queued?: RevalidationScanResult['queued'][number];
  skippedExisting?: RevalidationScanResult['skippedExisting'][number];
} {
  const taskType: RevalidationTaskType = 'refresh_portfolio';
  const reason = 'Portfolio ranking may change after stale idea evidence is refreshed.';
  const existing = findOpenRevalidationQueueItem(db, result.ideaId, taskType);
  if (existing) {
    return {
      skippedExisting: {
        ideaId: result.ideaId,
        taskType,
        reason,
      },
    };
  }

  return {
    queued: createRevalidationQueueItem(db, {
      ideaId: result.ideaId,
      taskType,
      reason,
      staleReasonJson: JSON.stringify({
        confidenceImpact: result.confidenceImpact,
        reasons: result.reasons,
      }, null, 2),
      createdAt: now,
    }),
  };
}
