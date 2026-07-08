import { basename, relative } from 'node:path';
import type {
  IdeaExportBundle,
  IdeaExportBundleData,
  PortfolioExportBundle,
  PortfolioExportBundleData,
  RedactionMode,
} from './types.js';

const REDACTED_URL = '[redacted url]';
const REDACTED_PATH = '[redacted path]';
const REDACTED_TEXT = '[redacted]';
const REDACTED_REPORT = '[redacted report]';

export function applyIdeaBundleRedaction(
  bundle: IdeaExportBundle,
  mode: RedactionMode,
  options: { artifactRoot?: string } = {},
): IdeaExportBundle {
  if (mode === 'none') {
    return bundle;
  }

  return {
    manifest: { ...bundle.manifest, redaction: mode },
    export: {
      type: bundle.export.type,
      data: redactIdeaBundleData(bundle.export.data, mode, options),
    },
  };
}

export function applyPortfolioBundleRedaction(
  bundle: PortfolioExportBundle,
  mode: RedactionMode,
): PortfolioExportBundle {
  if (mode === 'none') {
    return bundle;
  }

  return {
    manifest: { ...bundle.manifest, redaction: mode },
    export: {
      type: bundle.export.type,
      data: redactPortfolioBundleData(bundle.export.data, mode),
    },
  };
}

function redactIdeaBundleData(
  data: IdeaExportBundleData,
  mode: Exclude<RedactionMode, 'none'>,
  options: { artifactRoot?: string },
): IdeaExportBundleData {
  const sourceUrls = data.sources.map((source) => source.url);
  const evidenceQuotes = data.evidence.map((item) => item.quote);

  return {
    ...data,
    artifactPaths: redactArtifactPaths(data.artifactPaths, mode, options.artifactRoot),
    autocompletePredictions: data.autocompletePredictions,
    competitors: data.competitors,
    evidence: data.evidence.map((item) => ({
      ...item,
      quote: mode === 'strict' ? REDACTED_TEXT : REDACTED_TEXT,
    })),
    experiments: data.experiments.map((item) => ({
      ...item,
      decisions: item.decisions,
      events: item.events.map((event) => ({
        ...event,
        metadata_json: redactJsonString(event.metadata_json, mode),
      })),
      measurementSnapshots: item.measurementSnapshots.map((snapshot) => ({
        ...snapshot,
        metrics_json: redactJsonString(snapshot.metrics_json, mode),
        threshold_results_json: redactJsonString(snapshot.threshold_results_json, mode),
      })),
    })),
    ideaDecisions: data.ideaDecisions.map((item) => ({
      ...item,
      evidence_json: redactJsonString(item.evidence_json, mode),
    })),
    jobs: data.jobs.map((item) => ({
      ...item,
      toolRuns: item.toolRuns.map((toolRun) => ({
        ...toolRun,
        metadata_json: redactJsonString(toolRun.metadata_json, mode),
        output_json: redactJsonString(toolRun.output_json, mode),
      })),
    })),
    queries: data.queries,
    revalidationQueue: data.revalidationQueue.map((item) => ({
      ...item,
      stale_reason_json: redactJsonString(item.stale_reason_json, mode),
    })),
    revalidationRuns: data.revalidationRuns.map((item) => ({
      ...item,
      summary_json: redactJsonString(item.summary_json, mode),
    })),
    reports: data.reports.map((item) => ({
      ...item,
      json: redactReportJson(item.json, mode),
      markdown: redactReportMarkdown(item.markdown, sourceUrls, evidenceQuotes, mode),
    })),
    scores: data.scores,
    sources: data.sources.map((item) => ({
      ...item,
      url: mode === 'strict' ? REDACTED_URL : redactUrl(item.url, mode),
    })),
  } as IdeaExportBundleData;
}

function redactPortfolioBundleData(
  data: PortfolioExportBundleData,
  mode: Exclude<RedactionMode, 'none'>,
): PortfolioExportBundleData {
  return {
    ideas: data.ideas.map((item) => ({
      ...item,
      bestNextAction: redactText(item.bestNextAction, mode),
      latestDecision: item.latestDecision
        ? {
            ...item.latestDecision,
            evidence_json: redactJsonString(item.latestDecision.evidence_json, mode),
            next_action: redactText(item.latestDecision.next_action, mode),
            reason: redactText(item.latestDecision.reason, mode),
          }
        : null,
      latestReport: item.latestReport
        ? {
            ...item.latestReport,
            json: redactReportJson(item.latestReport.json, mode),
            markdown: redactText(item.latestReport.markdown, mode),
          }
        : null,
      latestScore: item.latestScore,
      idea: item.idea,
    })),
  } as PortfolioExportBundleData;
}

function redactArtifactPaths(paths: string[], mode: Exclude<RedactionMode, 'none'>, artifactRoot?: string): string[] {
  if (mode === 'strict') {
    return paths.map(() => REDACTED_PATH);
  }

  return paths.map((path) => {
    if (!artifactRoot) {
      return basename(path);
    }

    const relativePath = relative(artifactRoot, path);
    return relativePath === '' || relativePath.startsWith('..') ? basename(path) : relativePath;
  });
}

function redactJsonString(value: string | null, mode: Exclude<RedactionMode, 'none'>): string {
  void mode;
  return value == null ? REDACTED_TEXT : REDACTED_TEXT;
}

function redactReportJson(value: string | null, mode: Exclude<RedactionMode, 'none'>): string {
  void mode;
  return value == null ? REDACTED_TEXT : REDACTED_TEXT;
}

function redactReportMarkdown(
  markdown: string,
  urls: string[],
  quotes: string[],
  mode: Exclude<RedactionMode, 'none'>,
): string {
  let output = markdown;

  for (const quote of quotes) {
    output = replaceAll(output, quote, REDACTED_TEXT);
  }

  for (const url of urls) {
    output = replaceAll(output, url, mode === 'strict' ? REDACTED_URL : redactUrl(url, mode));
  }

  return mode === 'strict' ? REDACTED_REPORT : output;
}

function redactText(value: string, mode: Exclude<RedactionMode, 'none'>): string {
  return mode === 'strict' ? REDACTED_TEXT : value;
}

function redactUrl(value: string, mode: Exclude<RedactionMode, 'none'>): string {
  if (mode === 'strict') {
    return REDACTED_URL;
  }

  try {
    const parsed = new URL(value);
    return parsed.host;
  } catch {
    return REDACTED_URL;
  }
}

function replaceAll(value: string, needle: string, replacement: string): string {
  if (needle.length === 0) {
    return value;
  }

  return value.split(needle).join(replacement);
}
