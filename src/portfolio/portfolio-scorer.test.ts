import { describe, expect, it } from 'vitest';
import type {
  AutocompletePredictionRow,
  CompetitorRow,
  EvidenceRow,
  ExperimentDecisionRow,
  ExperimentRow,
  IdeaDecisionRow,
  IdeaRow,
  MeasurementSnapshotRow,
  QueryRow,
  ReportRow,
  ScoreRow,
  SourceRow,
} from '../db/schema.js';
import type { MeasurementMetrics } from '../measurement/types.js';
import { evaluatePortfolioIdea } from './portfolio-scorer.js';
import { rankPortfolioIdeas } from './portfolio-ranker.js';
import type { PortfolioIdeaSnapshot } from './types.js';

describe('portfolio scorer', () => {
  it('scores a strong idea as test_next with practical next action text', () => {
    const idea = evaluatePortfolioIdea(strongSnapshot(), '2026-07-08T12:00:00.000Z');

    expect(idea.bucket).toBe('test_next');
    expect(idea.confidence).toBe('high');
    expect(idea.portfolioScore).toBeGreaterThan(65);
    expect(idea.bestNextAction).toContain('payment-intent test');
    expect(idea.blockingMissingProof).toEqual([]);
  });

  it('keeps missing evidence low-confidence and parked', () => {
    const idea = evaluatePortfolioIdea(minimalSnapshot(), '2026-07-08T12:00:00.000Z');

    expect(idea.bucket).toBe('park');
    expect(idea.confidence).toBe('low');
    expect(idea.blockingMissingProof).toEqual(expect.arrayContaining([
      'No high-intent or comparison-intent autocomplete evidence yet.',
      'No direct payment-click or pricing evidence yet.',
      'No competitor review or pricing evidence yet.',
    ]));
  });

  it('overrides the aggregate score when kill rules are present', () => {
    const idea = evaluatePortfolioIdea(killSnapshot(), '2026-07-08T12:00:00.000Z');

    expect(idea.bucket).toBe('kill');
    expect(idea.killRules.length).toBeGreaterThan(0);
    expect(idea.bestNextAction).toContain('archive this idea');
  });

  it('ranks ideas into practical bucket order', () => {
    const ranked = rankPortfolioIdeas(
      [minimalSnapshot(3), killSnapshot(4), validateDeeperSnapshot(2), strongSnapshot(1)],
      '2026-07-08T12:00:00.000Z',
    );

    expect(ranked.map((idea) => idea.bucket)).toEqual([
      'test_next',
      'validate_deeper',
      'park',
      'kill',
    ]);
    expect(ranked[0]?.title).toBe('Invoice late fee calculator');
  });
});

function strongSnapshot(): PortfolioIdeaSnapshot {
  return snapshot({
    competitors: [competitorRow(1)],
    evidence: [evidenceRow(1, { paymentSignal: 'direct' })],
    latestDecision: ideaDecisionRow(1, 'persevere', 'Keep validating the paid preview.'),
    latestExperiment: experimentRow(1),
    latestExperimentDecision: experimentDecisionRow(1, 'persevere'),
    latestMeasurementMetrics: measurementMetrics(180, 3, 12, 1),
    latestMeasurementSnapshot: measurementSnapshotRow(1),
    latestMeasurementThresholdResults: [],
    latestPaymentTestReport: reportRow(11, 'payment_test_spec'),
    latestReportAt: '2026-07-08T11:15:00.000Z',
    latestScore: scoreRow(1, 'validate deeper', 84),
    latestSeoPlanReport: reportRow(12, 'seo_plan'),
    latestValidationReport: reportRow(10, 'search-language-validation'),
    predictions: [
      predictionRow(1, 'late fee calculator payment', 'high purchase intent', 95),
      predictionRow(1, 'invoice late fee pricing', 'comparison intent', 89),
    ],
    queries: [queryRow(1), queryRow(2, 'invoice late fee pricing')],
    sources: [sourceRow(1)],
    latestEvidenceAt: '2026-07-08T11:15:00.000Z',
  });
}

