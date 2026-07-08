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
import type {
  MeasurementMetrics,
  ThresholdEvaluationResult,
} from '../measurement/types.js';

export const PORTFOLIO_BUCKETS = [
  'test_next',
  'validate_deeper',
  'watch',
  'park',
  'kill',
] as const;

export type PortfolioBucket = typeof PORTFOLIO_BUCKETS[number];

export type PortfolioConfidence = 'low' | 'medium' | 'high';

export interface PortfolioDimensionScores {
  evidenceStrength: number;
  searchIntentStrength: number;
  paymentSignalStrength: number;
  technicalSimplicity: number;
  trustSupportSimplicity: number;
  testCostEase: number;
  decisionClarity: number;
  recency: number;
}

export interface PortfolioIdeaSnapshot {
  idea: IdeaRow;
  latestDecision: IdeaDecisionRow | null;
  latestEvidenceAt: string | null;
  latestExperiment: ExperimentRow | null;
  latestExperimentDecision: ExperimentDecisionRow | null;
  latestMeasurementMetrics: MeasurementMetrics | null;
  latestMeasurementSnapshot: MeasurementSnapshotRow | null;
  latestMeasurementThresholdResults: ThresholdEvaluationResult[] | null;
  latestMeasurementReport: ReportRow | null;
  latestPaymentTestReport: ReportRow | null;
  latestReportAt: string | null;
  latestScore: ScoreRow | null;
  latestSeoPlanReport: ReportRow | null;
  latestValidationReport: ReportRow | null;
  predictions: AutocompletePredictionRow[];
  queries: QueryRow[];
  evidence: EvidenceRow[];
  sources: SourceRow[];
  competitors: CompetitorRow[];
}

export interface PortfolioIdeaRanking {
  bestNextAction: string;
  blockingMissingProof: string[];
  bucket: PortfolioBucket;
  confidence: PortfolioConfidence;
  costToTestEstimate: string;
  decisionClarity: number;
  dimensions: PortfolioDimensionScores;
  ideaId: number;
  killRules: string[];
  latestEvidenceAt: string | null;
  latestReportAt: string | null;
  latestDecision: string | null;
  latestExperimentDecision: string | null;
  portfolioScore: number;
  reason: string;
  title: string;
}

export interface PortfolioComparisonFilters {
  includeKilled: boolean;
  limit: number;
  status: string | null;
}

export interface PortfolioComparisonInput {
  filters: PortfolioComparisonFilters;
  generatedAt: string;
  ideaIds: number[];
  rankedIdeas: PortfolioIdeaRanking[];
}

export interface PortfolioComparisonReport {
  json: {
    bucketCounts: Record<PortfolioBucket, number>;
    crossIdeaRisks: string[];
    filters: PortfolioComparisonFilters;
    generatedAt: string;
    ideaIds: number[];
    primaryIdeaId: number;
    rankedIdeas: PortfolioIdeaRanking[];
    recommendedNextValidationCycle: string;
    report: {
      createdAt: string;
      id: number;
      ideaId: number;
      reportType: string;
    };
    sharedMissingProof: string[];
    summary: {
      ideaCount: number;
      topNextAction: string;
    };
    topIdeasToTestNext: PortfolioIdeaRanking[];
    ideasToValidateDeeper: PortfolioIdeaRanking[];
    ideasToWatch: PortfolioIdeaRanking[];
    ideasToPark: PortfolioIdeaRanking[];
    ideasToKill: PortfolioIdeaRanking[];
  };
  markdown: string;
}
