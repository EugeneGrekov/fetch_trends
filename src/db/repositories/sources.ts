import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type { CreateSourceInput, SourceRow } from '../schema.js';

export function createSources(db: DatabaseSync, inputs: CreateSourceInput[]): SourceRow[] {
  const insert = db.prepare(`
    INSERT INTO sources (
      idea_id,
      url,
      source_type,
      title,
      snippet,
      fetched_at
    ) VALUES (
      :ideaId,
      :url,
      :sourceType,
      :title,
      :snippet,
      :fetchedAt
    )
  `);
  const select = db.prepare('SELECT * FROM sources WHERE id = ?');
  const created: SourceRow[] = [];

  for (const input of inputs) {
    const result = insert.run({
      ideaId: input.ideaId,
      url: input.url,
      sourceType: input.sourceType,
      title: input.title ?? null,
      snippet: input.snippet ?? null,
      fetchedAt: input.fetchedAt,
    });
    created.push(expectRow<SourceRow>(select.get(Number(result.lastInsertRowid)), 'Inserted source could not be reloaded.'));
  }

  return created;
}

export function listSourcesByIdea(db: DatabaseSync, ideaId: number): SourceRow[] {
  return expectRows<SourceRow>(
    db.prepare(`
      SELECT *
      FROM sources
      WHERE idea_id = :ideaId
      ORDER BY fetched_at DESC, id DESC
    `).all({ ideaId }),
  );
}
