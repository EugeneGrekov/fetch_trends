import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalAiRunner } from '../ai/runner.js';
import type {
  EvidenceSummaryOutput,
  FinalReportInput,
  FinalReportOutput,
  IdeaNormalizeInput,
  IdeaNormalizeOutput,
  QueryGenerateInput,
  QueryGenerateOutput,
} from '../ai/types.js';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { createAutocompletePredictions } from '../db/repositories/autocomplete-predictions.js';
import { createIdea, updateIdea } from '../db/repositories/ideas.js';
import { completeJob, createJob, failJob } from '../db/repositories/jobs.js';
import { createQueries } from '../db/repositories/queries.js';
import { createReport } from '../db/repositories/reports.js';
import { createScore } from '../db/repositories/scores.js';
import { completeToolRun, createToolRun, failToolRun } from '../db/repositories/tool-runs.js';
import { buildUniquePredictions, classifyIntent, scoreConfidence } from '../utilities/autocomplete/analysis.js';
import { PlaywrightAutocompleteCollector } from '../utilities/autocomplete/collector.js';
import { normalizeQuery } from '../utilities/autocomplete/normalize.js';
import { runAutocompleteResearch } from '../utilities/autocomplete/runner.js';
import type { RunOptions, UniquePrediction } from '../utilities/autocomplete/types.js';
import { normalizeIdea } from './idea-normalizer.js';
import { generateInitialQueries } from './query-generator.js';
import { buildDeterministicEvidenceSummary, buildValidationMarkdownReport } from './report-generator.js';
import { buildSearchLanguageScore } from './scoring.js';
import type { NormalizedIdea, ValidationAiSummary, ValidationDependencies, ValidationOptions, ValidationResult } from './types.js';

const DEFAULT_OUTPUT_DIR = './results/validate';
const DEFAULT_AI_ARTIFACTS_DIR = './artifacts/ai-runs';
const DEFAULT_AI_QUERY_COUNT = 12;

