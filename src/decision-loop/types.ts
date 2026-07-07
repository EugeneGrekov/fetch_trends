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
import type {
  MeasurementMetrics,
  MeasurementRecommendation,
  ThresholdEvaluationResult,
} from '../measurement/types.js';

export const DECISION_LOOP_DECISIONS = [
  'build_mvp',
  'persevere',
  'pivot',
  'validate_deeper',
  'kill',
  'inconclusive',
] as const;

export type DecisionLoopDecision = typeof DECISION_LOOP_DECISIONS[number];

export type DecisionConfidence = 'low' | 'medium' | 'high';

export type PivotType =
  | 'narrower_customer'
  | 'narrower_use_case'
  | 'different_platform'
  | 'different_payment_moment'
  | 'different_distribution_channel'
  | 'lower_trust_workflow'
  | 'simpler_result';

export interface DecisionEvidenceItem {
  detail: string;
  referenceId?: number;
  referenceType?: string;
  source: string;
}

export interface PivotOption {
  exactCustomer: string;
  exactPain: string;
  missingEvidence: string;
  nextExperiment: string;
  type: PivotType;
  whyOriginalEvidencePointsThere: string;
}

export interface LearningHistoryItem {
  detail: string;
  occurredAt: string;
  referenceId?: number;
  referenceType: string;
  title: string;
}

export interface DecisionLoopInput {
  evidence?: EvidenceRow[];
  experiment?: ExperimentRow | null;
  idea: IdeaRow;
  latestMeasurementReport?: ReportRow | null;
  latestPaymentTestReport?: ReportRow | null;
  latestScore?: ScoreRow | null;
  latestSeoPlanReport?: ReportRow | null;
  latestValidationReport?: ReportRow | null;
  measurementMetrics?: MeasurementMetrics | null;
  measurementRecommendation?: MeasurementRecommendation | null;
  measurementSnapshot?: MeasurementSnapshotRow | null;
  predictions?: AutocompletePredictionRow[];
  priorDecisions?: IdeaDecisionRow[];
  reports?: ReportRow[];
  thresholdResults?: ThresholdEvaluationResult[];
}

export interface DecisionLoopOutput {
  confidence: DecisionConfidence;
  decision: DecisionLoopDecision;
  evidence: DecisionEvidenceItem[];
  learningHistory: LearningHistoryItem[];
  missingProof: string[];
  nextAction: string;
  pivotOptions: PivotOption[];
  reason: string;
  whatWouldChangeDecision: string[];
}

export interface DecisionMemo {
  json: {
    confidence: DecisionConfidence;
    decision: DecisionLoopDecision;
    evidence: DecisionEvidenceItem[];
    experimentId: number | null;
    ideaId: number;
    learningHistory: LearningHistoryItem[];
    missingProof: string[];
    nextAction: string;
    pivotOptions: PivotOption[];
    priorDecisions: Array<{
      createdAt: string;
      decision: string;
      id: number;
      reason: string;
    }>;
    reason: string;
    whatWouldChangeDecision: string[];
  };
  markdown: string;
}
