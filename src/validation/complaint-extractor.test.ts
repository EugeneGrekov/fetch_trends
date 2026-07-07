import { describe, expect, it } from 'vitest';
import { extractEvidenceFromSource } from './complaint-extractor.js';

describe('complaint extractor', () => {
  it('extracts quote-backed complaint and payment evidence from a review snippet', () => {
    const evidence = extractEvidenceFromSource({
      createdAt: '2026-07-07T10:00:00.000Z',
      ideaId: 1,
      source: {
        id: 2,
        source_type: 'review_page',
        title: 'Parking App Reviews',
        snippet: 'Paid app but users say it stops working and ask for a refund. Manual workaround is to open it first.',
      },
    });

    expect(evidence).toEqual([
      expect.objectContaining({
        quote: expect.stringContaining('stops working'),
        complaint: 'reliability',
        paymentSignal: 'strong',
      }),
    ]);
  });
});
