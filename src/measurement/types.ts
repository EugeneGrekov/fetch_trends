import type { ExperimentEventRow, ExperimentRow } from '../db/schema.js';

export const MEASUREMENT_EVENT_NAMES = [
  'page_view',
  'pricing_view',
  'cta_click',
  'preview_start',
  'preview_complete',
  'checkout_start',
  'payment_click',
  'email_submit',
  'reply_received',
  'refund_requested',
  'support_contact',
] as const;

export type MeasurementEventName = typeof MEASUREMENT_EVENT_NAMES[number];

export type ThresholdClassification = 'strong_signal' | 'weak_signal' | 'kill_signal' | 'inconclusive';

export type MeasurementDecision =
  | 'continue_test'
  | 'build_mvp'
  | 'validate_deeper'
  | 'pivot'
  | 'kill'
  | 'inconclusive';

export interface ManualMeasurementEvent {
  eventName: MeasurementEventName;
  occurredAt: string;
  source: string;
  sessionId?: string | null;
  metadataJson?: string | null;
}

export interface MeasurementFunnel {
  pageView: number;
  pricingView: number;
  ctaClick: number;
  previewStart: number;
  previewComplete: number;
  checkoutStart: number;
  paymentClick: number;
  emailSubmit: number;
  replyReceived: number;
  refundRequested: number;
  supportContact: number;
}

export interface MeasurementRates {
  ctaClickRate: number | null;
  previewStartRate: number | null;
  previewCompleteRate: number | null;
  checkoutStartRate: number | null;
  paymentClickRate: number | null;
  emailSubmitRate: number | null;
  replyRate: number | null;
  refundRate: number | null;
  supportContactRate: number | null;
}

export interface MeasurementMetrics {
  visitors: number;
  eventTotals: Record<MeasurementEventName, number>;
  funnel: MeasurementFunnel;
  rates: MeasurementRates;
  totalEvents: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  missingData: string[];
}

export interface MeasurementThreshold {
  signal: 'strong' | 'weak' | 'kill';
  condition: string;
  rationale?: string;
}

export interface MeasurementThresholdPlan {
  assumptionWarning?: string;
  thresholds: MeasurementThreshold[];
}

export interface ParsedThresholdRequirements {
  visitorFloor: number | null;
  ctaClickMinimum: number | null;
  ctaClickMaximum: number | null;
  ctaRateUnder: number | null;
  paymentClickMinimum: number | null;
  paymentClickMaximumExclusive: number | null;
  requiresNoPaymentClicks: boolean;
  replyMinimum: number | null;
  requiresNoReplies: boolean;
}

export interface ThresholdEvaluationResult {
  classification: ThresholdClassification;
  condition: string;
  evidence: string[];
  missingData: string[];
  rationale: string | null;
  requirements: ParsedThresholdRequirements;
  signal: 'strong' | 'weak' | 'kill';
}

export interface MeasurementRecommendation {
  decision: MeasurementDecision;
  reason: string;
  missingData: string[];
  strongSignals: string[];
  weakSignals: string[];
  killSignals: string[];
}

export interface MeasurementReportInput {
  createdAt: string;
  events: ExperimentEventRow[];
  experiment: ExperimentRow;
  metrics: MeasurementMetrics;
  recommendation: MeasurementRecommendation;
  thresholdResults: ThresholdEvaluationResult[];
}

export interface MeasurementReport {
  json: {
    createdAt: string;
    decision: MeasurementDecision;
    events: {
      imported: number;
      firstEventAt: string | null;
      lastEventAt: string | null;
    };
    experiment: {
      id: number;
      ideaId: number;
      reportId: number | null;
      title: string;
      type: string;
      status: string;
    };
    metrics: MeasurementMetrics;
    recommendation: MeasurementRecommendation;
    thresholdResults: ThresholdEvaluationResult[];
  };
  markdown: string;
}
