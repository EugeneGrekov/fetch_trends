import type { DatabaseSync } from 'node:sqlite';
import type {
  CompetitorRow,
  EvidenceRow,
  ExperimentDecisionRow,
  ExperimentRow,
  IdeaDecisionRow,
  IdeaRow,
  MeasurementSnapshotRow,
  QueryRow,
  ReportRow,
  ScoreRow,
  SourceRow,
} from '../db/schema.js';
import { listAutocompletePredictionsByIdea } from '../db/repositories/autocomplete-predictions.js';
import { listCompetitorsByIdea } from '../db/repositories/competitors.js';
import { listEvidenceByIdea } from '../db/repositories/evidence.js';
import { listExperimentDecisions, listExperimentsByIdea, listMeasurementSnapshots } from '../db/repositories/experiments.js';
import { listIdeaDecisionsByIdea } from '../db/repositories/idea-decisions.js';
import { listIdeas } from '../db/repositories/ideas.js';
import { listQueriesByIdea } from '../db/repositories/queries.js';
import { listReportsByIdea } from '../db/repositories/reports.js';
import { listScoresByIdea } from '../db/repositories/scores.js';
import { listSourcesByIdea } from '../db/repositories/sources.js';
import type { MeasurementMetrics, ThresholdEvaluationResult } from '../measurement/types.js';
import type { PortfolioComparisonFilters, PortfolioIdeaSnapshot } from './types.js';

const KILLED_STATUSES = new Set(['failed', 'killed', 'kill', 'archived']);

export function loadPortfolioIdeas(db: DatabaseSync, filters: PortfolioComparisonFilters): PortfolioIdeaSnapshot[] {
  const ideas = listIdeas(db, Math.max(filters.limit * 10, 1000));
  const snapshots: PortfolioIdeaSnapshot[] = [];

  for (const idea of ideas) {
    if (!matchesFilters(idea, filters)) {
      continue;
    }

    snapshots.push(loadPortfolioIdeaSnapshot(db, idea));
    if (snapshots.length >= filters.limit) {
      break;
    }
  }

  return snapshots;
}

export function loadPortfolioIdeaSnapshot(db: DatabaseSync, idea: IdeaRow): PortfolioIdeaSnapshot {
  const reports = listReportsByIdea(db, idea.id);
  const experiments = listExperimentsByIdea(db, idea.id);
  const scores = listScoresByIdea(db, idea.id);
  const sources = listSourcesByIdea(db, idea.id);
  const competitors = listCompetitorsByIdea(db, idea.id);
  const evidence = listEvidenceByIdea(db, idea.id);
  const predictions = listAutocompletePredictionsByIdea(db, idea.id);
  const queries = listQueriesByIdea(db, idea.id);
  const latestExperiment = experiments[0] ?? null;
  const latestMeasurementSnapshot = latestExperiment ? listMeasurementSnapshots(db, latestExperiment.id)[0] ?? null : null;
  const latestMeasurementContext = parseMeasurementSnapshot(latestMeasurementSnapshot);
  const latestExperimentDecision = latestExperiment ? listExperimentDecisions(db, latestExperiment.id)[0] ?? null : null;
  const latestIdeaDecision = listIdeaDecisionsByIdea(db, idea.id)[0] ?? null;

  return {
    competitors,
    evidence,
    idea,
    latestDecision: latestIdeaDecision,
    latestEvidenceAt: latestEvidenceTimestamp({
      competitors,
      evidence,
      experiments,
      latestIdeaDecision,
      latestMeasurementSnapshot,
      reports,
      scores,
      sources,
    }),
    latestExperiment,
    latestExperimentDecision,
    latestMeasurementMetrics: latestMeasurementContext.metrics,
    latestMeasurementSnapshot,
    latestMeasurementThresholdResults: latestMeasurementContext.thresholdResults,
    latestMeasurementReport: findReport(reports, 'measurement_report'),
    latestPaymentTestReport: findReport(reports, 'payment_test_spec'),
    latestReportAt: reports[0]?.created_at ?? null,
    latestScore: scores[0] ?? null,
    latestSeoPlanReport: findReport(reports, 'seo_plan'),
    latestValidationReport: findReport(reports, 'search-language-validation'),
    predictions,
    queries,
    sources,
  };
}

function matchesFilters(idea: IdeaRow, filters: PortfolioComparisonFilters): boolean {
  const status = idea.status.trim().toLowerCase();

  if (!filters.includeKilled && KILLED_STATUSES.has(status)) {
    return false;
  }

  if (!filters.status) {
    return true;
  }

  const requestedStatus = filters.status.trim().toLowerCase();
  if (requestedStatus === 'active') {
    return !KILLED_STATUSES.has(status);
  }

  if (requestedStatus === 'killed') {
    return KILLED_STATUSES.has(status);
  }

  return status === requestedStatus;
}

function findReport(reports: ReportRow[], reportType: string): ReportRow | null {
  return reports.find((report) => report.report_type === reportType) ?? null;
}

function parseMeasurementSnapshot(snapshot: MeasurementSnapshotRow | null): {
  metrics: MeasurementMetrics | null;
  thresholdResults: ThresholdEvaluationResult[] | null;
} {
  if (!snapshot) {
    return { metrics: null, thresholdResults: null };
  }

  return {
    metrics: parseJson<MeasurementMetrics>(snapshot.metrics_json),
    thresholdResults: parseJson<ThresholdEvaluationResult[]>(snapshot.threshold_results_json),
  };
}

function latestEvidenceTimestamp(input: {
  competitors: CompetitorRow[];
  evidence: EvidenceRow[];
  experiments: ExperimentRow[];
  latestIdeaDecision: IdeaDecisionRow | null;
  latestMeasurementSnapshot: MeasurementSnapshotRow | null;
  reports: ReportRow[];
  scores: ScoreRow[];
  sources: SourceRow[];
}): string | null {
  const timestamps = [
    ...input.competitors.map((row) => row.created_at),
    ...input.evidence.map((row) => row.created_at),
    ...input.experiments.map((row) => row.created_at),
    ...(input.latestIdeaDecision ? [input.latestIdeaDecision.created_at] : []),
    ...(input.latestMeasurementSnapshot ? [input.latestMeasurementSnapshot.created_at] : []),
    ...input.reports.map((row) => row.created_at),
    ...input.scores.map((row) => row.created_at),
    ...input.sources.map((row) => row.fetched_at),
  ].filter(Boolean);

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.sort().at(-1) ?? null;
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
