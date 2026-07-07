import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type { AutocompletePredictionRow, CreateAutocompletePredictionInput } from '../schema.js';

export function createAutocompletePredictions(
  db: DatabaseSync,
  inputs: CreateAutocompletePredictionInput[],
): AutocompletePredictionRow[] {
  const insert = db.prepare(`
    INSERT INTO autocomplete_predictions (
      idea_id,
      query_id,
      prediction,
      normalized_prediction,
      intent,
      confidence_score,
      source_seed,
      source_prefix,
      country,
      language,
      created_at
    ) VALUES (
      :ideaId,
      :queryId,
      :prediction,
      :normalizedPrediction,
      :intent,
      :confidenceScore,
      :sourceSeed,
      :sourcePrefix,
      :country,
      :language,
      :createdAt
    )
  `);
  const select = db.prepare('SELECT * FROM autocomplete_predictions WHERE id = ?');
  const created: AutocompletePredictionRow[] = [];

  for (const input of inputs) {
    const result = insert.run({
      ideaId: input.ideaId,
      queryId: input.queryId ?? null,
      prediction: input.prediction,
      normalizedPrediction: input.normalizedPrediction,
      intent: input.intent,
      confidenceScore: input.confidenceScore,
      sourceSeed: input.sourceSeed,
      sourcePrefix: input.sourcePrefix,
      country: input.country,
      language: input.language,
      createdAt: input.createdAt,
    });
    created.push(
      expectRow<AutocompletePredictionRow>(
        select.get(Number(result.lastInsertRowid)),
        'Inserted autocomplete prediction could not be reloaded.',
      ),
    );
  }

  return created;
}

export function listAutocompletePredictionsByIdea(db: DatabaseSync, ideaId: number): AutocompletePredictionRow[] {
  return expectRows<AutocompletePredictionRow>(
    db.prepare(`
      SELECT *
      FROM autocomplete_predictions
      WHERE idea_id = :ideaId
      ORDER BY confidence_score DESC, normalized_prediction ASC, id ASC
    `).all({ ideaId }),
  );
}
