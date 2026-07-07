import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type {
  CreateExperimentDecisionInput,
  CreateExperimentEventInput,
  CreateExperimentInput,
  CreateMeasurementSnapshotInput,
  ExperimentDecisionRow,
  ExperimentEventRow,
  ExperimentRow,
  MeasurementSnapshotRow,
} from '../schema.js';

export function createExperiment(db: DatabaseSync, input: CreateExperimentInput): ExperimentRow {
  const result = db.prepare(`
    INSERT INTO experiments (
      idea_id,
      report_id,
      experiment_type,
      title,
      status,
      threshold_json,
      created_at,
      launched_at,
      completed_at
    ) VALUES (
      :ideaId,
      :reportId,
      :experimentType,
      :title,
      :status,
      :thresholdJson,
      :createdAt,
      :launchedAt,
      :completedAt
    )
  `).run({
    ideaId: input.ideaId,
    reportId: input.reportId ?? null,
    experimentType: input.experimentType,
    title: input.title,
    status: input.status,
    thresholdJson: input.thresholdJson,
    createdAt: input.createdAt,
    launchedAt: input.launchedAt ?? null,
    completedAt: input.completedAt ?? null,
  });

  return getExperimentById(db, Number(result.lastInsertRowid));
}

export function getExperimentById(db: DatabaseSync, id: number): ExperimentRow {
  return expectRow<ExperimentRow>(
    db.prepare('SELECT * FROM experiments WHERE id = ?').get(id),
    `Experiment ${id} was not found.`,
  );
}

export function listExperimentsByIdea(db: DatabaseSync, ideaId: number): ExperimentRow[] {
  return expectRows<ExperimentRow>(
    db.prepare(`
      SELECT *
      FROM experiments
      WHERE idea_id = :ideaId
      ORDER BY created_at DESC, id DESC
    `).all({ ideaId }),
  );
}

export function createExperimentEvents(
  db: DatabaseSync,
  inputs: CreateExperimentEventInput[],
): ExperimentEventRow[] {
  if (inputs.length === 0) {
    return [];
  }

  const insert = db.prepare(`
    INSERT INTO experiment_events (
      experiment_id,
      event_name,
      occurred_at,
      source,
      session_id,
      metadata_json,
      created_at
    ) VALUES (
      :experimentId,
      :eventName,
      :occurredAt,
      :source,
      :sessionId,
      :metadataJson,
      :createdAt
    )
  `);
  const ids: number[] = [];

  db.exec('BEGIN');
  try {
    for (const input of inputs) {
      const result = insert.run({
        experimentId: input.experimentId,
        eventName: input.eventName,
        occurredAt: input.occurredAt,
        source: input.source,
        sessionId: input.sessionId ?? null,
        metadataJson: input.metadataJson ?? null,
        createdAt: input.createdAt,
      });
      ids.push(Number(result.lastInsertRowid));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return ids.map((id) => getExperimentEventById(db, id));
}

export function getExperimentEventById(db: DatabaseSync, id: number): ExperimentEventRow {
  return expectRow<ExperimentEventRow>(
    db.prepare('SELECT * FROM experiment_events WHERE id = ?').get(id),
    `Experiment event ${id} was not found.`,
  );
}

export function listExperimentEvents(db: DatabaseSync, experimentId: number): ExperimentEventRow[] {
  return expectRows<ExperimentEventRow>(
    db.prepare(`
      SELECT *
      FROM experiment_events
      WHERE experiment_id = :experimentId
      ORDER BY occurred_at ASC, id ASC
    `).all({ experimentId }),
  );
}

export function createMeasurementSnapshot(
  db: DatabaseSync,
  input: CreateMeasurementSnapshotInput,
): MeasurementSnapshotRow {
  const result = db.prepare(`
    INSERT INTO measurement_snapshots (
      experiment_id,
      metrics_json,
      threshold_results_json,
      created_at
    ) VALUES (
      :experimentId,
      :metricsJson,
      :thresholdResultsJson,
      :createdAt
    )
  `).run({
    experimentId: input.experimentId,
    metricsJson: input.metricsJson,
    thresholdResultsJson: input.thresholdResultsJson,
    createdAt: input.createdAt,
  });

  return getMeasurementSnapshotById(db, Number(result.lastInsertRowid));
}

export function getMeasurementSnapshotById(db: DatabaseSync, id: number): MeasurementSnapshotRow {
  return expectRow<MeasurementSnapshotRow>(
    db.prepare('SELECT * FROM measurement_snapshots WHERE id = ?').get(id),
    `Measurement snapshot ${id} was not found.`,
  );
}

export function listMeasurementSnapshots(db: DatabaseSync, experimentId: number): MeasurementSnapshotRow[] {
  return expectRows<MeasurementSnapshotRow>(
    db.prepare(`
      SELECT *
      FROM measurement_snapshots
      WHERE experiment_id = :experimentId
      ORDER BY created_at DESC, id DESC
    `).all({ experimentId }),
  );
}

export function createExperimentDecision(
  db: DatabaseSync,
  input: CreateExperimentDecisionInput,
): ExperimentDecisionRow {
  const result = db.prepare(`
    INSERT INTO experiment_decisions (
      experiment_id,
      decision,
      reason,
      report_id,
      created_at
    ) VALUES (
      :experimentId,
      :decision,
      :reason,
      :reportId,
      :createdAt
    )
  `).run({
    experimentId: input.experimentId,
    decision: input.decision,
    reason: input.reason,
    reportId: input.reportId ?? null,
    createdAt: input.createdAt,
  });

  return getExperimentDecisionById(db, Number(result.lastInsertRowid));
}

export function getExperimentDecisionById(db: DatabaseSync, id: number): ExperimentDecisionRow {
  return expectRow<ExperimentDecisionRow>(
    db.prepare('SELECT * FROM experiment_decisions WHERE id = ?').get(id),
    `Experiment decision ${id} was not found.`,
  );
}

export function listExperimentDecisions(db: DatabaseSync, experimentId: number): ExperimentDecisionRow[] {
  return expectRows<ExperimentDecisionRow>(
    db.prepare(`
      SELECT *
      FROM experiment_decisions
      WHERE experiment_id = :experimentId
      ORDER BY created_at DESC, id DESC
    `).all({ experimentId }),
  );
}