function measurementMetrics(visitors: number, paymentClick: number, ctaClick: number, replyReceived: number): MeasurementMetrics {
  return {
    eventTotals: {
      checkout_start: 0,
      cta_click: ctaClick,
      email_submit: 0,
      page_view: visitors,
      payment_click: paymentClick,
      preview_complete: 0,
      preview_start: 0,
      pricing_view: ctaClick,
      refund_requested: 0,
      reply_received: replyReceived,
      support_contact: 0,
    },
    firstEventAt: '2026-07-08T10:00:00.000Z',
    funnel: {
      checkoutStart: 0,
      ctaClick: ctaClick,
      emailSubmit: 0,
      pageView: visitors,
      paymentClick: paymentClick,
      previewComplete: 0,
      previewStart: 0,
      pricingView: ctaClick,
      refundRequested: 0,
      replyReceived: replyReceived,
      supportContact: 0,
    },
    lastEventAt: '2026-07-08T11:00:00.000Z',
    missingData: [],
    rates: {
      checkoutStartRate: 0,
      ctaClickRate: ctaClick / visitors,
      emailSubmitRate: 0,
      paymentClickRate: paymentClick / visitors,
      previewCompleteRate: 0,
      previewStartRate: 0,
      refundRate: 0,
      replyRate: replyReceived / visitors,
      supportContactRate: 0,
    },
    totalEvents: visitors + paymentClick + ctaClick + replyReceived,
    visitors,
  };
}

function validateDeeperSnapshot(id: number): PortfolioIdeaSnapshot {
  return snapshot({
    idea: ideaRow(id, 'Parking location saver', 'validated'),
    latestDecision: ideaDecisionRow(id, 'persevere', 'Need one more payment proof.'),
    latestScore: scoreRow(id, 'validate deeper', 61),
    latestValidationReport: reportRow(20 + id, 'search-language-validation'),
    latestReportAt: '2026-07-08T10:00:00.000Z',
    predictions: [
      predictionRow(id, 'find my parked car', 'problem intent', 82),
      predictionRow(id, 'find my parked car pricing', 'comparison intent', 84),
    ],
    queries: [queryRow(id, 'find my parked car')],
    sources: [sourceRow(id, 'reddit_thread')],
    latestEvidenceAt: '2026-07-08T10:00:00.000Z',
  });
}

function minimalSnapshot(id = 2): PortfolioIdeaSnapshot {
  return snapshot({
    idea: ideaRow(id, 'Minimal idea', 'new'),
    latestEvidenceAt: '2026-07-08T09:00:00.000Z',
    latestReportAt: null,
  });
}

function killSnapshot(id = 3): PortfolioIdeaSnapshot {
  return snapshot({
    idea: ideaRow(id, 'Failed idea', 'failed'),
    latestDecision: ideaDecisionRow(id, 'kill', 'No payment signal or customer pain.'),
    latestExperimentDecision: experimentDecisionRow(id, 'kill', 'No conversion signal.'),
    latestMeasurementThresholdResults: [
      {
        classification: 'kill_signal',
        condition: 'No payment clicks after 200 visitors.',
        evidence: ['0 payment clicks'],
        missingData: [],
        rationale: 'Stop the experiment.',
        requirements: {
          ctaClickMaximum: null,
          ctaClickMinimum: null,
          ctaRateUnder: null,
          paymentClickMaximumExclusive: null,
          paymentClickMinimum: null,
          requiresNoPaymentClicks: true,
          requiresNoReplies: false,
          replyMinimum: null,
          visitorFloor: 200,
        },
        signal: 'kill',
      },
    ],
    latestScore: scoreRow(id, 'kill', 12),
    latestValidationReport: reportRow(30 + id, 'search-language-validation'),
    latestReportAt: '2026-07-07T10:00:00.000Z',
    predictions: [predictionRow(id, 'parking app', 'low intent', 22)],
    queries: [queryRow(id, 'parking app')],
    sources: [sourceRow(id, 'forum_thread')],
    latestEvidenceAt: '2026-07-07T10:00:00.000Z',
  });
}

function snapshot(overrides: Partial<PortfolioIdeaSnapshot>): PortfolioIdeaSnapshot {
  const idea = overrides.idea ?? ideaRow(1, 'Invoice late fee calculator', 'validated');

  return {
    competitors: [],
    evidence: [],
    idea,
    latestDecision: null,
    latestEvidenceAt: '2026-07-08T11:00:00.000Z',
    latestExperiment: null,
    latestExperimentDecision: null,
    latestMeasurementMetrics: null,
    latestMeasurementSnapshot: null,
    latestMeasurementThresholdResults: null,
    latestMeasurementReport: null,
    latestPaymentTestReport: null,
    latestReportAt: null,
    latestScore: null,
    latestSeoPlanReport: null,
    latestValidationReport: null,
    predictions: [],
    queries: [],
    sources: [],
    ...overrides,
  };
}

function ideaRow(id: number, title: string, status: string): IdeaRow {
  return {
    business_model: 'one-time payment',
    created_at: '2026-07-07T09:00:00.000Z',
    expected_price: '$29',
    id,
    normalized_json: null,
    platform: 'web',
    raw_description: title,
    status,
    target_market: 'freelancers',
    title,
    updated_at: '2026-07-08T09:00:00.000Z',
  };
}

