import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createCompetitors } from '../db/repositories/competitors.js';
import { createEvidence } from '../db/repositories/evidence.js';
import { createSources } from '../db/repositories/sources.js';
import { blockToolRun, completeToolRun, createToolRun, failToolRun } from '../db/repositories/tool-runs.js';
import type { CreateSourceInput, IdeaRow, QueryRow, SourceRow } from '../db/schema.js';
import { normalizeQuery } from '../utilities/autocomplete/normalize.js';
import type { UniquePrediction } from '../utilities/autocomplete/types.js';
import { CompetitorPageCollector } from '../utilities/competitors/collector.js';
import type { CompetitorCollectorInput, CompetitorCollectorOutput } from '../utilities/competitors/types.js';
import { RedditDiscoveryCollector } from '../utilities/reddit/collector.js';
import type { RedditCollectorOutput } from '../utilities/reddit/types.js';
import { ReviewMiningCollector } from '../utilities/reviews/collector.js';
import type { ReviewsCollectorOutput } from '../utilities/reviews/types.js';
import { SerpApiProvider, SerpCollector } from '../utilities/serp/collector.js';
import type { SerpCollectorOutput, SerpProvider, SerpQueryInput, SerpResultItem } from '../utilities/serp/types.js';
import { YouTubeSearchCollector } from '../utilities/youtube/collector.js';
import type { YouTubeCollectorOutput } from '../utilities/youtube/types.js';
import { buildCompetitorInputs, buildCompetitorSourceInputs, pickCompetitorCandidateUrls } from './competitor-analyzer.js';
import { extractEvidenceFromSource } from './complaint-extractor.js';
import type { CollectorConfig, ExternalCollectorRun, ExternalEvidenceSummary } from './external-types.js';
import { isEvidenceFriendlySource, toSerpSourceInput, toSourceInput } from './source-normalizer.js';
import type { NormalizedIdea, ValidationDependencies, ValidationOptions } from './types.js';

const DEFAULT_COLLECTOR_CONFIG: CollectorConfig = {
  serp: {
    enabled: true,
    limit: 10,
    provider: 'serpapi',
  },
  reddit: {
    enabled: true,
    limit: 10,
  },
  youtube: {
    enabled: true,
    limit: 10,
  },
  competitors: {
    enabled: true,
    maxPages: 5,
  },
  reviews: {
    enabled: true,
    limit: 10,
  },
};