export async function runValidationJob(
  options: ValidationOptions,
  dependencies: ValidationDependencies = {},
): Promise<ValidationResult> {
  const { db, dbPath } = await openDatabase(options.dbPath);
  applyMigrations(db);

  const deterministicIdea = normalizeIdea(options.idea);
  let idea = createIdea(db, {
    title: deterministicIdea.title,
    rawDescription: deterministicIdea.cleanedIdea,
    normalizedJson: JSON.stringify({ source: 'deterministic', ...deterministicIdea }),
    targetMarket: deterministicIdea.targetMarket,
    platform: deterministicIdea.platform,
    expectedPrice: deterministicIdea.expectedPrice,
    businessModel: deterministicIdea.businessModel,
    status: 'new',
  });
  const job = createJob(db, {
    ideaId: idea.id,
    jobType: 'validate',
    status: 'running',
    startedAt: new Date().toISOString(),
  });

  const aiSummary: ValidationAiSummary = {
    evidenceSummary: emptyEvidenceSummary(),
    taskResults: [],
    used: false,
    warnings: [],
  };

  let autocompleteToolRunId: number | undefined;

  try {
    let finalIdea = deterministicIdea;
    const aiRunner = options.ai
      ? new LocalAiRunner({
          artifactsRoot: options.aiArtifactsDir ?? DEFAULT_AI_ARTIFACTS_DIR,
          db,
          executor: dependencies.aiExecutor,
          keepArtifacts: options.keepAiArtifacts,
          model: options.aiModel,
          reasoning: options.aiReasoning,
        })
      : undefined;

    if (aiRunner) {
      const ideaRun = await aiRunner.runTask<IdeaNormalizeInput, IdeaNormalizeOutput>({
        artifactsRoot: options.aiArtifactsDir ?? DEFAULT_AI_ARTIFACTS_DIR,
        dbPath,
        input: {
          rawIdea: options.idea,
          targetMarket: deterministicIdea.targetMarket,
          expectedPrice: deterministicIdea.expectedPrice,
          platform: deterministicIdea.platform,
        },
        jobId: job.id,
        keepArtifacts: options.keepAiArtifacts,
        model: options.aiModel,
        reasoning: options.aiReasoning,
        task: 'idea_normalize',
      });
      aiSummary.taskResults.push({
        errorMessage: ideaRun.errorMessage,
        status: ideaRun.status,
        task: 'idea_normalize',
        toolRunId: ideaRun.toolRunId,
      });

      if (ideaRun.status === 'completed' && ideaRun.output) {
        aiSummary.ideaNormalization = ideaRun.output;
        aiSummary.used = true;
        finalIdea = mergeNormalizedIdea(deterministicIdea, ideaRun.output);
        idea = updateIdea(db, idea.id, {
          title: finalIdea.title,
          rawDescription: finalIdea.cleanedIdea,
          normalizedJson: JSON.stringify({
            source: 'ai',
            rawIdea: options.idea,
            deterministic: deterministicIdea,
            ai: ideaRun.output,
          }),
          targetMarket: finalIdea.targetMarket,
          platform: finalIdea.platform,
          expectedPrice: finalIdea.expectedPrice,
          businessModel: finalIdea.businessModel,
        });
      } else if (ideaRun.errorMessage) {
        aiSummary.warnings.push(`Idea normalization fell back to deterministic logic: ${ideaRun.errorMessage}`);
      }
    }

    const generatedQueries = await selectQueries({
      aiRunner,
      aiSummary,
      idea: finalIdea,
      jobId: job.id,
      options,
    });
    const queryTimestamp = new Date().toISOString();
    const queries = createQueries(
      db,
      generatedQueries.map((query) => ({
        ideaId: idea.id,
        query: query.query,
        normalizedQuery: query.normalizedQuery,
        intentType: query.intentType,
        source: query.source,
        priorityScore: query.priorityScore,
        createdAt: queryTimestamp,
      })),
    );
    const queryIdBySeed = new Map(queries.map((query) => [normalizeQuery(query.query), query.id]));

    const outDir = options.outDir ?? DEFAULT_OUTPUT_DIR;
    await mkdir(outDir, { recursive: true });
    const outputPath = join(outDir, `${formatJobSlug(job.id, idea.title)}.csv`);
    const runOptions: RunOptions = {
      seeds: queries.map((query) => query.query),
      country: options.country.toUpperCase(),
      language: options.language,
      depth: options.depth,
      out: outputPath,
      modifiers: options.modifiers,
      headless: options.headless,
      delayMs: options.delayMs,
      maxPrefixes: options.maxPrefixes,
      maxDepth2Prefixes: options.maxDepth2Prefixes,
      resume: false,
    };

    const autocompleteToolRun = createToolRun(db, {
      jobId: job.id,
      toolName: 'autocomplete',
      inputJson: JSON.stringify(runOptions),
      metadataJson: JSON.stringify({ utility: 'autocomplete' }),
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    autocompleteToolRunId = autocompleteToolRun.id;

    const collectorFactory = dependencies.createCollector ?? ((headless: boolean) => new PlaywrightAutocompleteCollector(headless));
    const collector = collectorFactory(runOptions.headless);
    const autocompleteReport = await runAutocompleteResearch(runOptions, collector);
    const uniquePredictions = buildUniquePredictions(autocompleteReport.collectedPredictions);
    const predictionTimestamp = new Date().toISOString();

    createAutocompletePredictions(
      db,
      autocompleteReport.collectedPredictions.map((prediction) => {
        const normalizedPrediction = normalizeQuery(prediction.prediction);
        return {
          ideaId: idea.id,
          queryId: queryIdBySeed.get(normalizeQuery(prediction.originalSeed)) ?? null,
          prediction: prediction.prediction,
          normalizedPrediction,
          intent: classifyIntent(prediction.prediction),
          confidenceScore: scoreConfidence(prediction.prediction, 1, 1),
          sourceSeed: prediction.originalSeed,
          sourcePrefix: prediction.sourcePrefix,
          country: prediction.country,
          language: prediction.language,
          createdAt: predictionTimestamp,
        };
      }),
    );

    const scoreModel = buildSearchLanguageScore(uniquePredictions);
    const scoreTimestamp = new Date().toISOString();
    const score = createScore(db, {
      ideaId: idea.id,
      scoreType: 'search-language',
      scoreJson: JSON.stringify(scoreModel.breakdown),
      totalScore: scoreModel.totalScore,
      decision: scoreModel.decision,
      createdAt: scoreTimestamp,
    });

    aiSummary.evidenceSummary = buildDeterministicEvidenceSummary({
      predictions: uniquePredictions,
      queries,
      score: scoreModel,
    });

    if (aiRunner) {
      const evidenceRun = await aiRunner.runTask<
        {
          autocompletePredictions: Array<Record<string, unknown>>;
          idea: Record<string, unknown>;
          scores: Record<string, unknown>;
        },
        EvidenceSummaryOutput
      >({
        artifactsRoot: options.aiArtifactsDir ?? DEFAULT_AI_ARTIFACTS_DIR,
        dbPath,
        input: {
          idea: buildIdeaPayload(idea, finalIdea),
          autocompletePredictions: uniquePredictions.slice(0, 40).map((prediction) => ({
            query: prediction.query,
            intent: prediction.intent,
            confidenceScore: prediction.confidenceScore,
            sourceSeedCount: prediction.sourceSeedCount,
          })),
          scores: {
            totalScore: scoreModel.totalScore,
            decision: scoreModel.decision,
            breakdown: scoreModel.breakdown,
          },
        },
        jobId: job.id,
        keepArtifacts: options.keepAiArtifacts,
        model: options.aiModel,
        reasoning: options.aiReasoning,
        task: 'evidence_summarize',
      });
      aiSummary.taskResults.push({
        errorMessage: evidenceRun.errorMessage,
        status: evidenceRun.status,
        task: 'evidence_summarize',
        toolRunId: evidenceRun.toolRunId,
      });

      if (evidenceRun.status === 'completed' && evidenceRun.output) {
        aiSummary.evidenceSummary = evidenceRun.output;
        aiSummary.used = true;
      } else if (evidenceRun.errorMessage) {
        aiSummary.warnings.push(`Evidence summary fell back to deterministic logic: ${evidenceRun.errorMessage}`);
      }
    }

    let finalReport: FinalReportOutput | undefined;
    if (aiRunner) {
      const finalReportRun = await aiRunner.runTask<FinalReportInput, FinalReportOutput>({
        artifactsRoot: options.aiArtifactsDir ?? DEFAULT_AI_ARTIFACTS_DIR,
        dbPath,
        input: {
          idea: buildIdeaPayload(idea, finalIdea),
          evidenceSummary: aiSummary.evidenceSummary,
          scores: {
            totalScore: scoreModel.totalScore,
            decision: scoreModel.decision,
            breakdown: scoreModel.breakdown,
          },
          autocompletePredictions: uniquePredictions.slice(0, 40).map((prediction) => ({
            query: prediction.query,
            intent: prediction.intent,
            confidenceScore: prediction.confidenceScore,
            nextValidationStep: prediction.nextValidationStep,
          })),
        },
        jobId: job.id,
        keepArtifacts: options.keepAiArtifacts,
        model: options.aiModel,
        reasoning: options.aiReasoning,
        task: 'final_report',
      });
      aiSummary.taskResults.push({
        errorMessage: finalReportRun.errorMessage,
        status: finalReportRun.status,
        task: 'final_report',
        toolRunId: finalReportRun.toolRunId,
      });

      if (finalReportRun.status === 'completed' && finalReportRun.output) {
        finalReport = finalReportRun.output;
        aiSummary.finalReport = finalReportRun.output;
        aiSummary.used = true;
      } else if (finalReportRun.errorMessage) {
        aiSummary.warnings.push(`Final report fell back to deterministic logic: ${finalReportRun.errorMessage}`);
      }
    }

    const markdown = finalReport?.markdown ?? buildValidationMarkdownReport({
      evidenceSummary: aiSummary.evidenceSummary,
      idea,
      nextAction: finalReport?.nextAction,
      queries,
      predictions: uniquePredictions,
      score: scoreModel,
      verdict: finalReport?.verdict,
    });
    const reportTimestamp = new Date().toISOString();
    const report = createReport(db, {
      ideaId: idea.id,
      jobId: job.id,
      reportType: 'search-language-validation',
      markdown,
      json: JSON.stringify({
        ai: {
          taskResults: aiSummary.taskResults,
          used: aiSummary.used,
          warnings: aiSummary.warnings,
        },
        evidenceSummary: aiSummary.evidenceSummary,
        finalReport,
        finalSummary: autocompleteReport.finalSummary,
        score: scoreModel,
      }),
      createdAt: reportTimestamp,
    });

    const completedAutocompleteToolRun = completeToolRun(
      db,
      autocompleteToolRun.id,
      JSON.stringify(autocompleteReport),
      new Date().toISOString(),
    );
    const completedJob = completeJob(db, job.id, new Date().toISOString());

    return {
      ai: aiSummary,
      dbPath,
      outputPath,
      idea,
      job: completedJob,
      toolRun: completedAutocompleteToolRun,
      queries,
      autocompleteReport,
      score,
      report,
      markdown,
      uniquePredictions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date().toISOString();

    if (autocompleteToolRunId) {
      failToolRun(db, autocompleteToolRunId, message, failedAt);
    }

    failJob(db, job.id, message, failedAt);
    throw error;
  } finally {
    db.close();
  }
}

async function selectQueries(args: {
  aiRunner?: LocalAiRunner;
  aiSummary: ValidationAiSummary;
  idea: NormalizedIdea;
  jobId: number;
  options: ValidationOptions;
}): Promise<Array<{
  intentType: string;
  normalizedQuery: string;
  priorityScore: number;
  query: string;
  source: string;
}>> {
  const deterministicQueries = generateInitialQueries(args.idea);

  if (!args.aiRunner) {
    return deterministicQueries;
  }

  const queryRun = await args.aiRunner.runTask<QueryGenerateInput, QueryGenerateOutput>({
    artifactsRoot: args.options.aiArtifactsDir ?? DEFAULT_AI_ARTIFACTS_DIR,
    input: {
      normalizedIdea: {
        title: args.idea.title,
        cleanedIdea: args.idea.cleanedIdea,
        keywordTokens: args.idea.keywordTokens,
        targetMarket: args.idea.targetMarket,
        platform: args.idea.platform,
        expectedPrice: args.idea.expectedPrice,
        businessModel: args.idea.businessModel,
      },
      targetMarket: args.idea.targetMarket,
      queryCount: DEFAULT_AI_QUERY_COUNT,
    },
    jobId: args.jobId,
    keepArtifacts: args.options.keepAiArtifacts,
    model: args.options.aiModel,
    reasoning: args.options.aiReasoning,
    task: 'query_generate',
  });
  args.aiSummary.taskResults.push({
    errorMessage: queryRun.errorMessage,
    status: queryRun.status,
    task: 'query_generate',
    toolRunId: queryRun.toolRunId,
  });

  if (queryRun.status !== 'completed' || !queryRun.output) {
    if (queryRun.errorMessage) {
      args.aiSummary.warnings.push(`Query generation fell back to deterministic logic: ${queryRun.errorMessage}`);
    }
    return deterministicQueries;
  }

  args.aiSummary.queryGeneration = queryRun.output;
  args.aiSummary.used = true;

  const deduped = new Map<string, {
    intentType: string;
    normalizedQuery: string;
    priorityScore: number;
    query: string;
    source: string;
  }>();

  for (const item of queryRun.output.queries) {
    const normalizedQuery = normalizeQuery(item.query);
    if (!normalizedQuery) {
      continue;
    }

    if (!deduped.has(normalizedQuery)) {
      deduped.set(normalizedQuery, {
        intentType: item.intent,
        normalizedQuery,
        priorityScore: clampPriority(item.priority),
        query: item.query.trim(),
        source: 'ai',
      });
    }
  }

  if (deduped.size === 0) {
    args.aiSummary.warnings.push('Query generation returned no usable queries and fell back to deterministic logic.');
    return deterministicQueries;
  }

  return [...deduped.values()]
    .sort((left, right) => right.priorityScore - left.priorityScore || left.normalizedQuery.localeCompare(right.normalizedQuery))
    .slice(0, DEFAULT_AI_QUERY_COUNT);
}

function mergeNormalizedIdea(base: NormalizedIdea, ai: IdeaNormalizeOutput): NormalizedIdea {
  const keywordSource = normalizeQuery([ai.title, ai.user, ai.pain, ai.trigger].join(' '));
  const keywordTokens = keywordSource
    .split(' ')
    .filter(Boolean)
    .slice(0, 8);

  return {
    cleanedIdea: base.cleanedIdea,
    title: ai.title || base.title,
    keywordTokens: keywordTokens.length > 0 ? keywordTokens : base.keywordTokens,
    targetMarket: ai.user || base.targetMarket,
    platform: base.platform,
    expectedPrice: ai.price_range || base.expectedPrice,
    businessModel: ai.business_model || base.businessModel,
  };
}

function buildIdeaPayload(idea: ValidationResult['idea'], normalizedIdea: NormalizedIdea): Record<string, unknown> {
  return {
    id: idea.id,
    title: idea.title,
    rawDescription: idea.raw_description,
    targetMarket: idea.target_market,
    platform: idea.platform,
    expectedPrice: idea.expected_price,
    businessModel: idea.business_model,
    normalizedIdea,
  };
}

function clampPriority(priority: number): number {
  if (!Number.isFinite(priority)) {
    return 50;
  }

  return Math.max(1, Math.min(100, Math.round(priority)));
}

function emptyEvidenceSummary(): EvidenceSummaryOutput {
  return {
    facts: [],
    inferences: [],
    assumptions: [],
    missingProof: [],
    redFlags: [],
  };
}

function formatJobSlug(jobId: number, title: string): string {
  const slug = normalizeQuery(title).replace(/\s+/g, '-').slice(0, 72);
  return `job-${jobId}-${slug || 'validation'}`;
}
