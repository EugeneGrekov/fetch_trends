import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type { CreateIdeaInput, IdeaRow, UpdateIdeaInput } from '../schema.js';

export function createIdea(db: DatabaseSync, input: CreateIdeaInput): IdeaRow {
  const timestamp = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO ideas (
      title,
      raw_description,
      normalized_json,
      target_market,
      platform,
      expected_price,
      business_model,
      status,
      created_at,
      updated_at
    ) VALUES (
      :title,
      :rawDescription,
      :normalizedJson,
      :targetMarket,
      :platform,
      :expectedPrice,
      :businessModel,
      :status,
      :createdAt,
      :updatedAt
    )
  `).run({
    title: input.title,
    rawDescription: input.rawDescription,
    normalizedJson: input.normalizedJson ?? null,
    targetMarket: input.targetMarket ?? null,
    platform: input.platform ?? null,
    expectedPrice: input.expectedPrice ?? null,
    businessModel: input.businessModel ?? null,
    status: input.status ?? 'new',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return getIdeaById(db, Number(result.lastInsertRowid));
}

export function getIdeaById(db: DatabaseSync, id: number): IdeaRow {
  return expectRow<IdeaRow>(db.prepare('SELECT * FROM ideas WHERE id = ?').get(id), `Idea ${id} was not found.`);
}

export function listIdeas(db: DatabaseSync, limit = 25): IdeaRow[] {
  return expectRows<IdeaRow>(
    db.prepare(`
      SELECT *
      FROM ideas
      ORDER BY updated_at DESC, id DESC
      LIMIT :limit
    `).all({ limit }),
  );
}

export function updateIdea(db: DatabaseSync, id: number, input: UpdateIdeaInput): IdeaRow {
  const current = getIdeaById(db, id);

  db.prepare(`
    UPDATE ideas
    SET title = :title,
        raw_description = :rawDescription,
        normalized_json = :normalizedJson,
        target_market = :targetMarket,
        platform = :platform,
        expected_price = :expectedPrice,
        business_model = :businessModel,
        status = :status,
        updated_at = :updatedAt
    WHERE id = :id
  `).run({
    id,
    title: input.title ?? current.title,
    rawDescription: input.rawDescription ?? current.raw_description,
    normalizedJson: input.normalizedJson ?? current.normalized_json,
    targetMarket: input.targetMarket ?? current.target_market,
    platform: input.platform ?? current.platform,
    expectedPrice: input.expectedPrice ?? current.expected_price,
    businessModel: input.businessModel ?? current.business_model,
    status: input.status ?? current.status,
    updatedAt: new Date().toISOString(),
  });

  return getIdeaById(db, id);
}
