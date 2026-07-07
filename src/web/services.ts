import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_MODIFIERS } from '../utilities/autocomplete/constants.js';
import { normalizeIdea } from '../validation/idea-normalizer.js';
import { runValidationJob } from '../validation/orchestrator.js';
import type { ValidationDependencies, ValidationOptions, ValidationResult } from '../validation/types.js';
import { openDatabase, resolveDatabasePath } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { listAutocompletePredictionsByIdea } from '../db/repositories/autocomplete-predictions.js';
import { listCompetitorsByIdea } from '../db/repositories/competitors.js';
import { listEvidenceByIdea } from '../db/repositories/evidence.js';
import { createIdea, getIdeaById, listIdeas } from '../db/repositories/ideas.js';
import { createJob, getJobById, listJobsByIdea, listJobsByStatus } from '../db/repositories/jobs.js';
import { listQueriesByIdea } from '../db/repositories/queries.js';
import { getReportById, listReportsByIdea, listReportsByJob } from '../db/repositories/reports.js';
import { listScoresByIdea } from '../db/repositories/scores.js';
import { listSourcesByIdea } from '../db/repositories/sources.js';
import { listToolRunsByJob } from '../db/repositories/tool-runs.js';
import type {
  AutocompletePredictionRow,
  CompetitorRow,
  EvidenceRow,
  IdeaRow,
  JobRow,
  QueryRow,
  ReportRow,
  ScoreRow,
  SourceRow,
  ToolRunRow,
} from '../db/schema.js';

export interface IdeaSubmissionInput {
  idea: string;
  targetMarket?: string | null;
  expectedPrice?: string | null;
  platform?: string | null;
}

export interface WebServiceOptions {
  dbPath?: string;
  outDir: string;
  resultsPath: string;
  aiEnabled: boolean;
  runJobsInProcess: boolean;
  validationDefaults?: Partial<ValidationOptions>;
  validationDependencies?: ValidationDependencies;
  validationRunner?: ValidationRunner;
  onBackgroundError?: (error: unknown) => void;
}

export type ValidationRunner = (
  options: ValidationOptions,
  dependencies?: ValidationDependencies,
) => Promise<ValidationResult>;

export interface HealthPayload {
  ok: true;
  dbPath: string;
  migrationStatus: 'applied';
  pendingJobs: number;
  runningJobs: number;
}

export interface SettingsPayload {
  appVersion: string;
  dbPath: string;
  resultsPath: string;
  artifactsPath: string;
  ai: {
    codex: 'enabled' | 'disabled';
  };
  collectors: Array<{
    name: string;
    status: 'configured' | 'missing' | 'local';
  }>;
}

export interface IdeaDashboardPayload {
  idea: IdeaRow;
  jobs: JobRow[];
  queries: QueryRow[];
  predictions: AutocompletePredictionRow[];
  scores: ScoreRow[];
  reports: ReportRow[];
  evidence: EvidencePayload;
}

export interface EvidencePayload {
  idea: IdeaRow;
  sources: SourceRow[];
  evidence: EvidenceRow[];
  competitors: CompetitorRow[];
  evidenceWithSources: Array<{
    evidence: EvidenceRow;
    source: SourceRow | null;
  }>;
  counts: {
    queries: number;
    predictions: number;
    sources: number;
    evidence: number;
    competitors: number;
  };
  warnings: string[];
}

export interface JobDetailsPayload {
  job: JobRow;
  idea: IdeaRow;
  reports: ReportRow[];
  toolRuns: ToolRunRow[];
}

export interface ReportPayload {
  report: ReportRow;
  idea: IdeaRow;
  structured: unknown;
}

export interface WebServices {
  readonly dbPath: string;
  createIdeaSubmission(input: IdeaSubmissionInput): Promise<{ idea: IdeaRow; job: JobRow }>;
  getHealth(): Promise<HealthPayload>;
  getSettings(appVersion: string): SettingsPayload;
  listRecentIdeas(): Promise<IdeaRow[]>;
  getIdeaDashboard(ideaId: number): Promise<IdeaDashboardPayload>;
  getEvidence(ideaId: number): Promise<EvidencePayload>;
  getJobDetails(jobId: number): Promise<JobDetailsPayload>;
  getReport(reportId: number): Promise<ReportPayload>;
  runJob(jobId: number): Promise<ValidationResult | undefined>;
  runPendingJobs(limit?: number): Promise<Array<ValidationResult | undefined>>;
}

