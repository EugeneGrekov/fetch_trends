import type { IdeaRow, ScoreRow } from '../db/schema.js';
import type { RevalidationTaskExecutionSummary, StalenessResult } from './types.js';

export interface RevalidationReportInput {
  createdAt: string;
  idea: IdeaRow;
  latestScore: ScoreRow | null;
  previousScore: ScoreRow | null;
  staleness: StalenessResult;
  taskSummaries: RevalidationTaskExecutionSummary[];
}

export interface RevalidationReportOutput {
  json: Record<string, unknown>;
  markdown: string;
}

export function buildRevalidationReport(input: RevalidationReportInput): RevalidationReportOutput {
  const refreshed = input.taskSummaries.filter((summary) => summary.status === 'completed');
  const blockedOrSkipped = input.taskSummaries.filter((summary) =>
    summary.status === 'blocked' || summary.status === 'skipped' || summary.status === 'failed',
  );
  const scoreDelta = scoreChange(input.previousScore, input.latestScore);
  const decisionChange = decisionChanged(input.previousScore, input.latestScore);

  const markdown = [
    '# Revalidation Report',
    '',
    `Generated at: ${input.createdAt}`,
    '',
    '## Idea',
    '',
    `- ID: ${input.idea.id}`,
    `- Title: ${input.idea.title}`,
    '',
    '## What Was Stale',
    '',
    ...renderStaleReasons(input.staleness),
    '',
    '## What Was Refreshed',
    '',
    ...renderTaskList(refreshed, 'No queued refresh tasks completed in this run.'),
    '',
    '## Failed, Blocked, Or Skipped',
    '',
    ...renderTaskList(blockedOrSkipped, 'No tasks failed, blocked, or skipped.'),
    '',
    '## New Evidence Found',
    '',
    ...renderEvidenceSummary(input.taskSummaries),
    '',
    '## Score Changes',
    '',
    scoreDelta,
    '',
    '## Decision Changes',
    '',
    decisionChange,
    '',
    '## Portfolio Rank Changes',
    '',
    '- Portfolio ranking is not calculated by the scheduled revalidation runner in this checkout.',
    '',
    '## Recommended Next Action',
    '',
    recommendedNextAction(input.taskSummaries, input.staleness),
    '',
  ].join('\n');

  return {
    markdown,
    json: {
      createdAt: input.createdAt,
      idea: {
        id: input.idea.id,
        title: input.idea.title,
      },
      staleness: input.staleness,
      taskSummaries: input.taskSummaries,
      scoreChange: {
        latestDecision: input.latestScore?.decision ?? null,
        latestScore: input.latestScore?.total_score ?? null,
        previousDecision: input.previousScore?.decision ?? null,
        previousScore: input.previousScore?.total_score ?? null,
      },
      portfolioRankChange: null,
      recommendedNextAction: recommendedNextAction(input.taskSummaries, input.staleness).replace(/^- /, ''),
    },
  };
}

function renderStaleReasons(staleness: StalenessResult): string[] {
  if (!staleness.stale) {
    return ['- No stale evidence was detected at report generation time.'];
  }

  return staleness.reasons.map((reason) => {
    const age = reason.ageDays == null ? '' : ` Age: ${reason.ageDays} day(s).`;
    const fetchedAt = reason.lastFetchedAt ?? 'not present';
    return `- ${reason.type}: ${reason.reason} Last fetched: ${fetchedAt}.${age} Task: ${reason.recommendedTask}.`;
  });
}

function renderTaskList(summaries: RevalidationTaskExecutionSummary[], emptyState: string): string[] {
  if (summaries.length === 0) {
    return [`- ${emptyState}`];
  }

  return summaries.map((summary) => {
    const message = summary.message ? ` ${summary.message}` : '';
    return `- ${summary.taskType}: ${summary.status}.${message}`;
  });
}

function renderEvidenceSummary(summaries: RevalidationTaskExecutionSummary[]): string[] {
  const completed = summaries.filter((summary) => summary.status === 'completed');
  if (completed.length === 0) {
    return ['- No new evidence rows were created in this run.'];
  }

  return completed.map((summary) => {
    const metadata = summary.metadata ?? {};
    const counts = [
      countText(metadata.autocompletePredictionCount, 'autocomplete prediction'),
      countText(metadata.sourceCount, 'source'),
      countText(metadata.evidenceCount, 'evidence row'),
      countText(metadata.competitorCount, 'competitor'),
      countText(metadata.scoreCount, 'score snapshot'),
      countText(metadata.reportCount, 'report snapshot'),
    ].filter(Boolean);
    return `- ${summary.taskType}: ${counts.length > 0 ? counts.join(', ') : 'completed without row-count metadata'}.`;
  });
}

function countText(value: unknown, label: string): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return `${value} ${label}${value === 1 ? '' : 's'}`;
}

function scoreChange(previousScore: ScoreRow | null, latestScore: ScoreRow | null): string {
  if (!latestScore) {
    return '- No refreshed score snapshot exists yet.';
  }

  if (!previousScore) {
    return `- Created score ${latestScore.id}: ${latestScore.total_score}/100 (${latestScore.decision}).`;
  }

  const delta = latestScore.total_score - previousScore.total_score;
  const signedDelta = delta > 0 ? `+${delta}` : String(delta);
  return [
    `- Previous score ${previousScore.id}: ${previousScore.total_score}/100 (${previousScore.decision}).`,
    `- Latest score ${latestScore.id}: ${latestScore.total_score}/100 (${latestScore.decision}).`,
    `- Score delta: ${signedDelta}.`,
  ].join('\n');
}

function decisionChanged(previousScore: ScoreRow | null, latestScore: ScoreRow | null): string {
  if (!latestScore) {
    return '- No refreshed decision is available because no refreshed score exists yet.';
  }

  if (!previousScore) {
    return `- Initial refreshed decision: ${latestScore.decision}.`;
  }

  if (previousScore.decision === latestScore.decision) {
    return `- Decision unchanged: ${latestScore.decision}.`;
  }

  return `- Decision changed from ${previousScore.decision} to ${latestScore.decision}.`;
}

function recommendedNextAction(
  summaries: RevalidationTaskExecutionSummary[],
  staleness: StalenessResult,
): string {
  const blocked = summaries.filter((summary) => summary.status === 'blocked');
  if (blocked.length > 0) {
    return `- Resolve blocked collectors before trusting refreshed confidence: ${blocked.map((summary) => summary.taskType).join(', ')}.`;
  }

  const failed = summaries.filter((summary) => summary.status === 'failed');
  if (failed.length > 0) {
    return `- Re-run failed revalidation tasks after reviewing errors: ${failed.map((summary) => summary.taskType).join(', ')}.`;
  }

  if (staleness.confidenceImpact === 'high') {
    return '- Refresh remaining stale evidence before making build, pivot, or kill decisions.';
  }

  return '- Review the refreshed score and evidence before choosing the next validation action.';
}
