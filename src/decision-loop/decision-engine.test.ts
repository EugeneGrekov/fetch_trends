import { describe, expect, it } from 'vitest';
import type {
  AutocompletePredictionRow,
  EvidenceRow,
  ExperimentRow,
  IdeaDecisionRow,
  IdeaRow,
  MeasurementSnapshotRow,
  ReportRow,
  ScoreRow,
} from '../db/schema.js';
import {
  buildMeasurementRecommendation,
  evaluateThresholdPlan,
  parseMeasurementThresholdPlan,
} from '../measurement/threshold-evaluator.js';
import type { MeasurementMetrics } from '../measurement/types.js';
import { evaluateDecisionLoop } from './decision-engine.js';
import { buildLearningHistory } from './learning-history.js';
import { generatePivotOptions } from './pivot-generator.js';
import type { DecisionLoopInput } from './types.js';

describe('decision loop engine', () => {
  it('returns build_mvp from strong measurement evidence', () => {
    const input = decisionInput({
      metrics: metricsFixture({ ctaClick: 10, paymentClick: 3, replyReceived: 1, visitors: 140 }),
    });

    const output = evaluateDecisionLoop(input);

    expect(output.decision).toBe('build_mvp');
    expect(output.confidence).toBe('high');
    expect(output.nextAction).toContain('Build a paid-preview MVP');
    expect(output.nextAction).not.toContain('\n');
  });

  it('returns pivot from mixed measurement evidence and narrower pain signals', () => {
    const input = decisionInput({
      evidence: [evidenceFixture()],
      metrics: metricsFixture({ ctaClick: 6, paymentClick: 0, replyReceived: 0, visitors: 220 }),
      predictions: [predictionFixture('client refuses to pay late invoice', 'problem intent')],
    });

    const output = evaluateDecisionLoop(input);

    expect(output.decision).toBe('pivot');
    expect(output.confidence).toBe('medium');
    expect(output.pivotOptions).toHaveLength(3);
    expect(output.nextAction).toContain('Create one landing-page test');
  });

  it('returns kill from clear kill threshold behavior', () => {
    const input = decisionInput({
      metrics: metricsFixture({ ctaClick: 1, paymentClick: 0, replyReceived: 0, visitors: 220 }),
    });

    const output = evaluateDecisionLoop(input);

    expect(output.decision).toBe('kill');
    expect(output.confidence).toBe('high');
    expect(output.reason).toContain('kill threshold');
  });

  it('returns inconclusive for low sample data even when clicks look strong', () => {
    const input = decisionInput({
      metrics: metricsFixture({ ctaClick: 10, paymentClick: 3, replyReceived: 1, visitors: 25 }),
    });

    const output = evaluateDecisionLoop(input);

    expect(output.decision).toBe('inconclusive');
    expect(output.confidence).toBe('low');
    expect(output.reason).toContain('lowest stored visitor threshold is 100');
  });

  it('generates learning history for stored idea evidence and decisions', () => {
    const input = decisionInput({
      priorDecisions: [ideaDecisionFixture()],
      reports: [
        reportFixture(1, 'search-language-validation', '2026-07-07T10:03:00.000Z'),
        reportFixture(2, 'payment_test_spec', '2026-07-07T10:04:00.000Z'),
      ],
      snapshot: measurementSnapshotFixture(),
      score: scoreFixture(),
    });

    const history = buildLearningHistory(input);

    expect(history.map((item) => item.title)).toEqual(expect.arrayContaining([
      'Idea created',
      'Autocomplete evidence stored',
      'External evidence stored',
      'Validation score recorded',
      'Payment-test spec stored',
      'Measurement snapshot stored',
      'Decision recorded',
    ]));
    expect(history[0]?.title).toBe('Idea created');
  });

  it('generates evidence-backed pivot options', () => {
    const input = decisionInput({
      evidence: [evidenceFixture()],
      metrics: metricsFixture({ ctaClick: 5, paymentClick: 0, replyReceived: 0, visitors: 220 }),
      predictions: [predictionFixture('client refuses to pay late invoice', 'problem intent')],
    });

    const pivots = generatePivotOptions(input);

    expect(pivots).toEqual([
      expect.objectContaining({
        exactCustomer: 'freelance designers',
        type: 'narrower_customer',
      }),
      expect.objectContaining({
        exactPain: 'client refuses to pay late invoice',
        type: 'narrower_use_case',
      }),
      expect.objectContaining({
        type: 'different_payment_moment',
      }),
    ]);
  });
});