function reportRow(id: number, reportType: string): ReportRow {
  return {
    created_at: '2026-07-08T10:00:00.000Z',
    id,
    idea_id: 1,
    job_id: null,
    markdown: '# Report',
    json: '{}',
    report_type: reportType,
  };
}

function scoreRow(id: number, decision: string, totalScore: number): ScoreRow {
  return {
    created_at: '2026-07-08T10:30:00.000Z',
    decision,
    id,
    idea_id: id,
    score_json: '{}',
    score_type: 'search-language',
    total_score: totalScore,
  };
}

function ideaDecisionRow(id: number, decision: string, reason: string): IdeaDecisionRow {
  return {
    confidence: decision === 'kill' ? 'high' : 'medium',
    created_at: '2026-07-08T10:45:00.000Z',
    decision,
    evidence_json: '{}',
    experiment_id: null,
    id,
    idea_id: id,
    next_action: 'Run a payment-intent test.',
    reason,
    report_id: null,
  };
}

function experimentRow(id: number): ExperimentRow {
  return {
    completed_at: null,
    created_at: '2026-07-08T10:00:00.000Z',
    experiment_type: 'fake_door',
    id,
    idea_id: id,
    launched_at: '2026-07-08T10:10:00.000Z',
    report_id: null,
    status: 'running',
    threshold_json: '{"thresholds":[]}',
    title: 'Paid preview',
  };
}

function experimentDecisionRow(id: number, decision: string): ExperimentDecisionRow {
  return {
    created_at: '2026-07-08T11:00:00.000Z',
    decision,
    experiment_id: id,
    id,
    reason: decision === 'kill' ? 'No conversion signal.' : 'Continue testing.',
    report_id: null,
  };
}

function measurementSnapshotRow(id: number): MeasurementSnapshotRow {
  return {
    created_at: '2026-07-08T11:10:00.000Z',
    experiment_id: id,
    id,
    metrics_json: JSON.stringify({
      eventTotals: {},
      firstEventAt: null,
      funnel: {
        checkoutStart: 0,
        ctaClick: 0,
        emailSubmit: 0,
        pageView: 0,
        paymentClick: 0,
        previewComplete: 0,
        previewStart: 0,
        pricingView: 0,
        refundRequested: 0,
        replyReceived: 0,
        supportContact: 0,
      },
      lastEventAt: null,
      missingData: [],
      rates: {
        checkoutStartRate: null,
        ctaClickRate: null,
        emailSubmitRate: null,
        paymentClickRate: null,
        previewCompleteRate: null,
        previewStartRate: null,
        refundRate: null,
        replyRate: null,
        supportContactRate: null,
      },
      totalEvents: 0,
      visitors: 0,
    }),
    threshold_results_json: '[]',
  };
}

function predictionRow(id: number, prediction: string, intent: string, confidenceScore: number): AutocompletePredictionRow {
  return {
    confidence_score: confidenceScore,
    country: 'US',
    created_at: '2026-07-08T09:30:00.000Z',
    id,
    intent,
    language: 'en',
    normalized_prediction: prediction,
    prediction,
    query_id: null,
    source_prefix: prediction,
    source_seed: prediction,
    idea_id: id,
  };
}

function queryRow(id: number, query = 'late fee calculator'): QueryRow {
  return {
    created_at: '2026-07-08T09:15:00.000Z',
    id,
    idea_id: id,
    intent_type: 'problem intent',
    normalized_query: query,
    priority_score: 95,
    query,
    source: 'fixture',
  };
}

function evidenceRow(id: number, overrides: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    complaint: 'Users want to pay late fees without sounding harsh.',
    confidence_score: 86,
    created_at: '2026-07-08T09:45:00.000Z',
    id,
    idea_id: id,
    pain_type: 'payment delay',
    payment_signal: 'direct',
    quote: 'I would pay for a better late fee workflow.',
    source_id: id,
    trigger: 'overdue invoices',
    urgency: 'high',
    workaround: 'Manual email templates',
    ...overrides,
  };
}

function sourceRow(id: number, sourceType = 'reddit_thread'): SourceRow {
  return {
    fetched_at: '2026-07-08T09:40:00.000Z',
    id,
    idea_id: id,
    snippet: 'Discussion about late invoice wording.',
    source_type: sourceType,
    title: 'Late invoice wording',
    url: `https://example.test/${id}`,
  };
}

function competitorRow(id: number): CompetitorRow {
  return {
    created_at: '2026-07-08T09:50:00.000Z',
    id,
    idea_id: id,
    name: 'LateFee Pro',
    pricing_model: 'one-time',
    price_text: '$29 one-time',
    product_type: 'direct_competitor',
    review_summary: 'Pricing exists but reviews are sparse.',
    strengths_json: '[]',
    url: 'https://example.test/competitor',
    weaknesses_json: '[]',
  };
}
