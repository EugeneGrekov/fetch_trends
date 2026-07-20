export type Intent = string;

export type RunMode = 'organic' | 'modifier';

export type SourceMode = 'organic' | 'modifier';

export type RelevanceStatus = 'relevant' | 'rejected';

export type Platform =
  | 'iPhone'
  | 'Android'
  | 'Google Maps'
  | 'Apple Maps'
  | 'unknown';

export interface CliOptions {
  seed: string[];
  seeds: string[];
  country: string;
  language: string;
  depth: 1 | 2;
  out?: string;
  modifier: string[];
  modifiers: string[];
  mode: RunMode;
  includeDigits: boolean;
  headless: boolean;
  delayMs: number;
  maxPrefixes: number;
  maxDepth2Prefixes: number;
  resume: boolean;
}

export interface RunOptions {
  seeds: string[];
  country: string;
  language: string;
  depth: 1 | 2;
  out: string;
  modifiers: string[];
  mode: RunMode;
  includeDigits: boolean;
  headless: boolean;
  delayMs: number;
  maxPrefixes: number;
  maxDepth2Prefixes: number;
  resume: boolean;
}

export interface CollectContext {
  country: string;
  language: string;
}

export interface AutocompleteCollector {
  collect(prefix: string, context: CollectContext): Promise<string[]>;
  close(): Promise<void>;
}

export interface GeneratedPrefix {
  seed: string;
  prefix: string;
  depth: 1 | 2;
  sourceMode: SourceMode;
  modifierUsed?: string;
  sourcePrediction?: string;
}

export interface PredictionRecord {
  originalSeed: string;
  sourcePrefix: string;
  prediction: string;
  prefixSent: string;
  exactPrediction: string;
  sourceMode: SourceMode;
  modifierUsed?: string;
  predictionRank: number;
  timestamp: string;
  country: string;
  language: string;
  depth: 1 | 2;
}

export interface UniquePrediction {
  query: string;
  exactPrediction: string;
  normalizedQuery: string;
  intent: Intent;
  intentClassification: Intent;
  confidenceScore: number;
  evidenceScore: number;
  averageRank: number;
  sourceMode: SourceMode | 'mixed';
  sourceModes: SourceMode[];
  modifierUsed?: string;
  modifierUsedValues: string[];
  relevanceStatus: RelevanceStatus;
  relevanceGroups: string[];
  rejectionReasons: string[];
  platform: Platform;
  sourceSeeds: string[];
  sourceSeedCount: number;
  sourcePrefixes: string[];
  sourcePrefixCount: number;
  country: string;
  language: string;
  timestamp: string;
  nextValidationStep: string;
}

export interface SeedSummary {
  seed: string;
  prefixesProcessed: number;
  predictionsCollected: number;
  uniquePredictionsCollected: number;
  organicPredictionsFound: number;
  relevantPredictionsFound: number;
  irrelevantPredictionsFound: number;
  repeatedPredictions: number;
  strongestExactSuggestion?: string;
  noSignal: boolean;
  errorCount: number;
  status: 'pending' | 'completed' | 'failed' | 'stopped';
}

export interface RunError {
  seed?: string;
  prefix?: string;
  depth?: 1 | 2;
  message: string;
  code?: string;
  timestamp: string;
}

export interface RunMetadata {
  startedAt: string;
  completedAt?: string;
  country: string;
  language: string;
  depth: 1 | 2;
  modifiers?: string[];
  mode: RunMode;
  includeDigits: boolean;
  delayMs: number;
  maxPrefixes: number;
  maxDepth2Prefixes: number;
  resume: boolean;
  outputPath: string;
  stoppedReason?: string;
}

export interface FinalSummary {
  seedCount: number;
  generatedPrefixCount: number;
  completedPrefixCount: number;
  predictionCount: number;
  uniquePredictionCount: number;
  errorCount: number;
  stopped: boolean;
}

export interface RunReport {
  runMetadata: RunMetadata;
  inputSeeds: string[];
  generatedPrefixes: GeneratedPrefix[];
  collectedPredictions: PredictionRecord[];
  uniqueNormalizedPredictions: UniquePrediction[];
  perSeedSummaries: SeedSummary[];
  errors: RunError[];
  finalSummary: FinalSummary;
}

export interface ResumeState {
  version: 1;
  runMetadata: RunMetadata;
  inputSeeds: string[];
  completedPrefixes: GeneratedPrefix[];
  generatedPrefixes: GeneratedPrefix[];
  collectedPredictions: PredictionRecord[];
  perSeedSummaries: SeedSummary[];
  errors: RunError[];
}

export interface ProgressUpdate {
  currentSeed: string;
  seedIndex: number;
  seedCount: number;
  prefixesProcessed: number;
  prefixesTotal: number;
  predictionsCollected: number;
  uniquePredictionsCollected: number;
}

export type ProgressHandler = (update: ProgressUpdate) => void;
