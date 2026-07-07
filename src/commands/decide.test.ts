import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { createAutocompletePredictions } from '../db/repositories/autocomplete-predictions.js';
import { createEvidence } from '../db/repositories/evidence.js';
import { createExperiment, createMeasurementSnapshot } from '../db/repositories/experiments.js';
import { createIdeaDecision, listIdeaDecisionsByIdea } from '../db/repositories/idea-decisions.js';
import { createIdea } from '../db/repositories/ideas.js';
import { createJob } from '../db/repositories/jobs.js';
import { createReport, listReportsByIdea } from '../db/repositories/reports.js';
import { createScore } from '../db/repositories/scores.js';
import { createSources } from '../db/repositories/sources.js';
import {
  buildMeasurementRecommendation,
  evaluateThresholdPlan,
  parseMeasurementThresholdPlan,
} from '../measurement/threshold-evaluator.js';
import type { MeasurementMetrics } from '../measurement/types.js';
import { generateDecisionMemoArtifact } from './decide.js';

const tempDirs: string[] = [];

describe('decide command implementation', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
    tempDirs.length = 0;
  });

  it('persists a decision memo report and idea decision using temp SQLite data', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'decide.sqlite');
    const outDir = join(dir, 'artifacts');
    const ideaId = await seedDecisionLoopData(dbPath);

    const result = await generateDecisionMemoArtifact({ dbPath, ideaId, outDir });

    expect(result.output.decision).toBe('pivot');
    expect(result.report.report_type).toBe('decision_memo');
    expect(result.decision.decision).toBe('pivot');
    expect(result.markdownPath).toBe(join(outDir, String(ideaId), `decision-memo-${result.report.id}.md`));
    expect(result.jsonPath).toBe(join(outDir, String(ideaId), `decision-memo-${result.report.id}.json`));
    expect(await readFile(result.markdownPath, 'utf8')).toContain('# Decision Memo');

    const artifact = JSON.parse(await readFile(result.jsonPath, 'utf8')) as {
      decision: { decision: string };
      decisionMemo: { nextAction: string };
      report: { id: number };
    };
    expect(artifact.report.id).toBe(result.report.id);
    expect(artifact.decision.decision).toBe('pivot');
    expect(artifact.decisionMemo.nextAction).toContain('Create one landing-page test');

    const { db } = await openDatabase(dbPath);
    try {
      expect(listReportsByIdea(db, ideaId).map((report) => report.report_type)).toEqual([
        'decision_memo',
        'measurement_report',
        'payment_test_spec',
        'search-language-validation',
      ]);
      expect(listIdeaDecisionsByIdea(db, ideaId)).toEqual([
        expect.objectContaining({
          decision: 'pivot',
          next_action: expect.stringContaining('Create one landing-page test'),
          report_id: result.report.id,
        }),
        expect.objectContaining({
          decision: 'inconclusive',
        }),
      ]);
    } finally {
      db.close();
    }
  });
});

