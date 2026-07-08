import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { createAutocompletePredictions } from '../db/repositories/autocomplete-predictions.js';
import { createCompetitors } from '../db/repositories/competitors.js';
import { createEvidence } from '../db/repositories/evidence.js';
import { createExperiment, createExperimentDecision, createMeasurementSnapshot } from '../db/repositories/experiments.js';
import { createIdeaDecision } from '../db/repositories/idea-decisions.js';
import { createIdea } from '../db/repositories/ideas.js';
import { createQueries } from '../db/repositories/queries.js';
import { createReport, listReportsByIdea } from '../db/repositories/reports.js';
import { createScore } from '../db/repositories/scores.js';
import { createSources } from '../db/repositories/sources.js';
import { createTempDatabase } from '../testing/temp-db.js';
import {
  competitorFixture,
  evidenceFixture,
  ideaFixture,
  reportFixture,
  scoreFixture,
  sourceFixture,
} from '../testing/fixtures.js';
import { buildPortfolioProgram } from './portfolio.js';

describe('portfolio command', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('generates a comparison report from temp SQLite data through the CLI', async () => {
    const tempDb = await createTempDatabase({ prefix: 'fetch-trends-portfolio-command-' });
    const outDir = join(tempDb.dir, 'artifacts');
    try {
      const strongIdeaId = await seedPortfolioData(tempDb.db);

      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stdoutLines.push(String(chunk));
        return true;
      });
      vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stderrLines.push(String(chunk));
        return true;
      });

      await buildPortfolioProgram().parseAsync([
        'node',
        'portfolio',
        '--db',
        tempDb.dbPath,
        '--outDir',
        outDir,
        '--limit',
        '3',
      ]);

      const stdout = stdoutLines.join('');
      expect(stderrLines).toEqual([]);
      expect(stdout).toContain('Portfolio report generated:');
      expect(stdout).toContain('Top next action:');

      const markdownPath = extractPath(stdout, 'Markdown:');
      const jsonPath = extractPath(stdout, 'JSON:');
      expect(markdownPath).toContain('portfolio-comparison-');
      expect(jsonPath).toContain('portfolio-comparison-');
      expect(await readFile(markdownPath, 'utf8')).toContain('# Portfolio Comparison Report');
      expect(await readFile(jsonPath, 'utf8')).toContain('"portfolio_comparison"');

      const { db } = await openDatabase(tempDb.dbPath);
      try {
        const reportTypes = listReportsByIdea(db, strongIdeaId).map((report) => report.report_type);
        expect(reportTypes).toContain('portfolio_comparison');
      } finally {
        db.close();
      }
    } finally {
      await tempDb.cleanup();
    }
  });
});

