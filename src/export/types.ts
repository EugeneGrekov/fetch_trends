import type { AppliedMigration } from '../db/migrations.js';
import type {
  AutocompletePredictionRow,
  CompetitorRow,
  EvidenceRow,
  ExperimentDecisionRow,
  ExperimentEventRow,
  ExperimentRow,
  IdeaDecisionRow,
  IdeaRow,
  JobRow,
  MeasurementSnapshotRow,
  QueryRow,
  RevalidationQueueRow,
  RevalidationRunRow,
  ReportRow,
  ScoreRow,
  SourceRow,
  ToolRunRow,
} from '../db/schema.js';

export const FETCH_TRENDS_APP_NAME = 'fetch-trends';
export const EXPORT_BUNDLE_VERSION = 1;
export const BACKUP_MANIFEST_VERSION = 1;

export type ExportBundleType = 'idea_bundle' | 'portfolio_bundle';
export type ExportFormat = 'json' | 'markdown';
export type RedactionMode = 'none' | 'basic' | 'strict';

export interface ExportBundleManifest {
  app: typeof FETCH_TRENDS_APP_NAME;
  bundleType: ExportBundleType;
  createdAt: string;
  files: ExportBundleFile[];
  ideaIds: number[];
  redaction: RedactionMode;
  version: typeof EXPORT_BUNDLE_VERSION;
}

export interface ExportBundleFile {
  description: string;
  path: string;
  sizeBytes: number;
}

export interface IdeaExportJob {
  job: JobRow;
  toolRuns: ToolRunRow[];
}

export interface IdeaExportExperiment {
  decisions: ExperimentDecisionRow[];
  events: ExperimentEventRow[];
  experiment: ExperimentRow;
  measurementSnapshots: MeasurementSnapshotRow[];
}

export interface IdeaExportBundleData {
  appliedMigrations: AppliedMigration[];
  autocompletePredictions: AutocompletePredictionRow[];
  competitors: CompetitorRow[];
  evidence: EvidenceRow[];
  experiments: IdeaExportExperiment[];
  idea: IdeaRow;
  ideaDecisions: IdeaDecisionRow[];
  jobs: IdeaExportJob[];
  queries: QueryRow[];
  revalidationQueue: RevalidationQueueRow[];
  revalidationRuns: RevalidationRunRow[];
  reports: ReportRow[];
  scores: ScoreRow[];
  sources: SourceRow[];
  artifactPaths: string[];
}

export interface PortfolioIdeaSummary {
  bestNextAction: string;
  idea: IdeaRow;
  latestDecision: IdeaDecisionRow | null;
  latestReport: ReportRow | null;
  latestScore: ScoreRow | null;
  portfolioBucket: string;
}

export interface PortfolioExportBundleData {
  ideas: PortfolioIdeaSummary[];
}

export interface IdeaExportBundle {
  export: {
    data: IdeaExportBundleData;
    type: 'idea';
  };
  manifest: ExportBundleManifest;
}

export interface PortfolioExportBundle {
  export: {
    data: PortfolioExportBundleData;
    type: 'portfolio';
  };
  manifest: ExportBundleManifest;
}

export interface BackupComponentManifest {
  fileCount: number;
  included: boolean;
  name: 'artifacts' | 'reports';
  sourcePath: string | null;
  targetPath: string;
  totalBytes: number;
}

export interface BackupManifest {
  app: typeof FETCH_TRENDS_APP_NAME;
  backupType: 'full_backup';
  components: BackupComponentManifest[];
  createdAt: string;
  db: {
    fileName: string;
    sizeBytes: number;
    sourcePath: string;
  };
  version: typeof BACKUP_MANIFEST_VERSION;
}

export interface BackupArchiveResult {
  backupDir: string;
  manifest: BackupManifest;
}

export interface RestoreArchiveResult {
  artifactsRestored: boolean;
  backupDir: string;
  dbRestored: boolean;
  manifest: BackupManifest;
  targetArtifactsDir: string | null;
  targetDbPath: string;
  targetReportsDir: string | null;
}
