import { describe, expect, it } from 'vitest';
import type { ExperimentEventRow } from '../db/schema.js';
import { aggregateMeasurementEvents } from './metrics-aggregator.js';

describe('measurement metrics aggregator', () => {
  it('aggregates funnel counts and rates from raw events', () => {
    const metrics = aggregateMeasurementEvents([
      event(1, 'page_view', 's1'),
      event(2, 'pricing_view', 's1'),
      event(3, 'cta_click', 's1'),
      event(4, 'page_view', 's2'),
      event(5, 'payment_click', 's2'),
      event(6, 'email_submit', 's2'),
      event(7, 'reply_received', 's2'),
    ]);

    expect(metrics.visitors).toBe(2);
    expect(metrics.funnel).toEqual(expect.objectContaining({
      ctaClick: 1,
      emailSubmit: 1,
      paymentClick: 1,
      replyReceived: 1,
    }));
    expect(metrics.rates.ctaClickRate).toBe(0.5);
    expect(metrics.rates.paymentClickRate).toBe(0.5);
    expect(metrics.rates.replyRate).toBe(1);
    expect(metrics.firstEventAt).toBe('2026-07-07T10:01:00.000Z');
    expect(metrics.lastEventAt).toBe('2026-07-07T10:07:00.000Z');
  });

  it('keeps empty data inconclusive-ready', () => {
    const metrics = aggregateMeasurementEvents([]);

    expect(metrics.visitors).toBe(0);
    expect(metrics.totalEvents).toBe(0);
    expect(metrics.rates.ctaClickRate).toBeNull();
    expect(metrics.missingData).toContain('No experiment events have been recorded.');
  });
});

function event(id: number, eventName: string, sessionId: string): ExperimentEventRow {
  return {
    created_at: '2026-07-07T10:00:00.000Z',
    event_name: eventName,
    experiment_id: 1,
    id,
    metadata_json: null,
    occurred_at: `2026-07-07T10:0${id}:00.000Z`,
    session_id: sessionId,
    source: 'fixture',
  };
}