export async function collectExternalEvidence(args: {
  db: DatabaseSync;
  dependencies: ValidationDependencies;
  idea: IdeaRow;
  jobId: number;
  normalizedIdea: NormalizedIdea;
  options: ValidationOptions;
  predictions: UniquePrediction[];
  queries: QueryRow[];
}): Promise<ExternalEvidenceSummary> {
  if (!args.options.external) {
    return emptyExternalSummary(false);
  }

  const config = args.dependencies.loadConfig
    ? await args.dependencies.loadConfig()
    : await loadCollectorConfig();
  const collectors = buildCollectors(config, args.dependencies);
  const summary = emptyExternalSummary(true);
  const searchQueries = buildExternalQueries(args.queries, args.predictions);
  const seenSourceKeys = new Set<string>();
  let serpItems: SerpResultItem[] = [];

  if (shouldRun(args.options.serp, config.serp.enabled)) {
    const result = await runCollector({
      db: args.db,
      jobId: args.jobId,
      collectorName: 'serp',
      collector: collectors.serp,
      input: {
        queries: searchQueries,
        country: args.options.country,
        language: args.options.language,
        limit: config.serp.limit,
      } satisfies SerpQueryInput,
      missingMessage: 'SERP collector unavailable: set SERP_API_KEY to enable external search collection.',
    });
    summary.collectorRuns.push(result.run);
    appendWarning(summary, result.run.warning);

    if (result.output) {
      const output = result.output;
      serpItems = output.items;
      const createdSources = persistSources({
        db: args.db,
        fetchedAt: output.fetchedAt,
        ideaId: args.idea.id,
        inputs: output.items.map((item) => toSerpSourceInput(args.idea.id, item, output.fetchedAt)),
        seenSourceKeys,
      });
      summary.sources.push(...createdSources);
      summary.evidence.push(...persistExtractedEvidence(args.db, args.idea.id, createdSources, output.fetchedAt));
    }
  } else {
    summary.collectorRuns.push(skippedRun('serp'));
  }

  if (shouldRun(args.options.reddit, config.reddit.enabled)) {
    const result = await runCollector({
      db: args.db,
      jobId: args.jobId,
      collectorName: 'reddit',
      collector: collectors.reddit,
      input: {
        queries: searchQueries,
        subreddits: [],
        country: args.options.country,
        language: args.options.language,
        limit: config.reddit.limit,
      },
      missingMessage: 'Reddit collector unavailable because no external search provider is configured.',
    });
    summary.collectorRuns.push(result.run);
    appendWarning(summary, result.run.warning);

    if (result.output) {
      const output = result.output;
      const createdSources = persistSources({
        db: args.db,
        fetchedAt: output.fetchedAt,
        ideaId: args.idea.id,
        inputs: output.items.map((item) =>
          toSourceInput({
            ideaId: args.idea.id,
            url: item.url,
            sourceType: 'reddit_thread',
            title: item.title,
            snippet: item.snippet,
            fetchedAt: output.fetchedAt,
          })),
        seenSourceKeys,
      });
      summary.sources.push(...createdSources);
      summary.evidence.push(...persistExtractedEvidence(args.db, args.idea.id, createdSources, output.fetchedAt));
    }
  } else {
    summary.collectorRuns.push(skippedRun('reddit'));
  }

  if (shouldRun(args.options.youtube, config.youtube.enabled)) {
    const result = await runCollector({
      db: args.db,
      jobId: args.jobId,
      collectorName: 'youtube',
      collector: collectors.youtube,
      input: {
        queries: searchQueries,
        country: args.options.country,
        language: args.options.language,
        limit: config.youtube.limit,
      },
      missingMessage: 'YouTube collector unavailable because no external search provider is configured.',
    });
    summary.collectorRuns.push(result.run);
    appendWarning(summary, result.run.warning);

    if (result.output) {
      const output = result.output;
      const createdSources = persistSources({
        db: args.db,
        fetchedAt: output.fetchedAt,
        ideaId: args.idea.id,
        inputs: output.items.map((item) =>
          toSourceInput({
            ideaId: args.idea.id,
            url: item.url,
            sourceType: 'youtube_video',
            title: item.title,
            snippet: item.description,
            fetchedAt: output.fetchedAt,
          })),
        seenSourceKeys,
      });
      summary.sources.push(...createdSources);
      summary.evidence.push(...persistExtractedEvidence(args.db, args.idea.id, createdSources, output.fetchedAt));
    }
  } else {
    summary.collectorRuns.push(skippedRun('youtube'));
  }

  if (shouldRun(args.options.reviews, config.reviews.enabled)) {
    const result = await runCollector({
      db: args.db,
      jobId: args.jobId,
      collectorName: 'reviews',
      collector: collectors.reviews,
      input: {
        queries: searchQueries,
        country: args.options.country,
        language: args.options.language,
        limit: config.reviews.limit,
      },
      missingMessage: 'Review collector unavailable because no external search provider is configured.',
    });
    summary.collectorRuns.push(result.run);
    appendWarning(summary, result.run.warning);

    if (result.output) {
      const output = result.output;
      const createdSources = persistSources({
        db: args.db,
        fetchedAt: output.fetchedAt,
        ideaId: args.idea.id,
        inputs: output.items.map((item) =>
          toSourceInput({
            ideaId: args.idea.id,
            url: item.url,
            sourceType: 'review_page',
            title: item.title,
            snippet: item.snippet,
            fetchedAt: output.fetchedAt,
          })),
        seenSourceKeys,
      });
      summary.sources.push(...createdSources);
      summary.evidence.push(...persistExtractedEvidence(args.db, args.idea.id, createdSources, output.fetchedAt));
    }
  } else {
    summary.collectorRuns.push(skippedRun('reviews'));
  }

  if (shouldRun(args.options.competitors, config.competitors.enabled)) {
    const candidateUrls = pickCompetitorCandidateUrls(serpItems, config.competitors.maxPages);
    if (candidateUrls.length === 0) {
      summary.collectorRuns.push({
        collector: 'competitors',
        status: 'skipped',
        itemCount: 0,
        errorCount: 0,
        warning: 'Competitor collector skipped because no competitor candidate URLs were found.',
      });
    } else {
      const result = await runCollector({
        db: args.db,
        jobId: args.jobId,
        collectorName: 'competitors',
        collector: collectors.competitors,
        input: {
          candidateUrls,
          idea: {
            title: args.normalizedIdea.title,
            cleanedIdea: args.normalizedIdea.cleanedIdea,
            targetMarket: args.normalizedIdea.targetMarket,
          },
          maxPages: config.competitors.maxPages,
        } satisfies CompetitorCollectorInput,
        missingMessage: 'Competitor collector unavailable.',
      });
      summary.collectorRuns.push(result.run);
      appendWarning(summary, result.run.warning);

      if (result.output) {
        const output = result.output;
        const createdSources = persistSources({
          db: args.db,
          fetchedAt: output.fetchedAt,
          ideaId: args.idea.id,
          inputs: buildCompetitorSourceInputs(args.idea.id, output.items, output.fetchedAt),
          seenSourceKeys,
        });
        summary.sources.push(...createdSources);
        const competitors = createCompetitors(
          args.db,
          buildCompetitorInputs(args.idea.id, output.items, output.fetchedAt),
        );
        summary.competitors.push(...competitors);
      }
    }
  } else {
    summary.collectorRuns.push(skippedRun('competitors'));
  }

  return summary;
}