function decisionInput(overrides: {
  evidence?: EvidenceRow[];
  metrics?: MeasurementMetrics;
  predictions?: AutocompletePredictionRow[];
  priorDecisions?: IdeaDecisionRow[];
  reports?: ReportRow[];
  score?: ScoreRow;
  snapshot?: MeasurementSnapshotRow;
}): DecisionLoopInput {
  const metrics = overrides.metrics ?? metricsFixture({ ctaClick: 6, paymentClick: 0, replyReceived: 0, visitors: 220 });
  const thresholdResults = evaluateThresholdPlan(parseMeasurementThresholdPlan(thresholdJson()), metrics);
  return {
    evidence: overrides.evidence ?? [evidenceFixture()],
    experiment: experimentFixture(),
    idea: ideaFixture(),
    latestPaymentTestReport: reportFixture(3, 'payment_test_spec', '2026-07-07T10:04:00.000Z'),
    latestScore: overrides.score ?? scoreFixture(),
    latestSeoPlanReport: reportFixture(4, 'seo_plan', '2026-07-07T10:05:00.000Z'),
    latestValidationReport: reportFixture(1, 'search-language-validation', '2026-07-07T10:03:00.000Z'),
    measurementMetrics: metrics,
    measurementRecommendation: buildMeasurementRecommendation(metrics, thresholdResults),
    measurementSnapshot: overrides.snapshot ?? measurementSnapshotFixture(),
    predictions: overrides.predictions ?? [predictionFixture('invoice late fee calculator', 'high purchase intent')],
    priorDecisions: overrides.priorDecisions ?? [],
    reports: overrides.reports ?? [reportFixture(1, 'search-language-validation', '2026-07-07T10:03:00.000Z')],
    thresholdResults,
  };
}

function thresholdJson(): string {
  return JSON.stringify({
    thresholds: [
      {
        condition: '100 targeted visitors, 8+ CTA clicks, 2+ payment clicks, and 1+ direct reply asking for access or timing.',
        signal: 'strong',
      },
      {
        condition: '100 targeted visitors with 2-7 CTA clicks, fewer than 3 payment clicks, or only generic waitlist emails.',
        signal: 'weak',
      },
      {
        condition: '200 targeted visitors, under 1% CTA click rate, no payment clicks, and no replies with urgent task context.',
        signal: 'kill',
      },
    ],
  });
}

function metricsFixture(values: {
  ctaClick: number;
  paymentClick: number;
  replyReceived: number;
  visitors: number;
}): MeasurementMetrics {
  const eventTotals = {
    checkout_start: 0,
    cta_click: values.ctaClick,
    email_submit: 0,
    page_view: values.visitors,
    payment_click: values.paymentClick,
    preview_complete: 0,
    preview_start: 0,
    pricing_view: Math.max(values.ctaClick, 0),
    refund_requested: 0,
    reply_received: values.replyReceived,
    support_contact: 0,
  };

  return {
    eventTotals,
    firstEventAt: '2026-07-07T10:00:00.000Z',
    funnel: {
      checkoutStart: eventTotals.checkout_start,
      ctaClick: eventTotals.cta_click,
      emailSubmit: eventTotals.email_submit,
      pageView: eventTotals.page_view,
      paymentClick: eventTotals.payment_click,
      previewComplete: eventTotals.preview_complete,
      previewStart: eventTotals.preview_start,
      pricingView: eventTotals.pricing_view,
      refundRequested: eventTotals.refund_requested,
      replyReceived: eventTotals.reply_received,
      supportContact: eventTotals.support_contact,
    },
    lastEventAt: '2026-07-07T10:30:00.000Z',
    missingData: values.paymentClick === 0 ? ['No payment-intent clicks have been recorded.'] : [],
    rates: {
      checkoutStartRate: 0,
      ctaClickRate: values.ctaClick / values.visitors,
      emailSubmitRate: 0,
      paymentClickRate: values.paymentClick / values.visitors,
      previewCompleteRate: null,
      previewStartRate: 0,
      refundRate: values.paymentClick > 0 ? 0 : null,
      replyRate: null,
      supportContactRate: 0,
    },
    totalEvents: values.visitors + values.ctaClick + values.paymentClick + values.replyReceived,
    visitors: values.visitors,
  };
}

