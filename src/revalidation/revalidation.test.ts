import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRevalidateProgram } from '../commands/revalidate.js';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { createAutocompletePredictions, listAutocompletePredictionsByIdea } from '../db/repositories/autocomplete-predictions.js';
import { listCompetitorsByIdea } from '../db/repositories/competitors.js';
import { createIdea } from '../db/repositories/ideas.js';
import { createQueries } from '../db/repositories/queries.js';
import {
  createRevalidationQueueItem,
  listRevalidationQueueByIdea,
  listRevalidationRules,
} from '../db/repositories/revalidation.js';
import { createReport, listReportsByIdea } from '../db/repositories/reports.js';
import { createScore, listScoresByIdea } from '../db/repositories/scores.js';
import { listSourcesByIdea } from '../db/repositories/sources.js';
import type { IdeaRow } from '../db/schema.js';
import { runPendingRevalidation } from './revalidation-runner.js';
import { scanForRevalidation } from './scheduler.js';
import { evaluateIdeaStaleness } from './stale-evidence.js';
import type { IdeaEvidenceSnapshot, RevalidationTaskService } from './types.js';

const tempDirs: string[] = [];
const NOW = '2026-07-07T12:00:00.000Z';

describe('scheduled revalidation', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
    process.exitCode = undefined;
  });

  it('calculates stale and fresh evidence by source family', () => {
    const stale = evaluateIdeaStaleness(snapshotFixture({
      autocompleteAt: '2026-03-01T00:00:00.000Z',
      reportAt: '2026-03-01T00:05:00.000Z',
      scoreAt: '2026-03-01T00:04:00.000Z',
      serpAt: '2026-05-01T00:00:00.000Z',
    }), new Date(NOW));

    expect(stale.stale).toBe(true);
    expect(stale.confidenceImpact).toBe('high');
    expect(stale.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recommendedTask: 'refresh_autocomplete', type: 'autocomplete_prediction' }),
        expect.objectContaining({ recommendedTask: 'refresh_serp', type: 'serp_result' }),
      ]),
    );

    const fresh = evaluateIdeaStaleness(snapshotFixture({
      autocompleteAt: '2026-07-01T00:00:00.000Z',
      reportAt: '2026-07-01T00:05:00.000Z',
      scoreAt: '2026-07-01T00:04:00.000Z',
      serpAt: '2026-07-01T00:00:00.000Z',
    }), new Date(NOW));

    expect(fresh.stale).toBe(false);
    expect(fresh.reasons).toHaveLength(0);
  });

  it('queues stale tasks, avoids duplicate open tasks, and stores default rules', async () => {
    const dir = await createTempDir();
    const { db } = await openDatabase(join(dir, 'queue.sqlite'));
    applyMigrations(db);

    try {
      const idea = seedStaleIdea(db);

      const firstScan = scanForRevalidation(db, { ideaId: idea.id, now: NOW });
      const secondScan = scanForRevalidation(db, { ideaId: idea.id, now: NOW });

      expect(firstScan.staleResults).toHaveLength(1);
      expect(firstScan.queued.map((item) => item.task_type)).toEqual([
        'refresh_autocomplete',
        'refresh_serp',
        'refresh_competitors',
        'refresh_reviews',
        'refresh_score',
        'refresh_report',
      ]);
      expect(secondScan.queued).toHaveLength(0);
      expect(secondScan.skippedExisting).toHaveLength(6);
      expect(listRevalidationQueueByIdea(db, idea.id)).toHaveLength(6);
      expect(listRevalidationRules(db).map((rule) => rule.evidence_type)).toContain('autocomplete_prediction');
    } finally {
      db.close();
    }
  });

  it('runs pending tasks with fake services and appends evidence, scores, and reports', async () => {
    const dir = await createTempDir();
    const { db } = await openDatabase(join(dir, 'runner.sqlite'));
    applyMigrations(db);

    try {
      const idea = seedStaleIdea(db);
      scanForRevalidation(db, { ideaId: idea.id, now: NOW });

      const result = await runPendingRevalidation(db, {
        country: 'US',
        ideaId: idea.id,
        language: 'en',
        now: NOW,
        services: fakeServices(),
      });

      expect(result.run.status).toBe('completed');
      expect(result.processed.map((item) => item.status)).toEqual([
        'completed',
        'completed',
        'completed',
        'completed',
        'completed',
        'completed',
      ]);
      expect(listAutocompletePredictionsByIdea(db, idea.id).length).toBeGreaterThan(1);
      expect(listSourcesByIdea(db, idea.id).map((source) => source.source_type)).toEqual([
        'review_page',
        'competitor_page',
        'serp_result',
      ]);
      expect(listCompetitorsByIdea(db, idea.id)).toEqual([
        expect.objectContaining({ name: 'Fresh Parking App', price_text: '$19 one-time' }),
      ]);
      expect(listScoresByIdea(db, idea.id)).toEqual([
        expect.objectContaining({ score_type: 'revalidation_search_language' }),
        expect.objectContaining({ score_type: 'search-language' }),
      ]);
      expect(listReportsByIdea(db, idea.id)).toEqual([
        expect.objectContaining({ report_type: 'revalidation_report' }),
        expect.objectContaining({ report_type: 'search-language-validation' }),
      ]);
      expect(listReportsByIdea(db, idea.id)[0]?.markdown).toContain('## What Was Stale');
    } finally {
      db.close();
    }
  });

  it('marks unavailable collectors as blocked instead of crashing', async () => {
    const dir = await createTempDir();
    const { db } = await openDatabase(join(dir, 'blocked.sqlite'));
    applyMigrations(db);

    try {
      const idea = createIdea(db, {
        rawDescription: 'Simple test idea',
        title: 'Simple test idea',
      });
      createRevalidationQueueItem(db, {
        createdAt: NOW,
        ideaId: idea.id,
        reason: 'No review evidence exists.',
        taskType: 'refresh_reviews',
      });

      const result = await runPendingRevalidation(db, { ideaId: idea.id, now: NOW, services: {} });

      expect(result.run.status).toBe('completed');
      expect(result.processed).toEqual([
        expect.objectContaining({
          status: 'blocked',
          error_message: 'review revalidation service is unavailable or not configured.',
        }),
      ]);
    } finally {
      db.close();
    }
  });

  it('supports CLI scan mode with temp SQLite data', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'cli.sqlite');
    const { db } = await openDatabase(dbPath);
    applyMigrations(db);
    const idea = seedStaleIdea(db);
    db.close();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await buildRevalidateProgram().parseAsync([
      'node',
      'revalidate',
      '--db',
      dbPath,
      '--scan',
      '--idea-id',
      String(idea.id),
    ]);

    const reopened = await openDatabase(dbPath);
    try {
      expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Revalidation scan'));
      expect(listRevalidationQueueByIdea(reopened.db, idea.id).length).toBeGreaterThan(0);
    } finally {
      reopened.db.close();
    }
  });
});

