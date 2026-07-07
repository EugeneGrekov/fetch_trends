import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import {
  createExperiment,
  createExperimentDecision,
  createMeasurementSnapshot,
  getExperimentById,
  listExperimentEvents,
  listExperimentsByIdea,
} from '../db/repositories/experiments.js';
import { createReport, getReportById, listReportsByIdea } from '../db/repositories/reports.js';
import type {
  ExperimentDecisionRow,
  ExperimentEventRow,
  ExperimentRow,
  MeasurementSnapshotRow,
  ReportRow,
} from '../db/schema.js';
import { buildMeasurementReport } from '../measurement/decision-report.js';
import {
  normalizeManualEvent,
  parseMeasurementEventCsv,
  recordMeasurementEvents,
} from '../measurement/event-recorder.js';
import { aggregateMeasurementEvents } from '../measurement/metrics-aggregator.js';
import {
  buildMeasurementRecommendation,
  evaluateThresholdPlan,
  parseMeasurementThresholdPlan,
} from '../measurement/threshold-evaluator.js';
import type { ManualMeasurementEvent } from '../measurement/types.js';

export interface CreateMeasurementExperimentOptions {
  dbPath?: string;
  experimentType?: string;
  ideaId: number;
  launchedAt?: string | null;
  reportId?: number;
  status?: string;
  title?: string;
}

export interface ImportMeasurementEventsOptions {
  createdAt?: string;
  dbPath?: string;
  eventsPath: string;
  experimentId: number;
}

export interface RecordMeasurementEventOptions {
  createdAt?: string;
  dbPath?: string;
  event: ManualMeasurementEvent;
  experimentId: number;
}

export interface EvaluateMeasurementOptions {
  dbPath?: string;
  experimentId: number;
  outDir?: string;
}

export interface MeasurementEvaluationArtifact {
  decision: ExperimentDecisionRow;
  jsonPath: string;
  markdownPath: string;
  report: ReportRow;
  snapshot: MeasurementSnapshotRow;
}

const DEFAULT_ARTIFACT_ROOT = './artifacts/ideas';
const REPORT_TYPE = 'measurement_report';

