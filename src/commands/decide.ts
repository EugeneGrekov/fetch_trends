import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { listAutocompletePredictionsByIdea } from '../db/repositories/autocomplete-predictions.js';
import { listEvidenceByIdea } from '../db/repositories/evidence.js';
import {
  getExperimentById,
  listExperimentsByIdea,
  listMeasurementSnapshots,
} from '../db/repositories/experiments.js';
import { createIdeaDecision, listIdeaDecisionsByIdea } from '../db/repositories/idea-decisions.js';
import { getIdeaById } from '../db/repositories/ideas.js';
import { createReport, listReportsByIdea } from '../db/repositories/reports.js';
import { listScoresByIdea } from '../db/repositories/scores.js';
import type {
  ExperimentRow,
  IdeaDecisionRow,
  MeasurementSnapshotRow,
  ReportRow,
} from '../db/schema.js';
import { buildDecisionMemo } from '../decision-loop/decision-memo.js';
import { evaluateDecisionLoop } from '../decision-loop/decision-engine.js';
import type { DecisionLoopInput, DecisionLoopOutput } from '../decision-loop/types.js';
import { aggregateExperimentMetrics } from '../measurement/metrics-aggregator.js';
import {
  buildMeasurementRecommendation,
  evaluateThresholdPlan,
  parseMeasurementThresholdPlan,
} from '../measurement/threshold-evaluator.js';
import type {
  MeasurementMetrics,
  MeasurementRecommendation,
  ThresholdEvaluationResult,
} from '../measurement/types.js';

export interface DecideCommandOptions {
  dbPath?: string;
  experimentId?: number;
  ideaId?: number;
  outDir?: string;
}

export interface GeneratedDecisionMemoArtifact {
  decision: IdeaDecisionRow;
  jsonPath: string;
  markdownPath: string;
  output: DecisionLoopOutput;
  report: ReportRow;
}

const DEFAULT_ARTIFACT_ROOT = './artifacts/ideas';
const REPORT_TYPE = 'decision_memo';