function fakeServices(): {
  autocomplete: RevalidationTaskService;
  competitors: RevalidationTaskService;
  reviews: RevalidationTaskService;
  serp: RevalidationTaskService;
} {
  return {
    autocomplete: {
      async refresh() {
        return {
          status: 'completed',
          autocompletePredictions: [
            {
              country: 'US',
              createdAt: NOW,
              language: 'en',
              prediction: 'automatic parked car location app one time payment',
              sourcePrefix: 'automatic parked car location app',
              sourceSeed: 'automatic parked car location app',
            },
          ],
        };
      },
    },
    serp: {
      async refresh() {
        return {
          status: 'completed',
          sources: [
            {
              fetchedAt: NOW,
              sourceType: 'serp_result',
              title: 'Best parked car locator apps',
              snippet: 'Comparison of parking locator tools and paid apps.',
              url: 'https://example.test/parking-tools',
            },
          ],
        };
      },
    },
    competitors: {
      async refresh() {
        return {
          status: 'completed',
          competitors: [
            {
              createdAt: NOW,
              name: 'Fresh Parking App',
              priceText: '$19 one-time',
              pricingModel: 'one-time',
              productType: 'direct_competitor',
              strengths: ['Simple setup'],
              url: 'https://competitor.test/fresh-parking',
              weaknesses: ['Manual save flow'],
            },
          ],
          sources: [
            {
              fetchedAt: NOW,
              sourceType: 'competitor_page',
              title: 'Fresh Parking App',
              snippet: '$19 one-time automatic parking location helper.',
              url: 'https://competitor.test/fresh-parking',
            },
          ],
        };
      },
    },
    reviews: {
      async refresh() {
        return {
          status: 'completed',
          sources: [
            {
              fetchedAt: NOW,
              sourceType: 'review_page',
              title: 'Parking app reviews',
              snippet: 'Users say the app is not working and loses the parked location.',
              url: 'https://reviews.test/parking',
            },
          ],
        };
      },
    },
  };
}

