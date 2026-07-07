import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type { CompetitorRow, CreateCompetitorInput } from '../schema.js';

export function createCompetitors(db: DatabaseSync, inputs: CreateCompetitorInput[]): CompetitorRow[] {
  const insert = db.prepare(`
    INSERT INTO competitors (
      idea_id,
      name,
      url,
      product_type,
      price_text,
      pricing_model,
      strengths_json,
      weaknesses_json,
      review_summary,
      created_at
    ) VALUES (
      :ideaId,
      :name,
      :url,
      :productType,
      :priceText,
      :pricingModel,
      :strengthsJson,
      :weaknessesJson,
      :reviewSummary,
      :createdAt
    )
  `);
  const select = db.prepare('SELECT * FROM competitors WHERE id = ?');
  const created: CompetitorRow[] = [];

  for (const input of inputs) {
    const result = insert.run({
      ideaId: input.ideaId,
      name: input.name,
      url: input.url,
      productType: input.productType ?? null,
      priceText: input.priceText ?? null,
      pricingModel: input.pricingModel ?? null,
      strengthsJson: input.strengthsJson ?? null,
      weaknessesJson: input.weaknessesJson ?? null,
      reviewSummary: input.reviewSummary ?? null,
      createdAt: input.createdAt,
    });
    created.push(expectRow<CompetitorRow>(select.get(Number(result.lastInsertRowid)), 'Inserted competitor could not be reloaded.'));
  }

  return created;
}

export function listCompetitorsByIdea(db: DatabaseSync, ideaId: number): CompetitorRow[] {
  return expectRows<CompetitorRow>(
    db.prepare(`
      SELECT *
      FROM competitors
      WHERE idea_id = :ideaId
      ORDER BY id ASC
    `).all({ ideaId }),
  );
}
