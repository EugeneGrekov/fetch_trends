import { describe, expect, it } from 'vitest';
import type { ExperimentEventRow } from '../db/schema.js';
import { aggregateMeasurementEvents } from './metrics-aggregator.js';
import {
  buildMeasurementRecommendation,
  evaluateThresholdPlan,
  parseMeasurementThresholdPlan,
  parseThresholdRequirements,
} from './threshold-evaluator.js';

const THRESHOLD_JSON = JSON.stringify({
  assumptionWarning: 'Exact conversion benchmarks are assumptions until real traffic exists.',
  thresholds: [
    {
      signal: 'strong',
      condition: '100 targeted visitors, 8+ CTA clicks, 2+ payment clicks, and 1+ direct reply asking for access or timing.',
      rationale: 'Continue manual validation.',
    },
    {
      signal: 'weak',
      condition: '100 targeted visitors with 2-7 CTA clicks, fewer than 3 payment clicks, or only generic waitlist emails.',
      rationale: 'Keep testing only if replies sharpen pain.',
    },
    {
      signal: 'kill',
      condition: '200 targeted visitors, under 1% CTA click rate, no payment clicks, and no replies with urgent task context.',
      rationale: 'Stop the payment test.',
    },
  ],
});

describe('measurement threshold evaluator', () => {
  it('parses generated text threshold requirements', () => {
    expect(parseThresholdRequirements('200 targeted visitors, under 1% CTA click rate, no payment clicks, and no replies')).toEqual({
      ctaClickMaximum: null,
      ctaClickMinimum: null,
      ctaRateUnder: 0.01,
      paymentClickMaximumExclusive: null,
      paymentClickMinimum: null,
      replyMinimum: null,
      requiresNoPaymentClicks: true,
      requiresNoReplies: true,
      visitorFloor: 200,
    });
  });

  it('classifies strong behavior and recommends build_mvp conservatively', () => {
    const plan = parseMeasurementThresholdPlan(THRESHOLD_JSON);
    const metrics = aggregateMeasurementEvents([
      ...pageViews(100),
      ...namedEvents('cta_click', 8),
      ...namedEvents('payment_click', 2),
      ...namedEvents('reply_received', 1),
    ]);
    const results = evaluateThresholdPlan(plan, metrics);
    const recommendation = buildMeasurementRecommendation(metrics, results);

    expect(results.map((result) => result.classification)).toContain('strong_signal');
    expect(recommendation.decision).toBe('build_mvp');
  });

  it('keeps empty and low-sample behavior inconclusive', () => {
    const plan = parseMeasurementThresholdPlan(THRESHOLD_JSON);
    const emptyMetrics = aggregateMeasurementEvents([]);
    const lowSampleMetrics = aggregateMeasurementEvents([
      ...pageViews(10),
      ...namedEvents('cta_click', 2),
      ...namedEvents('payment_click', 1),
    ]);

    expect(buildMeasurementRecommendation(emptyMetrics, evaluateThresholdPlan(plan, emptyMetrics)).decision).toBe('inconclusive');
    expect(buildMeasurementRecommendation(lowSampleMetrics, evaluateThresholdPlan(plan, lowSampleMetrics)).decision).toBe('inconclusive');
  });

  it('classifies kill behavior only after the stored visitor floor is met', () => {
    const plan = parseMeasurementThresholdPlan(THRESHOLD_JSON);
    const metrics = aggregateMeasurementEvents(pageViews(200));
    const results = evaluateThresholdPlan(plan, metrics);
    const recommendation = buildMeasurementRecommendation(metrics, results);

    expect(results.map((result) => result.classification)).toContain('kill_signal');
    expect(recommendation.decision).toBe('kill');
  });

  it('does not turn weak click-only data into an optimistic decision', () => {
    const plan = parseMeasurementThresholdPlan(THRESHOLD_JSON);
    const metrics = aggregateMeasurementEvents([
      ...pageViews(100),
      ...namedEvents('cta_click', 3),
    ]);
    const results = evaluateThresholdPlan(plan, metrics);
    const recommendation = buildMeasurementRecommendation(metrics, results);

    expect(results.map((result) => result.classification)).toContain('weak_signal');
    expect(recommendation.decision).toBe('inconclusive');
  });
});

function pageViews(count: number): ExperimentEventRow[] {
  return Array.from({ length: count }, (_, index) => event(index + 1, 'page_view', `s${index + 1}`));
}

function namedEvents(eventName: string, count: number): ExperimentEventRow[] {
  return Array.from({ length: count }, (_, index) => event(10_000 + index, eventName, `s${index + 1}`));
}

function event(id: number, eventName: string, sessionId: string): ExperimentEventRow {
  return {
    created_at: '2026-07-07T10:00:00.000Z',
    event_name: eventName,
    experiment_id: 1,
    id,
    metadata_json: null,
    occurred_at: '2026-07-07T10:00:00.000Z',
    session_id: sessionId,
    source: 'fixture',
  };
}