export function createWebServices(options: WebServiceOptions): WebServices {
  const dbPath = resolveDatabasePath(options.dbPath);
  const validationRunner = options.validationRunner ?? runValidationJob;
  const runningJobs = new Set<number>();

  async function withDb<T>(operation: (db: DatabaseSync) => T): Promise<T> {
    const { db } = await openDatabase(dbPath);

    try {
      applyMigrations(db);
      return operation(db);
    } finally {
      db.close();
    }
  }

  async function createIdeaSubmission(input: IdeaSubmissionInput): Promise<{ idea: IdeaRow; job: JobRow }> {
    const normalizedIdea = applySubmissionOverrides(normalizeIdea(input.idea), input);
    const created = await withDb((db) => {
      const idea = createIdea(db, {
        title: normalizedIdea.title,
        rawDescription: normalizedIdea.cleanedIdea,
        normalizedJson: JSON.stringify({ source: 'web-submission', ...normalizedIdea }),
        targetMarket: normalizedIdea.targetMarket,
        platform: normalizedIdea.platform,
        expectedPrice: normalizedIdea.expectedPrice,
        businessModel: normalizedIdea.businessModel,
        status: 'queued',
      });
      const job = createJob(db, {
        ideaId: idea.id,
        jobType: 'validate',
        status: 'pending',
      });

      return { idea, job };
    });

    if (options.runJobsInProcess) {
      startBackgroundJob(created.job.id);
    }

    return created;
  }

  async function runJob(jobId: number): Promise<ValidationResult | undefined> {
    if (runningJobs.has(jobId)) {
      return undefined;
    }

    runningJobs.add(jobId);
    try {
      const snapshot = await withDb((db) => {
        const job = getJobById(db, jobId);
        const idea = getIdeaById(db, job.idea_id);
        return { idea, job };
      });

      if (['completed', 'running'].includes(snapshot.job.status)) {
        return undefined;
      }

      return validationRunner(
        buildValidationOptions(snapshot.idea, snapshot.job, options),
        options.validationDependencies,
      );
    } finally {
      runningJobs.delete(jobId);
    }
  }

  async function runPendingJobs(limit = 1): Promise<Array<ValidationResult | undefined>> {
    const jobs = await withDb((db) => listJobsByStatus(db, 'pending', limit));
    const results: Array<ValidationResult | undefined> = [];

    for (const job of jobs) {
      results.push(await runJob(job.id));
    }

    return results;
  }

  function startBackgroundJob(jobId: number): void {
    void runJob(jobId).catch((error) => {
      options.onBackgroundError?.(error);
    });
  }

  return {
    dbPath,
    createIdeaSubmission,
    async getHealth(): Promise<HealthPayload> {
      return withDb((db) => ({
        ok: true,
        dbPath,
        migrationStatus: 'applied',
        pendingJobs: listJobsByStatus(db, 'pending', 1000).length,
        runningJobs: listJobsByStatus(db, 'running', 1000).length,
      }));
    },
    getSettings(appVersion: string): SettingsPayload {
      return {
        appVersion,
        dbPath,
        resultsPath: options.resultsPath,
        artifactsPath: options.validationDefaults?.aiArtifactsDir ?? './artifacts/ai-runs',
        ai: {
          codex: options.aiEnabled ? 'enabled' : 'disabled',
        },
        collectors: [
          { name: 'Google Autocomplete', status: 'local' },
          { name: 'SERP provider', status: configuredStatus('SERP_API_KEY') },
          { name: 'Reddit', status: configuredStatus('REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET') },
          { name: 'YouTube', status: configuredStatus('YOUTUBE_API_KEY') },
        ],
      };
    },
    async listRecentIdeas(): Promise<IdeaRow[]> {
      return withDb((db) => listIdeas(db, 20));
    },
    async getIdeaDashboard(ideaId: number): Promise<IdeaDashboardPayload> {
      return withDb((db) => {
        const idea = getIdeaById(db, ideaId);
        const queries = listQueriesByIdea(db, ideaId);
        const predictions = listAutocompletePredictionsByIdea(db, ideaId);
        const sources = listSourcesByIdea(db, ideaId);
        const evidence = listEvidenceByIdea(db, ideaId);
        const competitors = listCompetitorsByIdea(db, ideaId);

        return {
          idea,
          jobs: listJobsByIdea(db, ideaId),
          queries,
          predictions,
          scores: listScoresByIdea(db, ideaId),
          reports: listReportsByIdea(db, ideaId),
          evidence: buildEvidencePayload({
            competitors,
            evidence,
            idea,
            predictions,
            queries,
            sources,
          }),
        };
      });
    },
    async getEvidence(ideaId: number): Promise<EvidencePayload> {
      return withDb((db) => {
        const idea = getIdeaById(db, ideaId);
        return buildEvidencePayload({
          competitors: listCompetitorsByIdea(db, ideaId),
          evidence: listEvidenceByIdea(db, ideaId),
          idea,
          predictions: listAutocompletePredictionsByIdea(db, ideaId),
          queries: listQueriesByIdea(db, ideaId),
          sources: listSourcesByIdea(db, ideaId),
        });
      });
    },
    async getJobDetails(jobId: number): Promise<JobDetailsPayload> {
      return withDb((db) => {
        const job = getJobById(db, jobId);
        return {
          job,
          idea: getIdeaById(db, job.idea_id),
          reports: listReportsByJob(db, jobId),
          toolRuns: listToolRunsByJob(db, jobId),
        };
      });
    },
    async getReport(reportId: number): Promise<ReportPayload> {
      return withDb((db) => {
        const report = getReportById(db, reportId);
        return {
          report,
          idea: getIdeaById(db, report.idea_id),
          structured: parseJson(report.json),
        };
      });
    },
    runJob,
    runPendingJobs,
  };
}

