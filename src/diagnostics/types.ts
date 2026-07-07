export type DiagnosticStatus = 'pass' | 'warn' | 'fail' | 'skip';

export type DiagnosticCategory =
  | 'configuration'
  | 'database'
  | 'jobs'
  | 'collectors'
  | 'artifacts'
  | 'commands';

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
  category: DiagnosticCategory;
  details?: Record<string, unknown>;
  nextAction?: string;
}

export interface DiagnosticSummary {
  pass: number;
  warn: number;
  fail: number;
  skip: number;
}

export interface DiagnosticReport {
  generatedAt: string;
  status: DiagnosticStatus;
  summary: DiagnosticSummary;
  checks: DiagnosticCheck[];
  nextActions: string[];
}

export interface DiagnosticRunOptions {
  artifactsDir?: string;
  backupDir?: string;
  cwd?: string;
  dbPath?: string;
  env?: Record<string, string | undefined>;
  exportDir?: string;
  generatedAt?: Date;
  largeArtifactBytes?: number;
  live?: boolean;
  packageJsonPath?: string;
  resultsDir?: string;
}

export interface DiagnosticContext {
  artifactsDir: string;
  backupDir?: string;
  cwd: string;
  dbPath: string;
  env: Record<string, string | undefined>;
  exportDir?: string;
  generatedAt: Date;
  largeArtifactBytes: number;
  live: boolean;
  packageJsonPath: string;
  resultsDir: string;
}

export const DEFAULT_ARTIFACTS_DIR = './artifacts';
export const DEFAULT_LARGE_ARTIFACT_BYTES = 100 * 1024 * 1024;
export const DEFAULT_RESULTS_DIR = './results';