export function buildDecideProgram(): Command {
  return new Command()
    .name('fetch-trends-decide')
    .description('Evaluate an idea or experiment with the pivot/persevere decision loop.')
    .option('--idea-id <id>', 'idea ID to evaluate', parsePositiveInteger)
    .option('--experiment-id <id>', 'experiment ID to evaluate', parsePositiveInteger)
    .option('--db <path>', 'SQLite database path')
    .option('--outDir <path>', 'artifact root directory', DEFAULT_ARTIFACT_ROOT)
    .action(async (options: {
      db?: string;
      experimentId?: number;
      ideaId?: number;
      outDir: string;
    }) => {
      try {
        const result = await generateDecisionMemoArtifact({
          dbPath: options.db,
          experimentId: options.experimentId,
          ideaId: options.ideaId,
          outDir: options.outDir,
        });

        process.stdout.write(`Decision: ${result.output.decision}\n`);
        process.stdout.write(`Confidence: ${result.output.confidence}\n`);
        process.stdout.write(`Reason: ${result.output.reason}\n`);
        process.stdout.write(`Next action: ${result.output.nextAction}\n`);
        process.stdout.write(`Report ID: ${result.report.id}\n`);
        process.stdout.write(`Decision ID: ${result.decision.id}\n`);
        process.stdout.write(`Markdown: ${result.markdownPath}\n`);
        process.stdout.write(`JSON: ${result.jsonPath}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        process.exitCode = 1;
      }
    });
}

export async function runDecideCli(argv: string[]): Promise<void> {
  await buildDecideProgram().parseAsync(argv);
}

export async function generateDecisionMemoArtifact(
  options: DecideCommandOptions,
): Promise<GeneratedDecisionMemoArtifact> {
  if (options.ideaId == null && options.experimentId == null) {
    throw new Error('Pass --idea-id or --experiment-id.');
  }

  const { db } = await openDatabase(options.dbPath);
  try {
    applyMigrations(db);
    const input = loadDecisionLoopInput(db, options);
    const output = evaluateDecisionLoop(input);
    const memo = buildDecisionMemo(input, output);
    const createdAt = new Date().toISOString();
    const report = createReport(db, {
      createdAt,
      ideaId: input.idea.id,
      jobId: input.latestValidationReport?.job_id ?? null,
      json: JSON.stringify({ decisionMemo: memo.json }, null, 2),
      markdown: memo.markdown,
      reportType: REPORT_TYPE,
    });
    const decision = createIdeaDecision(db, {
      confidence: output.confidence,
      createdAt,
      decision: output.decision,
      evidenceJson: JSON.stringify({
        evidence: output.evidence,
        missingProof: output.missingProof,
        pivotOptions: output.pivotOptions,
        whatWouldChangeDecision: output.whatWouldChangeDecision,
      }, null, 2),
      experimentId: input.experiment?.id ?? null,
      ideaId: input.idea.id,
      nextAction: output.nextAction,
      reason: output.reason,
      reportId: report.id,
    });

    const artifactDir = join(options.outDir ?? DEFAULT_ARTIFACT_ROOT, String(input.idea.id));
    const markdownPath = join(artifactDir, `decision-memo-${report.id}.md`);
    const jsonPath = join(artifactDir, `decision-memo-${report.id}.json`);

    await mkdir(artifactDir, { recursive: true });
    await writeFile(markdownPath, `${memo.markdown}\n`);
    await writeFile(
      jsonPath,
      `${JSON.stringify({
        decision: {
          confidence: decision.confidence,
          decision: decision.decision,
          id: decision.id,
          nextAction: decision.next_action,
          reason: decision.reason,
        },
        decisionMemo: memo.json,
        report: {
          createdAt: report.created_at,
          id: report.id,
          ideaId: report.idea_id,
          jobId: report.job_id,
          reportType: report.report_type,
        },
      }, null, 2)}\n`,
    );

    return {
      decision,
      jsonPath,
      markdownPath,
      output,
      report,
    };
  } finally {
    db.close();
  }
}

function loadDecisionLoopInput(db: DatabaseSync, options: DecideCommandOptions): DecisionLoopInput {
  const experiment = selectExperiment(db, options);
  const idea = getIdeaById(db, options.ideaId ?? experiment?.idea_id ?? 0);
  const reports = listReportsByIdea(db, idea.id);
  const measurement = experiment ? loadMeasurementContext(db, experiment) : null;

  return {
    evidence: listEvidenceByIdea(db, idea.id),
    experiment,
    idea,
    latestMeasurementReport: latestReportByType(reports, 'measurement_report'),
    latestPaymentTestReport: latestReportByType(reports, 'payment_test_spec'),
    latestScore: listScoresByIdea(db, idea.id)[0] ?? null,
    latestSeoPlanReport: latestReportByType(reports, 'seo_plan'),
    latestValidationReport: latestReportByType(reports, 'search-language-validation'),
    measurementMetrics: measurement?.metrics ?? null,
    measurementRecommendation: measurement?.recommendation ?? null,
    measurementSnapshot: measurement?.snapshot ?? null,
    predictions: listAutocompletePredictionsByIdea(db, idea.id),
    priorDecisions: listIdeaDecisionsByIdea(db, idea.id),
    reports,
    thresholdResults: measurement?.thresholdResults ?? [],
  };
}

function selectExperiment(db: DatabaseSync, options: DecideCommandOptions): ExperimentRow | null {
  if (options.experimentId != null) {
    const experiment = getExperimentById(db, options.experimentId);
    if (options.ideaId != null && experiment.idea_id !== options.ideaId) {
      throw new Error(`Experiment ${experiment.id} belongs to idea ${experiment.idea_id}, not idea ${options.ideaId}.`);
    }

    return experiment;
  }

  if (options.ideaId != null) {
    return listExperimentsByIdea(db, options.ideaId)[0] ?? null;
  }

  return null;
}

function loadMeasurementContext(db: DatabaseSync, experiment: ExperimentRow): {
  metrics: MeasurementMetrics;
  recommendation: MeasurementRecommendation;
  snapshot: MeasurementSnapshotRow | null;
  thresholdResults: ThresholdEvaluationResult[];
} {
  const snapshot = listMeasurementSnapshots(db, experiment.id)[0] ?? null;
  const metrics = snapshot
    ? parseStoredJson<MeasurementMetrics>(snapshot.metrics_json, `measurement snapshot ${snapshot.id} metrics_json`)
    : aggregateExperimentMetrics(db, experiment.id);
  const thresholdResults = snapshot
    ? parseStoredJson<ThresholdEvaluationResult[]>(
        snapshot.threshold_results_json,
        `measurement snapshot ${snapshot.id} threshold_results_json`,
      )
    : evaluateThresholdPlan(parseMeasurementThresholdPlan(experiment.threshold_json), metrics);

  return {
    metrics,
    recommendation: buildMeasurementRecommendation(metrics, thresholdResults),
    snapshot,
    thresholdResults,
  };
}

function latestReportByType(reports: ReportRow[], reportType: string): ReportRow | null {
  return reports.find((report) => report.report_type === reportType) ?? null;
}

function parseStoredJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a positive integer.');
}