function buildValidationOptions(idea: IdeaRow, job: JobRow, options: WebServiceOptions): ValidationOptions {
  return {
    ai: options.aiEnabled,
    country: 'US',
    dbPath: options.dbPath,
    delayMs: 1200,
    depth: 1,
    expectedPrice: idea.expected_price,
    headless: true,
    idea: idea.raw_description,
    ideaId: idea.id,
    jobId: job.id,
    keepAiArtifacts: false,
    language: 'en',
    maxDepth2Prefixes: 25,
    maxPrefixes: 50,
    modifiers: [...DEFAULT_MODIFIERS],
    outDir: options.outDir,
    platform: idea.platform,
    targetMarket: idea.target_market,
    ...options.validationDefaults,
  };
}

function applySubmissionOverrides(
  normalizedIdea: ReturnType<typeof normalizeIdea>,
  input: IdeaSubmissionInput,
): ReturnType<typeof normalizeIdea> {
  return {
    ...normalizedIdea,
    targetMarket: normalizeOptional(input.targetMarket) ?? normalizedIdea.targetMarket,
    expectedPrice: normalizeOptional(input.expectedPrice) ?? normalizedIdea.expectedPrice,
    platform: normalizeOptional(input.platform) ?? normalizedIdea.platform,
  };
}

function buildEvidencePayload(args: {
  idea: IdeaRow;
  queries: QueryRow[];
  predictions: AutocompletePredictionRow[];
  sources: SourceRow[];
  evidence: EvidenceRow[];
  competitors: CompetitorRow[];
}): EvidencePayload {
  const sourcesById = new Map(args.sources.map((source) => [source.id, source]));

  return {
    idea: args.idea,
    sources: args.sources,
    evidence: args.evidence,
    competitors: args.competitors,
    evidenceWithSources: args.evidence.map((evidence) => ({
      evidence,
      source: sourcesById.get(evidence.source_id) ?? null,
    })),
    counts: {
      queries: args.queries.length,
      predictions: args.predictions.length,
      sources: args.sources.length,
      evidence: args.evidence.length,
      competitors: args.competitors.length,
    },
    warnings: buildEvidenceWarnings(args),
  };
}

function buildEvidenceWarnings(args: {
  predictions: AutocompletePredictionRow[];
  sources: SourceRow[];
  evidence: EvidenceRow[];
  competitors: CompetitorRow[];
}): string[] {
  const warnings: string[] = [];

  if (args.predictions.length === 0) {
    warnings.push('No autocomplete predictions have been stored yet.');
  }

  if (args.sources.length === 0) {
    warnings.push('No external source records have been stored yet.');
  }

  if (args.evidence.length === 0) {
    warnings.push('No extracted evidence quotes have been stored yet.');
  }

  if (args.competitors.length === 0) {
    warnings.push('No competitor records have been stored yet.');
  }

  return warnings;
}

function configuredStatus(...envNames: string[]): 'configured' | 'missing' {
  return envNames.every((name) => Boolean(process.env[name]?.trim())) ? 'configured' : 'missing';
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseJson(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
