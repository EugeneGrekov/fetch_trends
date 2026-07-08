import { mkdir, readdir, writeFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { listAppliedMigrations } from '../db/migrations.js';
import { listAutocompletePredictionsByIdea } from '../db/repositories/autocomplete-predictions.js';
import { listCompetitorsByIdea } from '../db/repositories/competitors.js';
import { listEvidenceByIdea } from '../db/repositories/evidence.js';
import { listExperimentDecisions, listExperimentEvents, listExperimentsByIdea, listMeasurementSnapshots } from '../db/repositories/experiments.js';
import { listIdeaDecisionsByIdea } from '../db/repositories/idea-decisions.js';
import { getIdeaById, listIdeas } from '../db/repositories/ideas.js';
import { listJobsByIdea } from '../db/repositories/jobs.js';
import { listQueriesByIdea } from '../db/repositories/queries.js';
import { listRevalidationQueueByIdea } from '../db/repositories/revalidation.js';
import { listReportsByIdea } from '../db/repositories/reports.js';
import { listScoresByIdea } from '../db/repositories/scores.js';
import { listSourcesByIdea } from '../db/repositories/sources.js';
import { listToolRunsByJob } from '../db/repositories/tool-runs.js';
import type { RevalidationRunRow } from '../db/schema.js';
import type {
  ExportFormat,
  IdeaExportBundle,
  IdeaExportBundleData,
  IdeaExportExperiment,
  IdeaExportJob,
  PortfolioExportBundle,
  PortfolioExportBundleData,
  PortfolioIdeaSummary,
  RedactionMode,
} from './types.js';
import { applyIdeaBundleRedaction, applyPortfolioBundleRedaction } from './redaction.js';

export interface BuildIdeaExportBundleOptions {
  artifactRoot?: string;
  db: DatabaseSync;
  ideaId: number;
  redaction?: RedactionMode;
}

export interface BuildPortfolioExportBundleOptions {
  db: DatabaseSync;
  limit?: number;
  redaction?: RedactionMode;
}

export interface WriteExportBundleOptions {
  format: ExportFormat;
  outPath: string;
}

export interface WrittenExportBundle {
  outPath: string;
}

export async function buildIdeaExportBundle(
  options: BuildIdeaExportBundleOptions,
): Promise<IdeaExportBundle> {
  const idea = getIdeaById(options.db, options.ideaId);
  const artifactPaths = await listArtifactPaths(options.artifactRoot ?? './artifacts/ideas', options.ideaId);
  const bundle: IdeaExportBundle = {
    manifest: {
      app: 'fetch-trends',
      bundleType: 'idea_bundle',
      createdAt: new Date().toISOString(),
      files: [],
      ideaIds: [idea.id],
      redaction: options.redaction ?? 'basic',
      version: 1,
    },
    export: {
      type: 'idea',
      data: {
        appliedMigrations: listAppliedMigrations(options.db),
        autocompletePredictions: listAutocompletePredictionsByIdea(options.db, idea.id),
        artifactPaths,
        competitors: listCompetitorsByIdea(options.db, idea.id),
        evidence: listEvidenceByIdea(options.db, idea.id),
        experiments: loadIdeaExperiments(options.db, idea.id),
        idea,
        ideaDecisions: listIdeaDecisionsByIdea(options.db, idea.id),
        jobs: loadIdeaJobs(options.db, idea.id),
        queries: listQueriesByIdea(options.db, idea.id),
        revalidationQueue: listRevalidationQueueByIdea(options.db, idea.id),
        revalidationRuns: listRevalidationRunsByIdea(options.db, idea.id),
        reports: listReportsByIdea(options.db, idea.id),
        scores: listScoresByIdea(options.db, idea.id),
        sources: listSourcesByIdea(options.db, idea.id),
      },
    },
  };

  const redaction = options.redaction ?? 'basic';
  return applyIdeaBundleRedaction(bundle, redaction, { artifactRoot: options.artifactRoot ?? './artifacts/ideas' });
}

export async function buildPortfolioExportBundle(
  options: BuildPortfolioExportBundleOptions,
): Promise<PortfolioExportBundle> {
  const ideas = listIdeas(options.db, options.limit ?? 25);
  const bundle: PortfolioExportBundle = {
    manifest: {
      app: 'fetch-trends',
      bundleType: 'portfolio_bundle',
      createdAt: new Date().toISOString(),
      files: [],
      ideaIds: ideas.map((idea) => idea.id),
      redaction: options.redaction ?? 'basic',
      version: 1,
    },
    export: {
      type: 'portfolio',
      data: {
        ideas: ideas.map((idea) => loadPortfolioSummary(options.db, idea.id)),
      },
    },
  };

  return applyPortfolioBundleRedaction(bundle, options.redaction ?? 'basic');
}

export async function writeExportBundle(
  bundle: IdeaExportBundle | PortfolioExportBundle,
  options: WriteExportBundleOptions,
): Promise<WrittenExportBundle> {
  await mkdir(dirname(options.outPath), { recursive: true });
  const rendered = options.format === 'markdown'
    ? renderBundleMarkdown(bundle)
    : `${JSON.stringify(bundle, null, 2)}\n`;

  await writeFile(options.outPath, rendered);
  return { outPath: options.outPath };
}

export function renderBundleMarkdown(bundle: IdeaExportBundle | PortfolioExportBundle): string {
  if (isIdeaExportBundle(bundle)) {
    return renderIdeaBundleMarkdown(bundle);
  }

  return renderPortfolioBundleMarkdown(bundle);
}

function renderIdeaBundleMarkdown(bundle: IdeaExportBundle): string {
  const data = bundle.export.data;
  return [
    '# Fetch Trends Idea Export',
    '',
    `- Bundle type: ${bundle.manifest.bundleType}`,
    `- Created at: ${bundle.manifest.createdAt}`,
    `- Idea IDs: ${bundle.manifest.ideaIds.join(', ')}`,
    `- Redaction: ${bundle.manifest.redaction}`,
    '',
    '## Idea',
    '```json',
    JSON.stringify(data.idea, null, 2),
    '```',
    '',
    '## Jobs',
    '```json',
    JSON.stringify(data.jobs, null, 2),
    '```',
    '',
    '## Queries',
    '```json',
    JSON.stringify(data.queries, null, 2),
    '```',
    '',
    '## Autocomplete Predictions',
    '```json',
    JSON.stringify(data.autocompletePredictions, null, 2),
    '```',
    '',
    '## Sources',
    '```json',
    JSON.stringify(data.sources, null, 2),
    '```',
    '',
    '## Evidence',
    '```json',
    JSON.stringify(data.evidence, null, 2),
    '```',
    '',
    '## Competitors',
    '```json',
    JSON.stringify(data.competitors, null, 2),
    '```',
    '',
    '## Scores',
    '```json',
    JSON.stringify(data.scores, null, 2),
    '```',
    '',
    '## Reports',
    '```json',
    JSON.stringify(data.reports, null, 2),
    '```',
    '',
    '## Experiments',
    '```json',
    JSON.stringify(data.experiments, null, 2),
    '```',
    '',
    '## Idea Decisions',
    '```json',
    JSON.stringify(data.ideaDecisions, null, 2),
    '```',
    '',
    '## Revalidation Runs',
    '```json',
    JSON.stringify(data.revalidationRuns, null, 2),
    '```',
    '',
    '## Revalidation Queue',
    '```json',
    JSON.stringify(data.revalidationQueue, null, 2),
    '```',
    '',
    '## Artifact Paths',
    '```json',
    JSON.stringify(data.artifactPaths, null, 2),
    '```',
    '',
    '## Applied Migrations',
    '```json',
    JSON.stringify(data.appliedMigrations, null, 2),
    '```',
    '',
  ].join('\n');
}

function renderPortfolioBundleMarkdown(bundle: PortfolioExportBundle): string {
  const rows = bundle.export.data.ideas
    .map((idea) => [
      idea.idea.id,
      idea.idea.title,
      idea.latestScore?.total_score ?? '',
      idea.latestDecision?.decision ?? '',
      idea.portfolioBucket,
      idea.bestNextAction,
    ])
    .map((row) => `| ${row.map((cell) => escapeCell(String(cell))).join(' | ')} |`)
    .join('\n');

  return [
    '# Fetch Trends Portfolio Export',
    '',
    `- Bundle type: ${bundle.manifest.bundleType}`,
    `- Created at: ${bundle.manifest.createdAt}`,
    `- Idea IDs: ${bundle.manifest.ideaIds.join(', ')}`,
    `- Redaction: ${bundle.manifest.redaction}`,
    '',
    '| Idea ID | Title | Score | Decision | Bucket | Best Next Action |',
    '| --- | --- | ---: | --- | --- | --- |',
    rows,
    '',
    '## Ideas',
    '```json',
    JSON.stringify(bundle.export.data.ideas, null, 2),
    '```',
    '',
  ].join('\n');
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function loadIdeaJobs(db: DatabaseSync, ideaId: number): IdeaExportJob[] {
  return listJobsByIdea(db, ideaId).map((job) => ({
    job,
    toolRuns: listToolRunsByJob(db, job.id),
  }));
}

function loadIdeaExperiments(db: DatabaseSync, ideaId: number): IdeaExportExperiment[] {
  return listExperimentsByIdea(db, ideaId).map((experiment) => ({
    decisions: listExperimentDecisions(db, experiment.id),
    events: listExperimentEvents(db, experiment.id),
    experiment,
    measurementSnapshots: listMeasurementSnapshots(db, experiment.id),
  }));
}

function loadPortfolioSummary(db: DatabaseSync, ideaId: number): PortfolioIdeaSummary {
  const idea = getIdeaById(db, ideaId);
  const latestScore = listScoresByIdea(db, ideaId)[0] ?? null;
  const latestDecision = listIdeaDecisionsByIdea(db, ideaId)[0] ?? null;
  const latestReport = listReportsByIdea(db, ideaId)[0] ?? null;

  return {
    bestNextAction: latestDecision?.next_action ?? `Review latest report ${latestReport?.report_type ?? 'and gather more evidence'}.`,
    idea,
    latestDecision,
    latestReport,
    latestScore,
    portfolioBucket: classifyPortfolioBucket(latestDecision?.decision ?? null, latestScore?.total_score ?? null),
  };
}

function classifyPortfolioBucket(decision: string | null, score: number | null): string {
  if (decision) {
    if (decision === 'kill') {
      return 'discard';
    }
    if (decision === 'pivot') {
      return 'pivot';
    }
    if (decision === 'persevere' || decision === 'build_mvp') {
      return 'continue';
    }
    if (decision === 'validate_deeper') {
      return 'investigate';
    }
  }

  if (score == null) {
    return 'unscored';
  }

  if (score >= 80) {
    return 'promising';
  }
  if (score >= 60) {
    return 'watch';
  }
  return 'weak';
}

async function listArtifactPaths(root: string, ideaId: number): Promise<string[]> {
  const directory = join(root, String(ideaId));
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const collected: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        collected.push(...await listFilesRecursively(join(directory, entry.name)));
      } else if (entry.isFile()) {
        collected.push(join(directory, entry.name));
      }
    }

    collected.sort();
    return collected;
  } catch {
    return [];
  }
}

async function listFilesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const collected: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collected.push(...await listFilesRecursively(path));
      continue;
    }
    if (entry.isFile()) {
      collected.push(path);
    }
  }

  return collected;
}

function listRevalidationRunsByIdea(db: DatabaseSync, ideaId: number): RevalidationRunRow[] {
  return db.prepare(`
    SELECT *
    FROM revalidation_runs
    WHERE idea_id = :ideaId
    ORDER BY started_at DESC, id DESC
  `).all({ ideaId }) as unknown as RevalidationRunRow[];
}

function isIdeaExportBundle(bundle: IdeaExportBundle | PortfolioExportBundle): bundle is IdeaExportBundle {
  return bundle.export.type === 'idea';
}