async function seedPortfolioData(db: Parameters<typeof createIdea>[0]): Promise<number> {
  const strongIdea = createIdea(db, ideaFixture({
    businessModel: 'one-time payment',
    expectedPrice: '$29',
    platform: 'web',
    rawDescription: 'Generate late fee wording and amounts for overdue freelance invoices.',
    status: 'validated',
    targetMarket: 'freelance designers',
    title: 'Invoice late fee calculator',
  }));
  createQueries(db, [
    {
      createdAt: '2026-07-08T09:15:00.000Z',
      ideaId: strongIdea.id,
      intentType: 'problem intent',
      normalizedQuery: 'invoice late fee calculator',
      priorityScore: 100,
      query: 'invoice late fee calculator',
      source: 'fixture',
    },
    {
      createdAt: '2026-07-08T09:20:00.000Z',
      ideaId: strongIdea.id,
      intentType: 'problem intent',
      normalizedQuery: 'invoice late fee pricing',
      priorityScore: 95,
      query: 'invoice late fee pricing',
      source: 'fixture',
    },
  ]);
  createAutocompletePredictions(db, [
    {
      confidenceScore: 96,
      country: 'US',
      createdAt: '2026-07-08T09:25:00.000Z',
      ideaId: strongIdea.id,
      intent: 'high purchase intent',
      language: 'en',
      normalizedPrediction: 'invoice late fee calculator pricing',
      prediction: 'invoice late fee calculator pricing',
      queryId: null,
      sourcePrefix: 'invoice late fee calculator',
      sourceSeed: 'invoice late fee calculator',
    },
    {
      confidenceScore: 91,
      country: 'US',
      createdAt: '2026-07-08T09:26:00.000Z',
      ideaId: strongIdea.id,
      intent: 'comparison intent',
      language: 'en',
      normalizedPrediction: 'invoice late fee calculator vs spreadsheet',
      prediction: 'invoice late fee calculator vs spreadsheet',
      queryId: null,
      sourcePrefix: 'invoice late fee calculator',
      sourceSeed: 'invoice late fee calculator',
    },
  ]);
  const strongSources = createSources(db, [
    sourceFixture(strongIdea.id, {
      fetchedAt: '2026-07-08T09:30:00.000Z',
      sourceType: 'reddit_thread',
    }),
  ]);
  createEvidence(db, [
    evidenceFixture(strongIdea.id, strongSources[0].id, {
      paymentSignal: 'direct',
    }),
  ]);
  createCompetitors(db, [
    competitorFixture(strongIdea.id, {
      createdAt: '2026-07-08T09:35:00.000Z',
      priceText: '$29 one-time',
    }),
  ]);
  createScore(db, scoreFixture(strongIdea.id, {
    createdAt: '2026-07-08T09:40:00.000Z',
    decision: 'validate deeper',
    totalScore: 84,
  }));
  const validationReport = createReport(db, reportFixture(strongIdea.id, {
    createdAt: '2026-07-08T09:45:00.000Z',
    markdown: '# Validation Report',
    reportType: 'search-language-validation',
  }));
  const paymentReport = createReport(db, {
    createdAt: '2026-07-08T09:50:00.000Z',
    ideaId: strongIdea.id,
    jobId: null,
    json: JSON.stringify({ paymentTest: { decision: 'fake_door' } }),
    markdown: '# Payment Test Spec',
    reportType: 'payment_test_spec',
  });
  const experiment = createExperiment(db, {
    createdAt: '2026-07-08T09:55:00.000Z',
    experimentType: 'fake_door',
    ideaId: strongIdea.id,
    launchedAt: '2026-07-08T09:55:00.000Z',
    reportId: paymentReport.id,
    status: 'running',
    thresholdJson: '{"thresholds":[]}',
    title: 'Invoice paid preview',
  });
  createMeasurementSnapshot(db, {
    createdAt: '2026-07-08T10:20:00.000Z',
    experimentId: experiment.id,
    metricsJson: JSON.stringify(measurementMetrics(180, 3, 12, 1)),
    thresholdResultsJson: '[]',
  });
  createExperimentDecision(db, {
    createdAt: '2026-07-08T10:25:00.000Z',
    decision: 'persevere',
    experimentId: experiment.id,
    reason: 'Continue testing.',
    reportId: null,
  });
  createIdeaDecision(db, {
    createdAt: '2026-07-08T10:30:00.000Z',
    confidence: 'high',
    decision: 'persevere',
    evidenceJson: '{}',
    experimentId: experiment.id,
    ideaId: strongIdea.id,
    nextAction: 'Run a payment-intent test.',
    reason: 'Strong payment signal.',
    reportId: validationReport.id,
  });

  const weakerIdea = createIdea(db, ideaFixture({
    businessModel: 'one-time payment',
    expectedPrice: '$19',
    platform: 'web',
    rawDescription: 'Track parking location after Bluetooth disconnects.',
    status: 'validated',
    targetMarket: 'drivers',
    title: 'Parking location saver',
  }));
  createAutocompletePredictions(db, [
    {
      confidenceScore: 82,
      country: 'US',
      createdAt: '2026-07-08T09:15:00.000Z',
      ideaId: weakerIdea.id,
      intent: 'problem intent',
      language: 'en',
      normalizedPrediction: 'find my parked car',
      prediction: 'find my parked car',
      queryId: null,
      sourcePrefix: 'find my parked car',
      sourceSeed: 'find my parked car',
    },
  ]);
  createReport(db, reportFixture(weakerIdea.id, {
    createdAt: '2026-07-08T09:30:00.000Z',
    reportType: 'search-language-validation',
  }));
  createScore(db, scoreFixture(weakerIdea.id, {
    createdAt: '2026-07-08T09:35:00.000Z',
    decision: 'validate deeper',
    totalScore: 61,
  }));

  const killedIdea = createIdea(db, ideaFixture({
    businessModel: 'one-time payment',
    expectedPrice: '$29',
    platform: 'web',
    rawDescription: 'Old idea that never got traction.',
    status: 'failed',
    targetMarket: 'small businesses',
    title: 'Failed idea',
  }));
  createReport(db, reportFixture(killedIdea.id, {
    createdAt: '2026-07-07T09:00:00.000Z',
    reportType: 'search-language-validation',
  }));
  createScore(db, scoreFixture(killedIdea.id, {
    createdAt: '2026-07-07T09:10:00.000Z',
    decision: 'kill',
    totalScore: 14,
  }));
  createIdeaDecision(db, {
    createdAt: '2026-07-07T09:15:00.000Z',
    confidence: 'high',
    decision: 'kill',
    evidenceJson: '{}',
    experimentId: null,
    ideaId: killedIdea.id,
    nextAction: 'Archive this idea.',
    reason: 'No payment signal or customer pain.',
    reportId: null,
  });

  return strongIdea.id;
}

function extractPath(stdout: string, label: string): string {
  const match = stdout.match(new RegExp(`${label} (.+)`));
  if (!match?.[1]) {
    throw new Error(`Could not find ${label} in CLI output.`);
  }

  return match[1].trim();
}

function measurementMetrics(visitors: number, paymentClick: number, ctaClick: number, replyReceived: number): Record<string, unknown> {
  return {
    eventTotals: {
      checkout_start: 0,
      cta_click: ctaClick,
      email_submit: 0,
      page_view: visitors,
      payment_click: paymentClick,
      preview_complete: 0,
      preview_start: 0,
      pricing_view: ctaClick,
      refund_requested: 0,
      reply_received: replyReceived,
      support_contact: 0,
    },
    firstEventAt: '2026-07-08T10:00:00.000Z',
    funnel: {
      checkoutStart: 0,
      ctaClick: ctaClick,
      emailSubmit: 0,
      pageView: visitors,
      paymentClick: paymentClick,
      previewComplete: 0,
      previewStart: 0,
      pricingView: ctaClick,
      refundRequested: 0,
      replyReceived: replyReceived,
      supportContact: 0,
    },
    lastEventAt: '2026-07-08T10:20:00.000Z',
    missingData: [],
    rates: {
      checkoutStartRate: 0,
      ctaClickRate: ctaClick / visitors,
      emailSubmitRate: 0,
      paymentClickRate: paymentClick / visitors,
      previewCompleteRate: 0,
      previewStartRate: 0,
      refundRate: 0,
      replyRate: replyReceived / visitors,
      supportContactRate: 0,
    },
    totalEvents: visitors + paymentClick + ctaClick + replyReceived,
    visitors,
  };
}