function seedStaleIdea(db: Awaited<ReturnType<typeof openDatabase>>['db']): IdeaRow {
  const idea = createIdea(db, {
    businessModel: 'one-time payment',
    expectedPrice: '$19',
    platform: 'Android',
    rawDescription: 'Automatic app that saves parked car location when Bluetooth disconnects.',
    status: 'validated',
    targetMarket: 'drivers',
    title: 'Automatic parked car location saver',
  });
  const queries = createQueries(db, [
    {
      createdAt: '2026-03-01T00:00:00.000Z',
      ideaId: idea.id,
      intentType: 'high purchase intent',
      normalizedQuery: 'automatic parked car location app',
      priorityScore: 100,
      query: 'automatic parked car location app',
      source: 'fixture',
    },
  ]);
  createAutocompletePredictions(db, [
    {
      confidenceScore: 88,
      country: 'US',
      createdAt: '2026-03-01T00:01:00.000Z',
      ideaId: idea.id,
      intent: 'high purchase intent',
      language: 'en',
      normalizedPrediction: 'automatic parked car location app android',
      prediction: 'automatic parked car location app android',
      queryId: queries[0]?.id ?? null,
      sourcePrefix: 'automatic parked car location app',
      sourceSeed: 'automatic parked car location app',
    },
  ]);
  createScore(db, {
    createdAt: '2026-03-01T00:02:00.000Z',
    decision: 'promising but incomplete',
    ideaId: idea.id,
    scoreJson: '{"averageConfidence":88}',
    scoreType: 'search-language',
    totalScore: 58,
  });
  createReport(db, {
    createdAt: '2026-03-01T00:03:00.000Z',
    ideaId: idea.id,
    markdown: '# Validation Report',
    reportType: 'search-language-validation',
  });

  return idea;
}

function snapshotFixture(args: {
  autocompleteAt: string;
  reportAt: string;
  scoreAt: string;
  serpAt: string;
}): IdeaEvidenceSnapshot {
  const idea: IdeaRow = {
    business_model: 'one-time payment',
    created_at: '2026-01-01T00:00:00.000Z',
    expected_price: '$19',
    id: 1,
    normalized_json: null,
    platform: 'Android',
    raw_description: 'Automatic parked car location saver',
    status: 'validated',
    target_market: 'drivers',
    title: 'Automatic parked car location saver',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  return {
    autocompletePredictions: [
      {
        confidence_score: 88,
        country: 'US',
        created_at: args.autocompleteAt,
        id: 1,
        idea_id: idea.id,
        intent: 'high purchase intent',
        language: 'en',
        normalized_prediction: 'automatic parked car location app',
        prediction: 'automatic parked car location app',
        query_id: null,
        source_prefix: 'automatic parked car location',
        source_seed: 'automatic parked car location',
      },
    ],
    competitors: [
      {
        created_at: args.serpAt,
        id: 1,
        idea_id: idea.id,
        name: 'Parking Helper',
        price_text: '$19',
        pricing_model: 'one-time',
        product_type: 'direct_competitor',
        review_summary: null,
        strengths_json: '[]',
        url: 'https://example.test',
        weaknesses_json: '[]',
      },
    ],
    evidence: [],
    idea,
    queries: [],
    reports: [
      {
        created_at: args.reportAt,
        id: 1,
        idea_id: idea.id,
        job_id: null,
        json: null,
        markdown: '# Report',
        report_type: 'search-language-validation',
      },
    ],
    scores: [
      {
        created_at: args.scoreAt,
        decision: 'validate deeper',
        id: 1,
        idea_id: idea.id,
        score_json: '{}',
        score_type: 'search-language',
        total_score: 72,
      },
    ],
    sources: [
      {
        fetched_at: args.serpAt,
        id: 1,
        idea_id: idea.id,
        snippet: 'Comparison page.',
        source_type: 'serp_result',
        title: 'Parking helper apps',
        url: 'https://example.test/serp',
      },
      {
        fetched_at: args.serpAt,
        id: 2,
        idea_id: idea.id,
        snippet: '$19 one-time.',
        source_type: 'competitor_page',
        title: 'Parking Helper',
        url: 'https://example.test/competitor',
      },
      {
        fetched_at: args.autocompleteAt,
        id: 3,
        idea_id: idea.id,
        snippet: 'App is not working.',
        source_type: 'review_page',
        title: 'Parking Helper Reviews',
        url: 'https://example.test/reviews',
      },
    ],
  };
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-revalidation-'));
  tempDirs.push(dir);
  return dir;
}