function ideaFixture(): IdeaRow {
  return {
    business_model: 'one-time payment',
    created_at: '2026-07-07T09:00:00.000Z',
    expected_price: '$29',
    id: 1,
    normalized_json: '{"targetMarket":"freelance designers"}',
    platform: 'web',
    raw_description: 'Generate late fee wording and amounts for overdue freelance invoices.',
    status: 'validated',
    target_market: 'freelance designers',
    title: 'Invoice late fee calculator',
    updated_at: '2026-07-07T09:00:00.000Z',
  };
}

function experimentFixture(): ExperimentRow {
  return {
    completed_at: null,
    created_at: '2026-07-07T10:00:00.000Z',
    experiment_type: 'fake_door',
    id: 7,
    idea_id: 1,
    launched_at: '2026-07-07T10:00:00.000Z',
    report_id: 3,
    status: 'running',
    threshold_json: thresholdJson(),
    title: 'Late fee calculator paid preview',
  };
}

function predictionFixture(prediction: string, intent: string): AutocompletePredictionRow {
  return {
    confidence_score: 91,
    country: 'US',
    created_at: '2026-07-07T09:30:00.000Z',
    id: prediction.length,
    idea_id: 1,
    intent,
    language: 'en',
    normalized_prediction: prediction,
    prediction,
    query_id: null,
    source_prefix: prediction,
    source_seed: prediction,
  };
}

function evidenceFixture(): EvidenceRow {
  return {
    complaint: 'Clients refuse to pay late invoices.',
    confidence_score: 88,
    created_at: '2026-07-07T09:40:00.000Z',
    id: 11,
    idea_id: 1,
    pain_type: 'payment delay',
    payment_signal: 'direct',
    quote: 'I would pay for wording that helps me charge late fees without sounding harsh.',
    source_id: 10,
    trigger: 'overdue freelance invoice',
    urgency: 'high',
    workaround: 'manual email templates',
  };
}

function scoreFixture(): ScoreRow {
  return {
    created_at: '2026-07-07T09:50:00.000Z',
    decision: 'validate deeper',
    id: 21,
    idea_id: 1,
    score_json: '{}',
    score_type: 'search-language',
    total_score: 82,
  };
}

function reportFixture(id: number, reportType: string, createdAt: string): ReportRow {
  return {
    created_at: createdAt,
    id,
    idea_id: 1,
    job_id: 1,
    json: '{}',
    markdown: '# Report',
    report_type: reportType,
  };
}

function measurementSnapshotFixture(): MeasurementSnapshotRow {
  return {
    created_at: '2026-07-07T11:00:00.000Z',
    experiment_id: 7,
    id: 31,
    metrics_json: '{}',
    threshold_results_json: '[]',
  };
}

function ideaDecisionFixture(): IdeaDecisionRow {
  return {
    confidence: 'low',
    created_at: '2026-07-07T11:30:00.000Z',
    decision: 'inconclusive',
    evidence_json: '{}',
    experiment_id: 7,
    id: 41,
    idea_id: 1,
    next_action: 'Run the current experiment until 100 targeted visitors are recorded.',
    reason: 'Only 25 visitors are recorded.',
    report_id: 5,
  };
}