export async function loadCollectorConfig(): Promise<CollectorConfig> {
  const configPath = resolve(process.cwd(), 'config/collectors.json');

  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CollectorConfig>;
    return {
      serp: {
        ...DEFAULT_COLLECTOR_CONFIG.serp,
        ...parsed.serp,
      },
      reddit: {
        ...DEFAULT_COLLECTOR_CONFIG.reddit,
        ...parsed.reddit,
      },
      youtube: {
        ...DEFAULT_COLLECTOR_CONFIG.youtube,
        ...parsed.youtube,
      },
      competitors: {
        ...DEFAULT_COLLECTOR_CONFIG.competitors,
        ...parsed.competitors,
      },
      reviews: {
        ...DEFAULT_COLLECTOR_CONFIG.reviews,
        ...parsed.reviews,
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_COLLECTOR_CONFIG;
    }

    throw error;
  }
}

function buildCollectors(config: CollectorConfig, dependencies: ValidationDependencies) {
  const provider = createDefaultSerpProvider(config);
  const serp = dependencies.collectors?.serp ?? (provider ? new SerpCollector(provider) : undefined);

  return {
    serp,
    reddit: dependencies.collectors?.reddit ?? (provider ? new RedditDiscoveryCollector(provider) : undefined),
    youtube: dependencies.collectors?.youtube ?? (provider ? new YouTubeSearchCollector(provider) : undefined),
    reviews: dependencies.collectors?.reviews ?? (provider ? new ReviewMiningCollector(provider) : undefined),
    competitors: dependencies.collectors?.competitors ?? new CompetitorPageCollector(),
  };
}

function createDefaultSerpProvider(config: CollectorConfig): SerpProvider | undefined {
  if (!config.serp.enabled || config.serp.provider !== 'serpapi') {
    return undefined;
  }

  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  return new SerpApiProvider({ apiKey });
}

function buildExternalQueries(queries: QueryRow[], predictions: UniquePrediction[]): string[] {
  const ranked = [
    ...predictions
      .filter((prediction) => prediction.intent !== 'low intent')
      .sort((left, right) => right.confidenceScore - left.confidenceScore)
      .map((prediction) => prediction.query),
    ...queries
      .sort((left, right) => (right.priority_score ?? 0) - (left.priority_score ?? 0))
      .map((query) => query.query),
  ];
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const query of ranked) {
    const normalized = normalizeQuery(query);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(query);
    if (unique.length >= 8) {
      break;
    }
  }

  return unique;
}

function shouldRun(optionValue: boolean | undefined, configValue: boolean): boolean {
  return optionValue ?? configValue;
}

function emptyExternalSummary(enabled: boolean): ExternalEvidenceSummary {
  return {
    enabled,
    warnings: [],
    collectorRuns: [],
    sources: [],
    evidence: [],
    competitors: [],
  };
}

