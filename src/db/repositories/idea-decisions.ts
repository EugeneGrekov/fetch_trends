import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type { CreateIdeaDecisionInput, IdeaDecisionRow } from '../schema.js';

export function createIdeaDecision(db: DatabaseSync, input: CreateIdeaDecisionInput): IdeaDecisionRow {
  const result = db.prepare(`
    INSERT INTO idea_decisions (
      idea_id,
      experiment_id,
      report_id,
      decision,
      confidence,
      reason,
      evidence_json,
      next_action,
      created_at
    ) VALUES (
      :ideaId,
      :experimentId,
      :reportId,
      :decision,
      :confidence,
      :reason,
      :evidenceJson,
      :nextAction,
      :createdAt
    )
  `).run({
    confidence: input.confidence,
    createdAt: input.createdAt,
    decision: input.decision,
    evidenceJson: input.evidenceJson,
    experimentId: input.experimentId ?? null,
    ideaId: input.ideaId,
    nextAction: input.nextAction,
    reason: input.reason,
    reportId: input.reportId ?? null,
  });

  return getIdeaDecisionById(db, Number(result.lastInsertRowid));
}

export function getIdeaDecisionById(db: DatabaseSync, id: number): IdeaDecisionRow {
  return expectRow<IdeaDecisionRow>(
    db.prepare('SELECT * FROM idea_decisions WHERE id = ?').get(id),
    `Idea decision ${id} was not found.`,
  );
}

export function listIdeaDecisionsByIdea(db: DatabaseSync, ideaId: number): IdeaDecisionRow[] {
  return expectRows<IdeaDecisionRow>(
    db.prepare(`
      SELECT *
      FROM idea_decisions
      WHERE idea_id = :ideaId
      ORDER BY created_at DESC, id DESC
    `).all({ ideaId }),
  );
}

export function listIdeaDecisionsByExperiment(db: DatabaseSync, experimentId: number): IdeaDecisionRow[] {
  return expectRows<IdeaDecisionRow>(
    db.prepare(`
      SELECT *
      FROM idea_decisions
      WHERE experiment_id = :experimentId
      ORDER BY created_at DESC, id DESC
    `).all({ experimentId }),
  );
}
