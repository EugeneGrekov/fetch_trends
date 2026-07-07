export type AiTaskName =
  | 'idea_normalize'
  | 'query_generate'
  | 'evidence_summarize'
  | 'score_explain'
  | 'final_report';

export type AiRunStatus = 'completed' | 'failed' | 'blocked';

export interface IdeaNormalizeInput {
  rawIdea: string;
  targetMarket?: string | null;
  expectedPrice?: string | null;
  platform?: string | null;
}

export interface IdeaNormalizeOutput {
  title: string;
  user: string;
  pain: string;
  trigger: string;
  current_workarounds: string[];
  desired_result: string;
  business_model: string;
  price_range: string;
  category: string;
  assumptions: string[];
}

export interface AiGeneratedQuery {
  query: string;
  intent: string;
  priority: number;
  reason: string;
}

export interface QueryGenerateInput {
  normalizedIdea: Record<string, unknown>;
  targetMarket?: string | null;
  queryCount: number;
}

export interface QueryGenerateOutput {
  queries: AiGeneratedQuery[];
}

export interface EvidenceSummaryInput {
  idea: Record<string, unknown>;
  autocompletePredictions: Array<Record<string, unknown>>;
  scores: Record<string, unknown>;
}

export interface EvidenceSummaryOutput {
  facts: string[];
  inferences: string[];
  assumptions: string[];
  missingProof: string[];
  redFlags: string[];
}

export interface FinalReportInput {
  idea: Record<string, unknown>;
  evidenceSummary: EvidenceSummaryOutput;
  scores: Record<string, unknown>;
  autocompletePredictions: Array<Record<string, unknown>>;
}

export interface FinalReportOutput {
  verdict: string;
  markdown: string;
  nextAction: string;
}

export interface ScoreExplainInput {
  score: Record<string, unknown>;
  evidenceSummary: EvidenceSummaryOutput;
}

export interface ScoreExplainOutput {
  explanation: string;
  strongestSignals: string[];
  weakestSignals: string[];
}

export interface AiExecutionRequest {
  isolationDir: string;
  outputPath: string;
  prompt: string;
  model?: string;
  reasoning?: string;
}

export interface AiExecutionResult {
  command: string[];
  durationMs: number;
  exitCode: number;
  outputPath: string;
  stderr: string;
  stdout: string;
}

export interface AiExecutor {
  execute(request: AiExecutionRequest): Promise<AiExecutionResult>;
}

export interface AiArtifactPaths {
  inputJsonPath?: string;
  metadataJsonPath?: string;
  outputTextPath?: string;
  promptTextPath?: string;
}

export interface AiRunMetadata {
  artifacts: AiArtifactPaths;
  command?: string[];
  durationMs?: number;
  executor: 'codex';
  model?: string;
  outputKept: boolean;
  promptFile: string;
  reasoning?: string;
  task: AiTaskName;
}

export interface RunAiTaskOptions<TInput> {
  artifactsRoot: string;
  dbPath?: string;
  input: TInput;
  jobId: number;
  keepArtifacts: boolean;
  model?: string;
  reasoning?: string;
  task: AiTaskName;
}

export interface RunAiTaskResult<TOutput> {
  errorMessage?: string;
  metadata: AiRunMetadata;
  output?: TOutput;
  rawOutput?: string;
  status: AiRunStatus;
  toolRunId: number;
}