function skippedRun(collector: ExternalCollectorRun['collector']): ExternalCollectorRun {
  return {
    collector,
    status: 'skipped',
    itemCount: 0,
    errorCount: 0,
  };
}

function appendWarning(summary: ExternalEvidenceSummary, warning?: string): void {
  if (warning) {
    summary.warnings.push(warning);
  }
}

function persistSources(args: {
  db: DatabaseSync;
  fetchedAt: string;
  ideaId: number;
  inputs: CreateSourceInput[];
  seenSourceKeys: Set<string>;
}): SourceRow[] {
  const inputs = args.inputs.filter((input) => {
    const key = `${input.sourceType}|${input.url}`;
    if (args.seenSourceKeys.has(key)) {
      return false;
    }

    args.seenSourceKeys.add(key);
    return true;
  });
  if (inputs.length === 0) {
    return [];
  }

  return createSources(args.db, inputs);
}

function persistExtractedEvidence(db: DatabaseSync, ideaId: number, sources: SourceRow[], createdAt: string) {
  const inserts = sources
    .filter((source) => isEvidenceFriendlySource(source))
    .flatMap((source) => extractEvidenceFromSource({ createdAt, ideaId, source }));
  if (inserts.length === 0) {
    return [];
  }

  return createEvidence(db, inserts);
}

async function runCollector<TOutput extends { blocked: boolean; errors: Array<unknown>; fetchedAt: string; items: Array<unknown>; rawMetadata: Record<string, unknown> }>(args: {
  db: DatabaseSync;
  jobId: number;
  collectorName: ExternalCollectorRun['collector'];
  collector: { collect(input: unknown): Promise<TOutput>; name: string } | undefined;
  input: unknown;
  missingMessage: string;
}): Promise<{ output?: TOutput; run: ExternalCollectorRun }> {
  const startedAt = new Date().toISOString();
  const toolRun = createToolRun(args.db, {
    jobId: args.jobId,
    toolName: `external.${args.collectorName}`,
    inputJson: JSON.stringify(args.input),
    metadataJson: JSON.stringify({ collector: args.collectorName }),
    status: 'running',
    startedAt,
  });

  if (!args.collector) {
    blockToolRun(args.db, toolRun.id, args.missingMessage, new Date().toISOString());
    return {
      run: {
        collector: args.collectorName,
        status: 'blocked',
        itemCount: 0,
        errorCount: 0,
        toolRunId: toolRun.id,
        warning: args.missingMessage,
      },
    };
  }

  try {
    const output = await args.collector.collect(args.input);
    const completedAt = new Date().toISOString();
    const outputJson = JSON.stringify(output);
    const metadataJson = JSON.stringify({
      collector: args.collector.name,
      errorCount: output.errors.length,
      itemCount: output.items.length,
      rawMetadata: output.rawMetadata,
    });

    if (output.blocked && output.items.length === 0) {
      blockToolRun(
        args.db,
        toolRun.id,
        firstErrorMessage(output.errors) ?? `${args.collectorName} collector was blocked.`,
        completedAt,
        outputJson,
        metadataJson,
      );
      return {
        run: {
          collector: args.collectorName,
          status: 'blocked',
          itemCount: 0,
          errorCount: output.errors.length,
          toolRunId: toolRun.id,
          warning: firstErrorMessage(output.errors),
        },
      };
    }

    completeToolRun(args.db, toolRun.id, outputJson, completedAt, metadataJson);
    return {
      output,
      run: {
        collector: args.collectorName,
        status: 'completed',
        itemCount: output.items.length,
        errorCount: output.errors.length,
        toolRunId: toolRun.id,
        warning: output.errors.length > 0 ? `${args.collectorName} collector completed with ${output.errors.length} warning(s).` : undefined,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failToolRun(args.db, toolRun.id, message, new Date().toISOString());
    return {
      run: {
        collector: args.collectorName,
        status: 'failed',
        itemCount: 0,
        errorCount: 1,
        toolRunId: toolRun.id,
        warning: message,
      },
    };
  }
}

function firstErrorMessage(errors: Array<unknown>): string | undefined {
  for (const error of errors) {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }
  }

  return undefined;
}
