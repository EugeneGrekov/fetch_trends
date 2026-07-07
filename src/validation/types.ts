import type { AiExecutor, EvidenceSummaryOutput, FinalReportOutput, IdeaNormalizeOutput, QueryGenerateOutput } from '../ai/types.js';
import type { AutocompleteCollector, Intent, RunReport, UniquePrediction } from '../utilities/autocomplete/types.js';
import type { IdeaRow, JobRow, QueryRow, ReportRow, ScoreRow, ToolRunRow } from '../db/schema.js';

export interface NormalizedIdea {
  cleanedIdea: string;
  title: string;
  keywordTokens: string[];
  targetMarket: string | null;
  platform: string | null;
  expectedPrice: string | null;
  businessModel: string | null;
}

export interface ValidationOptions {
  ai: boolean;
  aiArtifactsDir?: string;
  aiModel?: string;
  aiReasoning?: string;
  idea: string;
  ideaId?: number;
  jobId?: number;
  dbPath?: string;
  outDir?: string;
  targetMarket?: string | null;
  platform?: string | null;
  expectedPrice?: string | null;
  country: string;
  language: string;
  depth: 1 | 2;
  modifiers: string[];
  headless: boolean;
  delayMs: number;
  maxPrefixes: number;
  maxDepth2Prefixes: number;
  keepAiArtifacts: boolean;
}

export interface ValidationDependencies {
  aiExecutor?: AiExecutor;
  createCollector?: (headless: boolean) => AutocompleteCollector;
}

export interface ValidationAiSummary {
  evidenceSummary: EvidenceSummaryOutput;
  finalReport?: FinalReportOutput;
  ideaNormalization?: IdeaNormalizeOutput;
  queryGeneration?: QueryGenerateOutput;
  taskResults: Array<{
    errorMessage?: string;
    status: 'completed' | 'failed' | 'blocked';
    task: string;
    toolRunId?: number;
  }>;
  used: boolean;
  warnings: string[];
}

export interface ValidationScoreBreakdown {
  uniquePredictionCount: number;
  averageConfidence: number;
  intentCounts: Record<Intent, number>;
  highIntentShare: number;
  strongestQueries: Array<{
    query: string;
    intent: Intent;
    confidenceScore: number;
  }>;
}

export interface ValidationScore {
  totalScore: number;
  decision: string;
  breakdown: ValidationScoreBreakdown;
}

export interface ValidationResult {
  ai: ValidationAiSummary;
  dbPath: string;
  outputPath: string;
  idea: IdeaRow;
  job: JobRow;
  toolRun: ToolRunRow;
  queries: QueryRow[];
  autocompleteReport: RunReport;
  score: ScoreRow;
  report: ReportRow;
  markdown: string;
  uniquePredictions: UniquePrediction[];
}
