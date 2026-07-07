export interface IdeaRow {
  id: number;
  title: string;
  raw_description: string;
  normalized_json: string | null;
  target_market: string | null;
  platform: string | null;
  expected_price: string | null;
  business_model: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: number;
  idea_id: number;
  job_type: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export interface ToolRunRow {
  id: number;
  job_id: number;
  tool_name: string;
  input_json: string;
  output_json: string | null;
  metadata_json: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface QueryRow {
  id: number;
  idea_id: number;
  query: string;
  normalized_query: string;
  intent_type: string | null;
  source: string;
  priority_score: number | null;
  created_at: string;
}

export interface AutocompletePredictionRow {
  id: number;
  idea_id: number;
  query_id: number | null;
  prediction: string;
  normalized_prediction: string;
  intent: string;
  confidence_score: number;
  source_seed: string;
  source_prefix: string;
  country: string;
  language: string;
  created_at: string;
}

export interface ScoreRow {
  id: number;
  idea_id: number;
  score_type: string;
  score_json: string;
  total_score: number;
  decision: string;
  created_at: string;
}

export interface ReportRow {
  id: number;
  idea_id: number;
  job_id: number | null;
  report_type: string;
  markdown: string;
  json: string | null;
  created_at: string;
}

export interface SourceRow {
  id: number;
  idea_id: number;
  url: string;
  source_type: string;
  title: string | null;
  snippet: string | null;
  fetched_at: string;
}

export interface EvidenceRow {
  id: number;
  idea_id: number;
  source_id: number;
  quote: string;
  pain_type: string | null;
  trigger: string | null;
  workaround: string | null;
  complaint: string | null;
  urgency: string | null;
  payment_signal: string | null;
  confidence_score: number | null;
  created_at: string;
}

export interface CompetitorRow {
  id: number;
  idea_id: number;
  name: string;
  url: string;
  product_type: string | null;
  price_text: string | null;
  pricing_model: string | null;
  strengths_json: string | null;
  weaknesses_json: string | null;
  review_summary: string | null;
  created_at: string;
}

export interface ExperimentRow {
  id: number;
  idea_id: number;
  report_id: number | null;
  experiment_type: string;
  title: string;
  status: string;
  threshold_json: string;
  created_at: string;
  launched_at: string | null;
  completed_at: string | null;
}

export interface ExperimentEventRow {
  id: number;
  experiment_id: number;
  event_name: string;
  occurred_at: string;
  source: string;
  session_id: string | null;
  metadata_json: string | null;
  created_at: string;
}

export interface MeasurementSnapshotRow {
  id: number;
  experiment_id: number;
  metrics_json: string;
  threshold_results_json: string;
  created_at: string;
}

export interface ExperimentDecisionRow {
  id: number;
  experiment_id: number;
  decision: string;
  reason: string;
  report_id: number | null;
  created_at: string;
}

export interface IdeaDecisionRow {
  id: number;
  idea_id: number;
  experiment_id: number | null;
  report_id: number | null;
  decision: string;
  confidence: string;
  reason: string;
  evidence_json: string;
  next_action: string;
  created_at: string;
}

export interface RevalidationRuleRow {
  id: number;
  evidence_type: string;
  stale_after_days: number | null;
  task_type: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface RevalidationQueueRow {
  id: number;
  idea_id: number;
  task_type: string;
  status: string;
  reason: string;
  stale_reason_json: string | null;
  run_id: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export interface RevalidationRunRow {
  id: number;
  idea_id: number | null;
  mode: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  summary_json: string | null;
  error_message: string | null;
}

export interface CreateIdeaInput {
  title: string;
  rawDescription: string;
  normalizedJson?: string | null;
  targetMarket?: string | null;
  platform?: string | null;
  expectedPrice?: string | null;
  businessModel?: string | null;
  status?: string;
}

export interface UpdateIdeaInput {
  title?: string;
  rawDescription?: string;
  normalizedJson?: string | null;
  targetMarket?: string | null;
  platform?: string | null;
  expectedPrice?: string | null;
  businessModel?: string | null;
  status?: string;
}

export interface CreateJobInput {
  ideaId: number;
  jobType: string;
  status: string;
  startedAt?: string | null;
}

export interface CreateToolRunInput {
  jobId: number;
  toolName: string;
  inputJson: string;
  metadataJson?: string | null;
  status: string;
  startedAt: string;
}

export interface CreateQueryInput {
  ideaId: number;
  query: string;
  normalizedQuery: string;
  intentType?: string | null;
  source: string;
  priorityScore?: number | null;
  createdAt: string;
}

export interface CreateAutocompletePredictionInput {
  ideaId: number;
  queryId?: number | null;
  prediction: string;
  normalizedPrediction: string;
  intent: string;
  confidenceScore: number;
  sourceSeed: string;
  sourcePrefix: string;
  country: string;
  language: string;
  createdAt: string;
}

export interface CreateScoreInput {
  ideaId: number;
  scoreType: string;
  scoreJson: string;
  totalScore: number;
  decision: string;
  createdAt: string;
}

export interface CreateReportInput {
  ideaId: number;
  jobId?: number | null;
  reportType: string;
  markdown: string;
  json?: string | null;
  createdAt: string;
}

export interface CreateSourceInput {
  ideaId: number;
  url: string;
  sourceType: string;
  title?: string | null;
  snippet?: string | null;
  fetchedAt: string;
}

export interface CreateEvidenceInput {
  ideaId: number;
  sourceId: number;
  quote: string;
  painType?: string | null;
  trigger?: string | null;
  workaround?: string | null;
  complaint?: string | null;
  urgency?: string | null;
  paymentSignal?: string | null;
  confidenceScore?: number | null;
  createdAt: string;
}

export interface CreateCompetitorInput {
  ideaId: number;
  name: string;
  url: string;
  productType?: string | null;
  priceText?: string | null;
  pricingModel?: string | null;
  strengthsJson?: string | null;
  weaknessesJson?: string | null;
  reviewSummary?: string | null;
  createdAt: string;
}

export interface CreateExperimentInput {
  ideaId: number;
  reportId?: number | null;
  experimentType: string;
  title: string;
  status: string;
  thresholdJson: string;
  createdAt: string;
  launchedAt?: string | null;
  completedAt?: string | null;
}

export interface CreateExperimentEventInput {
  experimentId: number;
  eventName: string;
  occurredAt: string;
  source: string;
  sessionId?: string | null;
  metadataJson?: string | null;
  createdAt: string;
}

export interface CreateMeasurementSnapshotInput {
  experimentId: number;
  metricsJson: string;
  thresholdResultsJson: string;
  createdAt: string;
}

export interface CreateExperimentDecisionInput {
  experimentId: number;
  decision: string;
  reason: string;
  reportId?: number | null;
  createdAt: string;
}

export interface CreateIdeaDecisionInput {
  ideaId: number;
  experimentId?: number | null;
  reportId?: number | null;
  decision: string;
  confidence: string;
  reason: string;
  evidenceJson: string;
  nextAction: string;
  createdAt: string;
}

export interface CreateRevalidationQueueInput {
  ideaId: number;
  taskType: string;
  reason: string;
  staleReasonJson?: string | null;
  createdAt: string;
}

export interface CreateRevalidationRunInput {
  ideaId?: number | null;
  mode: string;
  status: string;
  startedAt: string;
}
