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
import type { PortfolioIdeaSnapshot } from './types.js';

export function snapshotFixture(kind: 'strong' | 'validate' | 'park' = 'strong'): PortfolioIdeaSnapshot {
  const idea = kind === 'park' ? ideaRow(3, 'Minimal idea', 'new') : ideaRow(kind === 'validate' ? 2 : 1, kind === 'validate' ? 'Parking location saver' : 'Invoice late fee calculator', 'validated');

  if (kind === 'strong') {
    return {
      competitors: [competitorRow(1)],
      evidence: [evidenceRow(1)],
      idea,
      latestDecision: ideaDecisionRow(1, 'persevere'),
      latestEvidenceAt: '2026-07-08T11:15:00.000Z',
      latestExperiment: experimentRow(1),
      latestExperimentDecision: experimentDecisionRow(1, 'persevere'),
      latestMeasurementMetrics: measurementMetrics(180, 3, 12, 1),
      latestMeasurementSnapshot: measurementSnapshotRow(1),
      latestMeasurementThresholdResults: [],
      latestMeasurementReport: reportRow(11, 'measurement_report'),
      latestPaymentTestReport: reportRow(12, 'payment_test_spec'),
      latestReportAt: '2026-07-08T11:15:00.000Z',
      latestScore: scoreRow(1, 'validate deeper', 84),
      latestSeoPlanReport: reportRow(13, 'seo_plan'),
      latestValidationReport: reportRow(10, 'search-language-validation'),
      predictions: [
        predictionRow(1, 'late fee calculator payment', 'high purchase intent', 95),
        predictionRow(1, 'invoice late fee pricing', 'comparison intent', 89),
      ],
      queries: [queryRow(1), queryRow(2, 'invoice late fee pricing')],
      sources: [sourceRow(1)],
    };
  }

  if (kind === 'validate') {
    return {
      competitors: [],
      evidence: [],
      idea,
      latestDecision: null,
      latestEvidenceAt: '2026-07-08T10:00:00.000Z',
      latestExperiment: null,
      latestExperimentDecision: null,
      latestMeasurementMetrics: null,
      latestMeasurementSnapshot: null,
      latestMeasurementThresholdResults: null,
      latestMeasurementReport: null,
      latestPaymentTestReport: null,
      latestReportAt: '2026-07-08T10:00:00.000Z',
      latestScore: scoreRow(2, 'validate deeper', 61),
      latestSeoPlanReport: null,
      latestValidationReport: reportRow(20, 'search-language-validation'),
      predictions: [predictionRow(2, 'find my parked car', 'problem intent', 82)],
      queries: [queryRow(2, 'find my parked car')],
      sources: [sourceRow(2, 'reddit_thread')],
    };
  }

  return {
    competitors: [],
    evidence: [],
    idea,
    latestDecision: null,
    latestEvidenceAt: '2026-07-08T09:00:00.000Z',
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

function ideaDecisionRow(id: number, decision: string): IdeaDecisionRow {
  return {
    confidence: 'medium',
    created_at: '2026-07-08T10:45:00.000Z',
    decision,
    evidence_json: '{}',
    experiment_id: null,
    id,
    idea_id: id,
    next_action: 'Run a payment-intent test.',
    reason: 'Continue validating.',
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
    reason: 'Continue testing.',
    report_id: null,
  };
}

function measurementSnapshotRow(id: number): MeasurementSnapshotRow {
  return {
    created_at: '2026-07-08T11:10:00.000Z',
    experiment_id: id,
    id,
    metrics_json: JSON.stringify(measurementMetrics(180, 3, 12, 1)),
    threshold_results_json: '[]',
  };
}

function measurementMetrics(
  visitors = 0,
  paymentClick = 0,
  ctaClick = 0,
  replyReceived = 0,
): MeasurementMetrics {
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
      ctaClickRate: visitors === 0 ? null : ctaClick / visitors,
      emailSubmitRate: 0,
      paymentClickRate: visitors === 0 ? null : paymentClick / visitors,
      previewCompleteRate: 0,
      previewStartRate: 0,
      refundRate: 0,
      replyRate: visitors === 0 ? null : replyReceived / visitors,
      supportContactRate: 0,
    },
    totalEvents: visitors + paymentClick + ctaClick + replyReceived,
    visitors,
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

function evidenceRow(id: number): EvidenceRow {
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
