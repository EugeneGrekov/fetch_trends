import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { createCompetitors } from '../db/repositories/competitors.js';
import { createEvidence } from '../db/repositories/evidence.js';
import { createSources } from '../db/repositories/sources.js';
import type { AutocompleteCollector, CollectContext } from '../utilities/autocomplete/types.js';
import { startWebServer, stopWebServer, type StartedWebServer } from './server.js';

const tempDirs: string[] = [];
const startedServers: StartedWebServer[] = [];

describe('web server', () => {
  afterEach(async () => {
    await Promise.all(startedServers.splice(0).map((started) => stopWebServer(started.server)));
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('serves local validation pages and APIs with fake worker dependencies', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'web.sqlite');
    const outDir = join(dir, 'results');
    const previousSerpKey = process.env.SERP_API_KEY;
    process.env.SERP_API_KEY = 'secret-serp-key-for-test';

    try {
      const started = await startWebServer({
        dbPath,
        outDir,
        port: 0,
        runJobsInProcess: true,
        validationDefaults: {
          ai: false,
          country: 'US',
          delayMs: 0,
          depth: 1,
          headless: true,
          keepAiArtifacts: false,
          language: 'en',
          maxDepth2Prefixes: 1,
          maxPrefixes: 1,
          modifiers: ['app'],
        },
        validationDependencies: {
          createCollector: () => new FakeCollector(),
        },
      });
      startedServers.push(started);

      const health = await getJson<{ ok: boolean; dbPath: string }>(`${started.url}/api/health`);
      expect(health.ok).toBe(true);
      expect(health.dbPath).toBe(dbPath);

      const settings = await getText(`${started.url}/settings`);
      expect(settings).toContain('Settings and health');
      expect(settings).toContain('configured');
      expect(settings).not.toContain('secret-serp-key-for-test');

      const created = await postJson<{
        idea: { id: number; title: string };
        job: { id: number; status: string };
      }>(`${started.url}/api/ideas`, {
        idea: 'automatic app that saves parking location when bluetooth disconnects',
        targetMarket: 'drivers',
        expectedPrice: '$19 one-time',
        platform: 'Android',
      });

      expect(created.idea.title).toContain('automatic app');
      expect(created.job.status).toBe('pending');

      const completedStatus = await waitForJobCompletion(started.url, created.job.id);
      expect(completedStatus.status).toBe('completed');
      expect(completedStatus.reportId).toEqual(expect.any(Number));

      const jobPage = await getText(`${started.url}/jobs/${created.job.id}`);
      expect(jobPage).toContain('Tool Runs');
      expect(jobPage).toContain('autocomplete');

      const ideaPage = await getText(`${started.url}/ideas/${created.idea.id}`);
      expect(ideaPage).toContain('Scorecard');
      expect(ideaPage).toContain('Top Predictions');

      await seedExternalEvidence(dbPath, created.idea.id);

      const evidence = await getJson<{
        counts: { sources: number; evidence: number; competitors: number };
        evidenceWithSources: Array<{ evidence: { quote: string }; source: { url: string } }>;
      }>(`${started.url}/api/ideas/${created.idea.id}/evidence`);
      expect(evidence.counts).toMatchObject({ competitors: 1, evidence: 1, sources: 1 });
      expect(evidence.evidenceWithSources[0]?.source.url).toBe('https://example.com/source');

      const evidencePage = await getText(`${started.url}/ideas/${created.idea.id}/evidence`);
      expect(evidencePage).toContain('I lose the parked location unless I open the app first.');

      const reportPage = await getText(`${started.url}/reports/${completedStatus.reportId}`);
      expect(reportPage).toContain('Stored report');
      expect(reportPage).toContain('Top Autocomplete Predictions');

      const markdown = await getText(`${started.url}/reports/${completedStatus.reportId}?format=markdown`);
      expect(markdown).toContain('Top Autocomplete Predictions');

      const reportJson = await getJson<{ markdown: string; report: { id: number } }>(
        `${started.url}/reports/${completedStatus.reportId}?format=json`,
      );
      expect(reportJson.report.id).toBe(completedStatus.reportId);
      expect(reportJson.markdown).toContain('Top Autocomplete Predictions');
    } finally {
      if (previousSerpKey == null) {
        delete process.env.SERP_API_KEY;
      } else {
        process.env.SERP_API_KEY = previousSerpKey;
      }
    }
  });
});

class FakeCollector implements AutocompleteCollector {
  async collect(prefix: string, _context: CollectContext): Promise<string[]> {
    return [
      `${prefix} app`,
      `${prefix} android`,
      `${prefix} not working`,
    ];
  }

  async close(): Promise<void> {
    return undefined;
  }
}

async function seedExternalEvidence(dbPath: string, ideaId: number): Promise<void> {
  const { db } = await openDatabase(dbPath);

  try {
    applyMigrations(db);
    const sources = createSources(db, [
      {
        fetchedAt: '2026-07-07T10:01:00.000Z',
        ideaId,
        snippet: 'People complain about losing parked-car location.',
        sourceType: 'test_source',
        title: 'Parking location complaint',
        url: 'https://example.com/source',
      },
    ]);
    createEvidence(db, [
      {
        complaint: 'lost location',
        confidenceScore: 80,
        createdAt: '2026-07-07T10:02:00.000Z',
        ideaId,
        paymentSignal: 'weak',
        quote: 'I lose the parked location unless I open the app first.',
        sourceId: sources[0]?.id ?? 0,
        urgency: 'medium',
      },
    ]);
    createCompetitors(db, [
      {
        createdAt: '2026-07-07T10:03:00.000Z',
        ideaId,
        name: 'Parking Helper',
        priceText: '$9',
        pricingModel: 'one-time',
        productType: 'direct_competitor',
        reviewSummary: 'Useful but manual.',
        url: 'https://example.com/competitor',
      },
    ]);
  } finally {
    db.close();
  }
}

async function waitForJobCompletion(baseUrl: string, jobId: number): Promise<{
  status: string;
  reportId: number;
}> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await getJson<{ status: string; reportId: number }>(`${baseUrl}/api/jobs/${jobId}/status`);
    if (status.status === 'completed') {
      return status;
    }

    if (status.status === 'failed') {
      throw new Error(`Job ${jobId} failed.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Job ${jobId} did not complete.`);
}

async function getText(url: string): Promise<string> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return response.text();
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return response.json() as Promise<T>;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<T>;
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-web-'));
  tempDirs.push(dir);
  return dir;
}
