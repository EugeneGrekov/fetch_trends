import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import {
  listExperimentDecisions,
  listExperimentEvents,
  listMeasurementSnapshots,
} from '../db/repositories/experiments.js';
import { createIdea } from '../db/repositories/ideas.js';
import { createReport, listReportsByIdea } from '../db/repositories/reports.js';
import {
  createMeasurementExperiment,
  evaluateMeasurementExperiment,
  importMeasurementEvents,
} from './measurement.js';

const tempDirs: string[] = [];

describe('measurement command helpers', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
    tempDirs.length = 0;
  });

  it('creates an experiment, imports CSV events, evaluates thresholds, and writes artifacts', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'measurement.sqlite');
    const outDir = join(dir, 'artifacts');
    const ideaId = await seedPaymentTestReport(dbPath);
    const experiment = await createMeasurementExperiment({ dbPath, ideaId });
    const eventsPath = join(dir, 'events.csv');
    await writeFile(eventsPath, buildStrongSignalCsv());

    const imported = await importMeasurementEvents({ dbPath, eventsPath, experimentId: experiment.id });
    const artifact = await evaluateMeasurementExperiment({ dbPath, experimentId: experiment.id, outDir });

    expect(imported).toHaveLength(111);
    expect(artifact.markdownPath).toBe(join(outDir, String(ideaId), `measurement-experiment-${experiment.id}.md`));
    expect(artifact.jsonPath).toBe(join(outDir, String(ideaId), `measurement-experiment-${experiment.id}.json`));
    expect(await readFile(artifact.markdownPath, 'utf8')).toContain('# Measurement Report');

    const artifactJson = JSON.parse(await readFile(artifact.jsonPath, 'utf8')) as {
      decision: { decision: string };
      measurement: { metrics: { visitors: number } };
      report: { id: number };
    };
    expect(artifactJson.decision.decision).toBe('build_mvp');
    expect(artifactJson.measurement.metrics.visitors).toBe(100);
    expect(artifactJson.report.id).toBe(artifact.report.id);

    const { db } = await openDatabase(dbPath);
    try {
      expect(listExperimentEvents(db, experiment.id)).toHaveLength(111);
      expect(listMeasurementSnapshots(db, experiment.id)).toEqual([
        expect.objectContaining({ id: artifact.snapshot.id }),
      ]);
      expect(listExperimentDecisions(db, experiment.id)).toEqual([
        expect.objectContaining({ decision: 'build_mvp', report_id: artifact.report.id }),
      ]);
      expect(listReportsByIdea(db, ideaId).map((report) => report.report_type)).toEqual([
        'measurement_report',
        'payment_test_spec',
      ]);
    } finally {
      db.close();
    }
  });
});

async function seedPaymentTestReport(dbPath: string): Promise<number> {
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

    createReport(db, {
      createdAt: '2026-07-07T10:00:00.000Z',
      ideaId: idea.id,
      json: JSON.stringify({
        paymentTest: {
          decision: 'fake_door',
          decisionThresholds: [
            {
              signal: 'strong',
              condition: '100 targeted visitors, 8+ CTA clicks, 2+ payment clicks, and 1+ direct reply asking for access or timing.',
              rationale: 'Continue manual validation.',
            },
            {
              signal: 'weak',
              condition: '100 targeted visitors with 2-7 CTA clicks, fewer than 3 payment clicks, or only generic waitlist emails.',
              rationale: 'Keep testing only if replies sharpen pain.',
            },
            {
              signal: 'kill',
              condition: '200 targeted visitors, under 1% CTA click rate, no payment clicks, and no replies with urgent task context.',
              rationale: 'Stop the payment test.',
            },
          ],
          headline: 'Finish invoice late fee wording',
          testType: 'fake_door',
          thresholdAssumptionWarning: 'Exact conversion benchmarks are assumptions until real traffic exists.',
        },
      }),
      markdown: '# Payment Test Spec',
      reportType: 'payment_test_spec',
    });

    return idea.id;
  } finally {
    db.close();
  }
}

function buildStrongSignalCsv(): string {
  const rows = ['event_name,occurred_at,source,session_id,metadata_json'];

  for (let index = 1; index <= 100; index += 1) {
    rows.push(`page_view,2026-07-07T10:00:00.000Z,manual,s${index},{}`);
  }

  for (let index = 1; index <= 8; index += 1) {
    rows.push(`cta_click,2026-07-07T10:01:00.000Z,manual,s${index},{}`);
  }

  rows.push('payment_click,2026-07-07T10:02:00.000Z,manual,s1,{}');
  rows.push('payment_click,2026-07-07T10:02:30.000Z,manual,s2,{}');
  rows.push('reply_received,2026-07-07T10:03:00.000Z,manual,s1,{}');

  return `${rows.join('\n')}\n`;
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-measurement-'));
  tempDirs.push(dir);
  return dir;
}