async function seedDecisionLoopData(dbPath: string): Promise<number> {
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
    createAutocompletePredictions(db, [
      {
        confidenceScore: 91,
        country: 'US',
        createdAt: '2026-07-07T10:01:00.000Z',
        ideaId: idea.id,
        intent: 'problem intent',
        language: 'en',
        normalizedPrediction: 'client refuses to pay late invoice',
        prediction: 'client refuses to pay late invoice',
        queryId: null,
        sourcePrefix: 'client refuses to pay late invoice',
        sourceSeed: 'invoice late fee calculator',
      },
    ]);
    const sources = createSources(db, [
      {
        fetchedAt: '2026-07-07T10:01:30.000Z',
        ideaId: idea.id,
        snippet: 'Freelancers discuss overdue invoice wording.',
        sourceType: 'reddit_thread',
        title: 'Overdue invoice wording',
        url: 'https://example.test/thread',
      },
    ]);
    createEvidence(db, [
      {
        complaint: 'Clients refuse to pay late invoices.',
        confidenceScore: 88,
        createdAt: '2026-07-07T10:02:00.000Z',
        ideaId: idea.id,
        painType: 'payment delay',
        paymentSignal: 'direct',
        quote: 'I would pay for wording that helps me charge late fees without sounding harsh.',
        sourceId: sources[0]?.id ?? 0,
        trigger: 'overdue freelance invoice',
        urgency: 'high',
        workaround: 'manual email templates',
      },
    ]);
    createScore(db, {
      createdAt: '2026-07-07T10:03:00.000Z',
      decision: 'validate deeper',
      ideaId: idea.id,
      scoreJson: '{}',
      scoreType: 'search-language',
      totalScore: 82,
    });
    createReport(db, {
      createdAt: '2026-07-07T10:03:00.000Z',
      ideaId: idea.id,
      jobId: job.id,
      json: '{"decision":"validate deeper"}',
      markdown: '# Validation Report',
      reportType: 'search-language-validation',
    });
    const paymentReport = createReport(db, {
      createdAt: '2026-07-07T10:04:00.000Z',
      ideaId: idea.id,
      jobId: job.id,
      json: '{"paymentTest":{"decision":"fake_door"}}',
      markdown: '# Payment Test Spec',
      reportType: 'payment_test_spec',
    });
    const thresholdJson = buildThresholdJson(paymentReport.id);
    const experiment = createExperiment(db, {
      createdAt: '2026-07-07T10:05:00.000Z',
      experimentType: 'fake_door',
      ideaId: idea.id,
      launchedAt: '2026-07-07T10:05:00.000Z',
      reportId: paymentReport.id,
      status: 'running',
      thresholdJson,
      title: 'Late fee calculator paid preview',
    });
    const metrics = metricsFixture();
    const thresholdResults = evaluateThresholdPlan(parseMeasurementThresholdPlan(thresholdJson), metrics);
    const recommendation = buildMeasurementRecommendation(metrics, thresholdResults);
    const snapshot = createMeasurementSnapshot(db, {
      createdAt: '2026-07-07T11:00:00.000Z',
      experimentId: experiment.id,
      metricsJson: JSON.stringify(metrics, null, 2),
      thresholdResultsJson: JSON.stringify(thresholdResults, null, 2),
    });
    createReport(db, {
      createdAt: '2026-07-07T11:00:00.000Z',
      ideaId: idea.id,
      jobId: null,
      json: JSON.stringify({ measurement: { decision: recommendation.decision }, snapshotId: snapshot.id }),
      markdown: '# Measurement Report',
      reportType: 'measurement_report',
    });
    createIdeaDecision(db, {
      confidence: 'low',
      createdAt: '2026-07-07T10:30:00.000Z',
      decision: 'inconclusive',
      evidenceJson: '{}',
      experimentId: experiment.id,
      ideaId: idea.id,
      nextAction: 'Run the current experiment until 100 targeted visitors are recorded.',
      reason: 'Only 25 visitors are recorded.',
      reportId: null,
    });

    return idea.id;
  } finally {
    db.close();
  }
}

function buildThresholdJson(sourceReportId: number): string {
  return JSON.stringify({
    sourceReportId,
    thresholds: [
      {
        condition: '100 targeted visitors, 8+ CTA clicks, 2+ payment clicks, and 1+ direct reply asking for access or timing.',
        signal: 'strong',
      },
      {
        condition: '100 targeted visitors with 2-7 CTA clicks, fewer than 3 payment clicks, or only generic waitlist emails.',
        signal: 'weak',
      },
      {
        condition: '200 targeted visitors, under 1% CTA click rate, no payment clicks, and no replies with urgent task context.',
        signal: 'kill',
      },
    ],
  });
}

function metricsFixture(): MeasurementMetrics {
  return {
    eventTotals: {
      checkout_start: 0,
      cta_click: 6,
      email_submit: 0,
      page_view: 220,
      payment_click: 0,
      preview_complete: 0,
      preview_start: 0,
      pricing_view: 6,
      refund_requested: 0,
      reply_received: 0,
      support_contact: 0,
    },
    firstEventAt: '2026-07-07T10:05:00.000Z',
    funnel: {
      checkoutStart: 0,
      ctaClick: 6,
      emailSubmit: 0,
      pageView: 220,
      paymentClick: 0,
      previewComplete: 0,
      previewStart: 0,
      pricingView: 6,
      refundRequested: 0,
      replyReceived: 0,
      supportContact: 0,
    },
    lastEventAt: '2026-07-07T10:40:00.000Z',
    missingData: ['No payment-intent clicks have been recorded.'],
    rates: {
      checkoutStartRate: 0,
      ctaClickRate: 6 / 220,
      emailSubmitRate: 0,
      paymentClickRate: 0,
      previewCompleteRate: null,
      previewStartRate: 0,
      refundRate: null,
      replyRate: null,
      supportContactRate: 0,
    },
    totalEvents: 226,
    visitors: 220,
  };
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-decide-'));
  tempDirs.push(dir);
  return dir;
}
