import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type { CreateScoreInput, ScoreRow } from '../schema.js';

export function createScore(db: DatabaseSync, input: CreateScoreInput): ScoreRow {
  const result = db.prepare(`
    INSERT INTO scores (
      idea_id,
      score_type,
      score_json,
      total_score,
      decision,
      created_at
    ) VALUES (
      :ideaId,
      :scoreType,
      :scoreJson,
      :totalScore,
      :decision,
      :createdAt
    )
  `).run({
    ideaId: input.ideaId,
    scoreType: input.scoreType,
    scoreJson: input.scoreJson,
    totalScore: input.totalScore,
    decision: input.decision,
    createdAt: input.createdAt,
  });

  return getScoreById(db, Number(result.lastInsertRowid));
}

export function getScoreById(db: DatabaseSync, id: number): ScoreRow {
  return expectRow<ScoreRow>(db.prepare('SELECT * FROM scores WHERE id = ?').get(id), `Score ${id} was not found.`);
}

export function listScoresByIdea(db: DatabaseSync, ideaId: number): ScoreRow[] {
  return expectRows<ScoreRow>(
    db.prepare(`
      SELECT *
      FROM scores
      WHERE idea_id = :ideaId
      ORDER BY created_at DESC, id DESC
    `).all({ ideaId }),
  );
}