export function buildMeasurementProgram(): Command {
  return new Command()
    .name('fetch-trends-measurement')
    .description('Import local experiment behavior events and evaluate post-launch measurement thresholds.')
    .option('--db <path>', 'SQLite database path')
    .option('--outDir <path>', 'artifact root directory', DEFAULT_ARTIFACT_ROOT)
    .option('--experiment-id <id>', 'experiment ID to import or evaluate', parsePositiveInteger)
    .option('--idea-id <id>', 'idea ID for experiment creation or --latest lookup', parsePositiveInteger)
    .option('--report-id <id>', 'payment_test_spec report ID to create an experiment from', parsePositiveInteger)
    .option('--create', 'create an experiment from a stored payment_test_spec report')
    .option('--latest', 'use the latest experiment for --idea-id')
    .option('--title <title>', 'experiment title override')
    .option('--type <type>', 'experiment type override')
    .option('--status <status>', 'experiment status when creating', 'launched')
    .option('--launched-at <timestamp>', 'experiment launch timestamp when creating')
    .option('--events <path>', 'CSV file of manual events to import')
    .option('--event-name <name>', 'record one manual event')
    .option('--occurred-at <timestamp>', 'timestamp for --event-name; defaults to now')
    .option('--source <source>', 'source for --event-name', 'manual')
    .option('--session-id <id>', 'session ID for --event-name')
    .option('--metadata <json>', 'metadata JSON for --event-name')
    .option('--evaluate', 'aggregate metrics, evaluate thresholds, and persist a measurement report')
    .action(async (options: {
      create?: boolean;
      db?: string;
      evaluate?: boolean;
      eventName?: string;
      events?: string;
      experimentId?: number;
      ideaId?: number;
      latest?: boolean;
      launchedAt?: string;
      metadata?: string;
      occurredAt?: string;
      outDir: string;
      reportId?: number;
      sessionId?: string;
      source: string;
      status: string;
      title?: string;
      type?: string;
    }) => {
      try {
        let experimentId = options.experimentId;
        let performedAction = false;

        if (options.create) {
          if (options.ideaId == null) {
            throw new Error('Pass --idea-id with --create.');
          }

          const experiment = await createMeasurementExperiment({
            dbPath: options.db,
            experimentType: options.type,
            ideaId: options.ideaId,
            launchedAt: options.launchedAt ?? null,
            reportId: options.reportId,
            status: options.status,
            title: options.title,
          });
          experimentId = experiment.id;
          performedAction = true;
          process.stdout.write(`Created measurement experiment ${experiment.id} for idea ${experiment.idea_id}.\n`);
        }

        if (options.latest) {
          if (options.ideaId == null) {
            throw new Error('Pass --idea-id with --latest.');
          }
          experimentId = await getLatestExperimentId({ dbPath: options.db, ideaId: options.ideaId });
          process.stdout.write(`Using latest measurement experiment ${experimentId} for idea ${options.ideaId}.\n`);
        }

        if (options.events) {
          assertExperimentId(experimentId);
          const events = await importMeasurementEvents({
            dbPath: options.db,
            eventsPath: options.events,
            experimentId,
          });
          performedAction = true;
          process.stdout.write(`Imported ${events.length} measurement event(s) into experiment ${experimentId}.\n`);
        }

        if (options.eventName) {
          assertExperimentId(experimentId);
          const events = await recordSingleMeasurementEvent({
            dbPath: options.db,
            event: normalizeManualEvent({
              eventName: options.eventName as ManualMeasurementEvent['eventName'],
              occurredAt: options.occurredAt ?? new Date().toISOString(),
              source: options.source,
              sessionId: options.sessionId ?? null,
              metadataJson: options.metadata ?? null,
            }),
            experimentId,
          });
          performedAction = true;
          process.stdout.write(`Recorded ${events.length} measurement event into experiment ${experimentId}.\n`);
        }

        if (options.evaluate) {
          assertExperimentId(experimentId);
          const result = await evaluateMeasurementExperiment({
            dbPath: options.db,
            experimentId,
            outDir: options.outDir,
          });
          performedAction = true;
          process.stdout.write('Generated measurement report:\n');
          process.stdout.write(`Decision: ${result.decision.decision}\n`);
          process.stdout.write(`Report ID: ${result.report.id}\n`);
          process.stdout.write(`Markdown: ${result.markdownPath}\n`);
          process.stdout.write(`JSON: ${result.jsonPath}\n`);
        }

        if (!performedAction) {
          throw new Error('Pass --create, --events, --event-name, --evaluate, or a combination of those options.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        process.exitCode = 1;
      }
    });
}

export async function runMeasurementCli(argv: string[]): Promise<void> {
  await buildMeasurementProgram().parseAsync(argv);
}

export async function createMeasurementExperiment(
  options: CreateMeasurementExperimentOptions,
): Promise<ExperimentRow> {
  const { db } = await openDatabase(options.dbPath);
  try {
    applyMigrations(db);
    const sourceReport = options.reportId == null
      ? latestPaymentTestReport(db, options.ideaId)
      : getReportById(db, options.reportId);
    if (sourceReport.idea_id !== options.ideaId) {
      throw new Error(`Report ${sourceReport.id} belongs to idea ${sourceReport.idea_id}, not idea ${options.ideaId}.`);
    }

    const paymentTest = parsePaymentTestPayload(sourceReport);
    const thresholdJson = JSON.stringify({
      assumptionWarning: paymentTest.thresholdAssumptionWarning ?? null,
      sourceReportId: sourceReport.id,
      testType: paymentTest.testType ?? paymentTest.decision ?? options.experimentType ?? 'measurement',
      thresholds: paymentTest.decisionThresholds,
    }, null, 2);
    parseMeasurementThresholdPlan(thresholdJson);

    return createExperiment(db, {
      createdAt: new Date().toISOString(),
      experimentType: options.experimentType ?? paymentTest.testType ?? paymentTest.decision ?? 'measurement',
      ideaId: options.ideaId,
      launchedAt: options.launchedAt ?? null,
      reportId: sourceReport.id,
      status: options.status ?? 'launched',
      thresholdJson,
      title: options.title ?? paymentTest.headline ?? `Measurement experiment for idea ${options.ideaId}`,
    });
  } finally {
    db.close();
  }
}

export async function importMeasurementEvents(
  options: ImportMeasurementEventsOptions,
): Promise<ExperimentEventRow[]> {
  const contents = await readFile(options.eventsPath, 'utf8');
  const events = parseMeasurementEventCsv(contents);
  const { db } = await openDatabase(options.dbPath);
  try {
    applyMigrations(db);
    return recordMeasurementEvents({
      createdAt: options.createdAt,
      db,
      events,
      experimentId: options.experimentId,
    });
  } finally {
    db.close();
  }
}

export async function recordSingleMeasurementEvent(
  options: RecordMeasurementEventOptions,
): Promise<ExperimentEventRow[]> {
  const { db } = await openDatabase(options.dbPath);
  try {
    applyMigrations(db);
    return recordMeasurementEvents({
      createdAt: options.createdAt,
      db,
      events: [options.event],
      experimentId: options.experimentId,
    });
  } finally {
    db.close();
  }
}

export async function evaluateMeasurementExperiment(
  options: EvaluateMeasurementOptions,
): Promise<MeasurementEvaluationArtifact> {
  const { db } = await openDatabase(options.dbPath);
  try {
    applyMigrations(db);
    const experiment = getExperimentById(db, options.experimentId);
    const events = listExperimentEvents(db, experiment.id);
    const metrics = aggregateMeasurementEvents(events);
    const thresholdPlan = parseMeasurementThresholdPlan(experiment.threshold_json);
    const thresholdResults = evaluateThresholdPlan(thresholdPlan, metrics);
    const recommendation = buildMeasurementRecommendation(metrics, thresholdResults);
    const createdAt = new Date().toISOString();
    const snapshot = createMeasurementSnapshot(db, {
      createdAt,
      experimentId: experiment.id,
      metricsJson: JSON.stringify(metrics, null, 2),
      thresholdResultsJson: JSON.stringify(thresholdResults, null, 2),
    });
    const measurementReport = buildMeasurementReport({
      createdAt,
      events,
      experiment,
      metrics,
      recommendation,
      thresholdResults,
    });
    const report = createReport(db, {
      createdAt,
      ideaId: experiment.idea_id,
      jobId: null,
      json: JSON.stringify({ measurement: measurementReport.json, snapshotId: snapshot.id }, null, 2),
      markdown: measurementReport.markdown,
      reportType: REPORT_TYPE,
    });
    const decision = createExperimentDecision(db, {
      createdAt,
      decision: recommendation.decision,
      experimentId: experiment.id,
      reason: recommendation.reason,
      reportId: report.id,
    });
    const artifactDir = join(options.outDir ?? DEFAULT_ARTIFACT_ROOT, String(experiment.idea_id));
    const markdownPath = join(artifactDir, `measurement-experiment-${experiment.id}.md`);
    const jsonPath = join(artifactDir, `measurement-experiment-${experiment.id}.json`);

    await mkdir(artifactDir, { recursive: true });
    await writeFile(markdownPath, `${measurementReport.markdown}\n`);
    await writeFile(
      jsonPath,
      `${JSON.stringify({
        decision,
        measurement: measurementReport.json,
        report: {
          createdAt: report.created_at,
          id: report.id,
          ideaId: report.idea_id,
          jobId: report.job_id,
          reportType: report.report_type,
        },
        snapshot,
      }, null, 2)}\n`,
    );

    return {
      decision,
      jsonPath,
      markdownPath,
      report,
      snapshot,
    };
  } finally {
    db.close();
  }
}

async function getLatestExperimentId(options: { dbPath?: string; ideaId: number }): Promise<number> {
  const { db } = await openDatabase(options.dbPath);
  try {
    applyMigrations(db);
    const latest = listExperimentsByIdea(db, options.ideaId)[0];
    if (!latest) {
      throw new Error(`No measurement experiments found for idea ${options.ideaId}.`);
    }

    return latest.id;
  } finally {
    db.close();
  }
}

function latestPaymentTestReport(db: DatabaseSync, ideaId: number): ReportRow {
  const report = listReportsByIdea(db, ideaId).find((item) => item.report_type === 'payment_test_spec');
  if (!report) {
    throw new Error(`No payment_test_spec report found for idea ${ideaId}. Run npm run payment-test first.`);
  }

  return report;
}

function parsePaymentTestPayload(report: ReportRow): {
  decision?: string;
  decisionThresholds: unknown[];
  headline?: string;
  testType?: string;
  thresholdAssumptionWarning?: string;
} {
  if (!report.json) {
    throw new Error(`Report ${report.id} does not contain payment-test JSON.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(report.json);
  } catch {
    throw new Error(`Report ${report.id} JSON is invalid.`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Report ${report.id} JSON is not an object.`);
  }

  const paymentTest = (parsed as Record<string, unknown>).paymentTest;
  if (!paymentTest || typeof paymentTest !== 'object') {
    throw new Error(`Report ${report.id} does not include paymentTest data.`);
  }

  const record = paymentTest as Record<string, unknown>;
  if (!Array.isArray(record.decisionThresholds)) {
    throw new Error(`Report ${report.id} paymentTest data has no decisionThresholds array.`);
  }

  return {
    decision: typeof record.decision === 'string' ? record.decision : undefined,
    decisionThresholds: record.decisionThresholds,
    headline: typeof record.headline === 'string' ? record.headline : undefined,
    testType: typeof record.testType === 'string' ? record.testType : undefined,
    thresholdAssumptionWarning: typeof record.thresholdAssumptionWarning === 'string'
      ? record.thresholdAssumptionWarning
      : undefined,
  };
}

function assertExperimentId(value: number | undefined): asserts value is number {
  if (value == null) {
    throw new Error('Pass --experiment-id, or use --create/--latest to select an experiment.');
  }
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a positive integer.');
}
