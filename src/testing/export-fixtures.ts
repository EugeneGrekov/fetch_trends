import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { completeToolRun, createToolRun } from '../db/repositories/tool-runs.js';
import { createAutocompletePredictions } from '../db/repositories/autocomplete-predictions.js';
import { createCompetitors } from '../db/repositories/competitors.js';
import { createEvidence } from '../db/repositories/evidence.js';
import { createExperiment, createExperimentDecision, createExperimentEvents, createMeasurementSnapshot } from '../db/repositories/experiments.js';
import { createIdeaDecision } from '../db/repositories/idea-decisions.js';
import { createIdea } from '../db/repositories/ideas.js';
import { createJob } from '../db/repositories/jobs.js';
import { createQueries } from '../db/repositories/queries.js';
import { createRevalidationQueueItem, createRevalidationRun } from '../db/repositories/revalidation.js';
import { createReport } from '../db/repositories/reports.js';
import { createScore } from '../db/repositories/scores.js';
import { createSources } from '../db/repositories/sources.js';
import type { CreateAutocompletePredictionInput } from '../db/schema.js';

export interface SeedExportFixtureResult {
  artifactRoot: string;
  ideaId: number;
  reportId: number;
}

export async function seedExportFixture(dbPath: string, artifactRoot: string, suffix: string): Promise<SeedExportFixtureResult> {
  const { db } = await openDatabase(dbPath);
  applyMigrations(db);

  try {
    const title = `Invoice late fee calculator ${suffix}`;
    const idea = createIdea(db, {
      businessModel: 'one-time payment',
      expectedPrice: '$29',
      platform: 'web',
      rawDescription: `Generate late fee wording and amounts for overdue freelance invoices. ${suffix}`,
      status: 'validated',
      targetMarket: 'freelance designers',
      title,
    });
    const job = createJob(db, {
      ideaId: idea.id,
      jobType: 'validate',
      startedAt: '2026-07-07T10:00:00.000Z',
      status: 'completed',
    });
    const toolRun = createToolRun(db, {
      inputJson: JSON.stringify({ seed: title }),
      jobId: job.id,
      metadataJson: JSON.stringify({ artifactPath: join(artifactRoot, 'private', suffix), sourceUrl: `https://example.test/${suffix}/tool` }),
      startedAt: '2026-07-07T10:00:30.000Z',
      status: 'running',
      toolName: 'autocomplete',
    });
    completeToolRun(
      db,
      toolRun.id,
      JSON.stringify({
        localPath: join(artifactRoot, String(idea.id), 'validation-report.md'),
        rawOutput: `https://example.test/${suffix}/tool`,
      }),
      '2026-07-07T10:02:00.000Z',
      JSON.stringify({ finished: true, sourcePath: join(artifactRoot, String(idea.id)) }),
    );
    const query = createQueries(db, [
      {
        createdAt: '2026-07-07T10:00:00.000Z',
        ideaId: idea.id,
        intentType: 'high purchase intent',
        normalizedQuery: `invoice late fee calculator ${suffix}`,
        priorityScore: 90,
        query: `invoice late fee calculator ${suffix}`,
        source: 'fixture',
      },
    ])[0];
    createAutocompletePredictions(db, [
      prediction(idea.id, query?.id ?? null, `invoice late fee calculator for freelancers ${suffix}`),
    ]);
    const source = createSources(db, [
      {
        fetchedAt: '2026-07-07T10:00:00.000Z',
        ideaId: idea.id,
        snippet: `Freelancers discuss overdue invoice fee wording ${suffix}.`,
        sourceType: 'reddit_thread',
        title: `Overdue invoice fees ${suffix}`,
        url: `https://example.test/${suffix}/thread`,
      },
    ])[0];
    createEvidence(db, [
      {
        complaint: 'Clients ignore overdue reminders.',
        confidenceScore: 82,
        createdAt: '2026-07-07T10:00:00.000Z',
        ideaId: idea.id,
        painType: 'payment delay',
        paymentSignal: 'direct',
        quote: `I would pay once for the right late-fee wording ${suffix}.`,
        sourceId: source?.id ?? 0,
        trigger: 'calculate late fees for overdue freelance invoices',
        urgency: 'high',
        workaround: 'manual email templates',
      },
    ]);
    createCompetitors(db, [
      {
        createdAt: '2026-07-07T10:00:00.000Z',
        ideaId: idea.id,
        name: `Invoice Fee Tool ${suffix}`,
        priceText: '$29 one-time',
        pricingModel: 'one-time',
        productType: 'direct_competitor',
        reviewSummary: 'Users mention wording uncertainty.',
        url: `https://example.test/${suffix}/tool`,
      },
    ]);
    createScore(db, {
      createdAt: '2026-07-07T10:00:00.000Z',
      decision: 'validate deeper',
      ideaId: idea.id,
      scoreJson: JSON.stringify({ suffix }),
      scoreType: 'search-language',
      totalScore: 82,
    });
    const report = createReport(db, {
      createdAt: '2026-07-07T10:00:00.000Z',
      ideaId: idea.id,
      jobId: job.id,
      json: JSON.stringify({
        evidenceQuote: `I would pay once for the right late-fee wording ${suffix}.`,
        sourceUrl: `https://example.test/${suffix}/thread`,
      }),
      markdown: [
        '# Validation Report',
        '',
        `Source: https://example.test/${suffix}/thread`,
        `Quote: I would pay once for the right late-fee wording ${suffix}.`,
      ].join('\n'),
      reportType: 'search-language-validation',
    });
    const experiment = createExperiment(db, {
      createdAt: '2026-07-07T10:05:00.000Z',
      experimentType: 'fake_door',
      ideaId: idea.id,
      launchedAt: '2026-07-07T10:05:00.000Z',
      reportId: report.id,
      status: 'running',
      thresholdJson: JSON.stringify({ suffix }),
      title: `Late fee calculator paid preview ${suffix}`,
    });
    createExperimentEvents(db, [
      {
        createdAt: '2026-07-07T10:10:00.000Z',
        eventName: 'page_view',
        experimentId: experiment.id,
        metadataJson: JSON.stringify({ path: `/ideas/${idea.id}`, suffix }),
        occurredAt: '2026-07-07T10:10:00.000Z',
        sessionId: 'fixture-session',
        source: 'fixture',
      },
    ]);
    createMeasurementSnapshot(db, {
      createdAt: '2026-07-07T10:20:00.000Z',
      experimentId: experiment.id,
      metricsJson: JSON.stringify({ visitors: 1, suffix }),
      thresholdResultsJson: JSON.stringify([{ condition: 'fixture', signal: 'weak' }]),
    });
    createExperimentDecision(db, {
      createdAt: '2026-07-07T10:25:00.000Z',
      decision: 'inconclusive',
      experimentId: experiment.id,
      reason: `Needs more visitors ${suffix}.`,
      reportId: null,
    });
    createIdeaDecision(db, {
      confidence: 'medium',
      createdAt: '2026-07-07T10:30:00.000Z',
      decision: 'persevere',
      evidenceJson: JSON.stringify({ suffix }),
      experimentId: experiment.id,
      ideaId: idea.id,
      nextAction: `Run a payment test ${suffix}.`,
      reason: `Fixture evidence is promising but incomplete ${suffix}.`,
      reportId: report.id,
    });
    createRevalidationRun(db, {
      ideaId: idea.id,
      mode: 'scan',
      startedAt: '2026-07-07T10:35:00.000Z',
      status: 'completed',
    });
    createRevalidationQueueItem(db, {
      ideaId: idea.id,
      createdAt: '2026-07-07T10:40:00.000Z',
      reason: `Fixture evidence is stale ${suffix}.`,
      staleReasonJson: JSON.stringify({ suffix }),
      taskType: 'refresh_autocomplete',
    });

    await createIdeaArtifacts(artifactRoot, idea.id, suffix);

    return {
      artifactRoot,
      ideaId: idea.id,
      reportId: report.id,
    };
  } finally {
    db.close();
  }
}

async function createIdeaArtifacts(artifactRoot: string, ideaId: number, suffix: string): Promise<void> {
  const ideaDir = join(artifactRoot, String(ideaId));
  await mkdir(join(ideaDir, 'nested'), { recursive: true });
  await writeFile(join(ideaDir, 'validation-report.md'), `artifact report ${suffix}\n`);
  await writeFile(join(ideaDir, 'nested', 'note.txt'), `nested artifact ${suffix}\n`);
}

function prediction(
  ideaId: number,
  queryId: number | null,
  predictionText: string,
): CreateAutocompletePredictionInput {
  return {
    confidenceScore: 90,
    country: 'US',
    createdAt: '2026-07-07T10:01:00.000Z',
    ideaId,
    intent: 'problem intent',
    language: 'en',
    normalizedPrediction: predictionText,
    prediction: predictionText,
    queryId,
    sourcePrefix: predictionText,
    sourceSeed: predictionText,
  };
}
