export type Intent =
  | 'high purchase intent'
  | 'how-to intent'
  | 'comparison intent'
  | 'problem intent'
  | 'low intent';

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
  out: string;
  modifier: string[];
  modifiers: string[];
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
  sourcePrediction?: string;
}

export interface PredictionRecord {
  originalSeed: string;
  sourcePrefix: string;
  prediction: string;
  timestamp: string;
  country: string;
  language: string;
  depth: 1 | 2;
}

export interface UniquePrediction {
  query: string;
  normalizedQuery: string;
  intent: Intent;
  confidenceScore: number;
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
