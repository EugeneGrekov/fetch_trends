import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { createAutocompletePredictions } from '../db/repositories/autocomplete-predictions.js';
import { createCompetitors } from '../db/repositories/competitors.js';
import { createEvidence } from '../db/repositories/evidence.js';
import { createIdea } from '../db/repositories/ideas.js';
import { createJob } from '../db/repositories/jobs.js';
import { createQueries } from '../db/repositories/queries.js';
import { listReportsByIdea, createReport } from '../db/repositories/reports.js';
import { createScore } from '../db/repositories/scores.js';
import { createSources } from '../db/repositories/sources.js';
import { generatePaymentTestArtifact } from './payment-test.js';
import { generateSeoPlanArtifact } from './seo-plan.js';

const tempDirs: string[] = [];

describe('experiment artifact commands', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
    tempDirs.length = 0;
  });

  it('writes payment-test and SEO artifacts and persists report rows', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'artifacts.sqlite');
    const outDir = join(dir, 'artifacts');
    const ideaId = await seedValidationEvidence(dbPath);

    const payment = await generatePaymentTestArtifact({ dbPath, ideaId, outDir });
    const seo = await generateSeoPlanArtifact({ dbPath, ideaId, outDir });

    expect(payment.markdownPath).toBe(join(outDir, String(ideaId), 'payment-test.md'));
    expect(payment.jsonPath).toBe(join(outDir, String(ideaId), 'payment-test.json'));
    expect(seo.markdownPath).toBe(join(outDir, String(ideaId), 'seo-plan.md'));
    expect(seo.jsonPath).toBe(join(outDir, String(ideaId), 'seo-plan.json'));
    expect(await readFile(payment.markdownPath, 'utf8')).toContain('# Payment Test Spec');
    expect(await readFile(seo.markdownPath, 'utf8')).toContain('# SEO Plan');

    const paymentJson = JSON.parse(await readFile(payment.jsonPath, 'utf8')) as {
      paymentTest: { decision: string };
      report: { id: number };
    };
    const seoJson = JSON.parse(await readFile(seo.jsonPath, 'utf8')) as {
      report: { id: number };
      seoPlan: { decision: string };
    };

    expect(paymentJson.report.id).toBe(payment.report.id);
    expect(paymentJson.paymentTest.decision).toBe('preorder');
    expect(seoJson.report.id).toBe(seo.report.id);
    expect(seoJson.seoPlan.decision).toBe('build_now');

    const { db } = await openDatabase(dbPath);
    try {
      expect(listReportsByIdea(db, ideaId).map((report) => report.report_type)).toEqual([
        'seo_plan',
        'payment_test_spec',
        'search-language-validation',
      ]);
    } finally {
      db.close();
    }
  });
});

async function seedValidationEvidence(dbPath: string): Promise<number> {
  const { db } = await openDatabase(dbPath);
  applyMigrations(db);

  try {
    const idea = createIdea(db, {
      businessModel: 'one-time payment',
      expectedPrice: '$29',
      platform: 'web',
      rawDescription: 'Generate late fee wording and amounts for overdue freelance invoices.',
      status: 'validated',
      targetMarket: 'freelance designers',
      title: 'Invoice late fee calculator',
    });
    const job = createJob(db, {
      ideaId: idea.id,
      jobType: 'validate',
      startedAt: '2026-07-07T10:00:00.000Z',
      status: 'completed',
    });
    const queries = createQueries(db, [
      {
        createdAt: '2026-07-07T10:00:00.000Z',
        ideaId: idea.id,
        intentType: 'high purchase intent',
        normalizedQuery: 'invoice late fee calculator',
        priorityScore: 90,
        query: 'invoice late fee calculator',
        source: 'fixture',
      },
      {
        createdAt: '2026-07-07T10:00:00.000Z',
        ideaId: idea.id,
        intentType: 'how-to intent',
        normalizedQuery: 'how to charge late fee on invoice',
        priorityScore: 80,
        query: 'how to charge late fee on invoice',
        source: 'fixture',
      },
    ]);
    createAutocompletePredictions(db, [
      prediction(idea.id, queries[0]?.id ?? null, 1, 'high purchase intent', 'invoice late fee calculator for freelancers'),
      prediction(idea.id, queries[0]?.id ?? null, 2, 'comparison intent', 'invoice late fee calculator alternatives'),
      prediction(idea.id, queries[1]?.id ?? null, 3, 'how-to intent', 'how to charge late fee on invoice'),
      prediction(idea.id, queries[1]?.id ?? null, 4, 'problem intent', 'client refuses to pay late invoice'),
    ]);
    const sources = createSources(db, [
      {
        fetchedAt: '2026-07-07T10:00:00.000Z',
        ideaId: idea.id,
        snippet: 'Freelancers discuss overdue invoice fee wording.',
        sourceType: 'serp_result',
        title: 'Overdue invoice fees',
        url: 'https://example.test/thread',
      },
    ]);
    createEvidence(db, [
      {
        complaint: 'Clients ignore overdue reminders.',
        confidenceScore: 82,
        createdAt: '2026-07-07T10:00:00.000Z',
        ideaId: idea.id,
        painType: 'payment delay',
        paymentSignal: 'direct',
        quote: 'I would pay once for the right late-fee wording.',
        sourceId: sources[0]?.id ?? 0,
        trigger: 'calculate late fees for overdue freelance invoices',
        urgency: 'high',
        workaround: 'manual email templates',
      },
    ]);
    createCompetitors(db, [
      {
        createdAt: '2026-07-07T10:00:00.000Z',
        ideaId: idea.id,
        name: 'Invoice Fee Tool',
        priceText: '$29 one-time',
        pricingModel: 'one-time',
        productType: 'direct_competitor',
        reviewSummary: 'Users mention wording uncertainty.',
        url: 'https://example.test/tool',
      },
    ]);
    createScore(db, {
      createdAt: '2026-07-07T10:00:00.000Z',
      decision: 'validate deeper',
      ideaId: idea.id,
      scoreJson: '{}',
      scoreType: 'search-language',
      totalScore: 82,
    });
    createReport(db, {
      createdAt: '2026-07-07T10:00:00.000Z',
      ideaId: idea.id,
      jobId: job.id,
      json: '{"decision":"validate deeper"}',
      markdown: '# Validation Report',
      reportType: 'search-language-validation',
    });

    return idea.id;
  } finally {
    db.close();
  }
}

function prediction(
  ideaId: number,
  queryId: number | null,
  id: number,
  intent: string,
  value: string,
): Parameters<typeof createAutocompletePredictions>[1][number] {
  return {
    confidenceScore: 90 - id,
    country: 'US',
    createdAt: '2026-07-07T10:00:00.000Z',
    ideaId,
    intent,
    language: 'en',
    normalizedPrediction: value,
    prediction: value,
    queryId,
    sourcePrefix: value,
    sourceSeed: value,
  };
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-experiments-'));
  tempDirs.push(dir);
  return dir;
}
