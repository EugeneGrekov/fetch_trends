import type {
  AutocompletePredictionRow,
  CompetitorRow,
  EvidenceRow,
  IdeaRow,
  QueryRow,
  ReportRow,
  RevalidationQueueRow,
  RevalidationRunRow,
  ScoreRow,
  SourceRow,
} from '../db/schema.js';

export const REVALIDATION_TASK_TYPES = [
  'refresh_autocomplete',
  'refresh_serp',
  'refresh_competitors',
  'refresh_reviews',
  'refresh_measurement',
  'refresh_score',
  'refresh_report',
  'refresh_portfolio',
] as const;

export type RevalidationTaskType = typeof REVALIDATION_TASK_TYPES[number];

export type RevalidationTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked';

export type RevalidationRunStatus = 'running' | 'completed' | 'failed';

export type StaleEvidenceType =
  | 'autocomplete_prediction'
  | 'serp_result'
  | 'competitor_pricing'
  | 'reviews_complaints'
  | 'measurement_event'
  | 'score_snapshot'
  | 'report_snapshot'
  | 'portfolio_snapshot';

export interface StalenessRule {
  evidenceType: StaleEvidenceType;
  staleAfterDays: number | null;
  taskType: RevalidationTaskType;
  sourceTypes?: string[];
}

export interface StalenessReason {
  type: StaleEvidenceType;
  lastFetchedAt: string | null;
  staleAfterDays: number | null;
  recommendedTask: RevalidationTaskType;
  reason: string;
  ageDays?: number;
}

export interface StalenessResult {
  ideaId: number;
  stale: boolean;
  reasons: StalenessReason[];
  confidenceImpact: 'none' | 'low' | 'medium' | 'high';
}

export interface IdeaEvidenceSnapshot {
  autocompletePredictions: AutocompletePredictionRow[];
  competitors: CompetitorRow[];
  evidence: EvidenceRow[];
  idea: IdeaRow;
  queries: QueryRow[];
  reports: ReportRow[];
  scores: ScoreRow[];
  sources: SourceRow[];
}

export interface RevalidationScanResult {
  queued: RevalidationQueueRow[];
  skippedExisting: Array<{
    ideaId: number;
    taskType: RevalidationTaskType;
    reason: string;
  }>;
  staleResults: StalenessResult[];
  run: RevalidationRunRow;
}

export interface RevalidationRunResult {
  processed: RevalidationQueueRow[];
  reports: ReportRow[];
  run: RevalidationRunRow;
  summaries: RevalidationTaskExecutionSummary[];
}

export interface RevalidationTaskExecutionSummary {
  itemId: number;
  ideaId: number;
  taskType: RevalidationTaskType;
  status: RevalidationTaskStatus;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface RevalidationServiceInput {
  country: string;
  idea: IdeaRow;
  language: string;
  now: string;
  queries: QueryRow[];
  queueItem: RevalidationQueueRow;
}

export interface RevalidationSourceDraft {
  fetchedAt?: string;
  snippet?: string | null;
  sourceType: string;
  title?: string | null;
  url: string;
}

export interface RevalidationAutocompletePredictionDraft {
  country?: string;
  createdAt?: string;
  language?: string;
  prediction: string;
  sourcePrefix?: string;
  sourceSeed?: string;
}

export interface RevalidationCompetitorDraft {
  createdAt?: string;
  name: string;
  priceText?: string | null;
  pricingModel?: string | null;
  productType?: string | null;
  reviewSummary?: string | null;
  strengths?: string[];
  url: string;
  weaknesses?: string[];
}

export interface RevalidationServiceResult {
  autocompletePredictions?: RevalidationAutocompletePredictionDraft[];
  competitors?: RevalidationCompetitorDraft[];
  message?: string;
  metadata?: Record<string, unknown>;
  sources?: RevalidationSourceDraft[];
  status: 'completed' | 'blocked' | 'skipped';
}

export interface RevalidationTaskService {
  refresh(input: RevalidationServiceInput): Promise<RevalidationServiceResult>;
}

export interface RevalidationServices {
  autocomplete?: RevalidationTaskService;
  competitors?: RevalidationTaskService;
  reviews?: RevalidationTaskService;
  serp?: RevalidationTaskService;
}

export interface RevalidationExecutionOptions {
  country?: string;
  ideaId?: number;
  language?: string;
  limit?: number;
  now?: string;
  services?: RevalidationServices;
}
