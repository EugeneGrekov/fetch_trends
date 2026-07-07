import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type { CreateEvidenceInput, EvidenceRow } from '../schema.js';

export function createEvidence(db: DatabaseSync, inputs: CreateEvidenceInput[]): EvidenceRow[] {
  const insert = db.prepare(`
    INSERT INTO evidence (
      idea_id,
      source_id,
      quote,
      pain_type,
      trigger,
      workaround,
      complaint,
      urgency,
      payment_signal,
      confidence_score,
      created_at
    ) VALUES (
      :ideaId,
      :sourceId,
      :quote,
      :painType,
      :trigger,
      :workaround,
      :complaint,
      :urgency,
      :paymentSignal,
      :confidenceScore,
      :createdAt
    )
  `);
  const select = db.prepare('SELECT * FROM evidence WHERE id = ?');
  const created: EvidenceRow[] = [];

  for (const input of inputs) {
    const result = insert.run({
      ideaId: input.ideaId,
      sourceId: input.sourceId,
      quote: input.quote,
      painType: input.painType ?? null,
      trigger: input.trigger ?? null,
      workaround: input.workaround ?? null,
      complaint: input.complaint ?? null,
      urgency: input.urgency ?? null,
      paymentSignal: input.paymentSignal ?? null,
      confidenceScore: input.confidenceScore ?? null,
      createdAt: input.createdAt,
    });
    created.push(expectRow<EvidenceRow>(select.get(Number(result.lastInsertRowid)), 'Inserted evidence row could not be reloaded.'));
  }

  return created;
}

export function listEvidenceByIdea(db: DatabaseSync, ideaId: number): EvidenceRow[] {
  return expectRows<EvidenceRow>(
    db.prepare(`
      SELECT *
      FROM evidence
      WHERE idea_id = :ideaId
      ORDER BY confidence_score DESC, id ASC
    `).all({ ideaId }),
  );
}

export function listEvidenceBySource(db: DatabaseSync, sourceId: number): EvidenceRow[] {
  return expectRows<EvidenceRow>(
    db.prepare(`
      SELECT *
      FROM evidence
      WHERE source_id = :sourceId
      ORDER BY confidence_score DESC, id ASC
    `).all({ sourceId }),
  );
}
