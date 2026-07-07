import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type { CreateQueryInput, QueryRow } from '../schema.js';

export function createQueries(db: DatabaseSync, inputs: CreateQueryInput[]): QueryRow[] {
  const insert = db.prepare(`
    INSERT INTO queries (
      idea_id,
      query,
      normalized_query,
      intent_type,
      source,
      priority_score,
      created_at
    ) VALUES (
      :ideaId,
      :query,
      :normalizedQuery,
      :intentType,
      :source,
      :priorityScore,
      :createdAt
    )
  `);
  const select = db.prepare('SELECT * FROM queries WHERE id = ?');
  const created: QueryRow[] = [];

  for (const input of inputs) {
    const result = insert.run({
      ideaId: input.ideaId,
      query: input.query,
      normalizedQuery: input.normalizedQuery,
      intentType: input.intentType ?? null,
      source: input.source,
      priorityScore: input.priorityScore ?? null,
      createdAt: input.createdAt,
    });
    created.push(expectRow<QueryRow>(select.get(Number(result.lastInsertRowid)), 'Inserted query could not be reloaded.'));
  }

  return created;
}

export function listQueriesByIdea(db: DatabaseSync, ideaId: number): QueryRow[] {
  return expectRows<QueryRow>(
    db.prepare(`
      SELECT *
      FROM queries
      WHERE idea_id = :ideaId
      ORDER BY priority_score DESC, id ASC
    `).all({ ideaId }),
  );
}
