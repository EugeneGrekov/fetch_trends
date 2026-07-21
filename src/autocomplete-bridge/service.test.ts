import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { createOrGetBridgeJob, failInterruptedBridgeJobs, startBridgeJob } from './jobs.js';
import { normalizeAutocompleteRequest } from './protocol.js';
import { AutocompleteBridgeService } from './service.js';
import type { AutocompleteResearchRunner } from './types.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('autocomplete bridge service', () => {
  it('reuses the first canonical job and processes it once', async () => {
    const paths = await tempPaths();
    const calls: number[] = [];
    const runner: AutocompleteResearchRunner = async (job) => {
      calls.push(job.id);
      return { markdown: '# Result\n', outputPath: job.outputPath ?? 'result.csv' };
    };
    const service = new AutocompleteBridgeService({
      dbPath: paths.dbPath,
      researchRunner: runner,
      resultsDir: paths.resultsDir,
    });
    await service.initialize();

    const first = await service.submit({
      type: 'autocomplete_check',
      seeds: ['AI app builder', 'business research'],
      modifiers: ['with', 'for'],
    }, 'egrekov');
    const duplicate = await service.submit({
      type: 'autocomplete_check',
      seeds: [' BUSINESS   RESEARCH ', 'ai APP builder'],
      modifiers: ['FOR', 'WITH'],
    }, 'another-user');

    await waitForStatus(service, first.job.id, 'completed');
    expect(duplicate.cached).toBe(true);
    expect(duplicate.job.id).toBe(first.job.id);
    expect(calls).toEqual([first.job.id]);
  });

  it('processes jobs one at a time in queue order', async () => {
    const paths = await tempPaths();
    const started: number[] = [];
    let releaseFirst: (() => void) | undefined;
    const runner: AutocompleteResearchRunner = async (job) => {
      started.push(job.id);
      if (started.length === 1) {
        await new Promise<void>((resolvePromise) => {
          releaseFirst = resolvePromise;
        });
      }
      return { markdown: `# Job ${job.id}\n`, outputPath: job.outputPath ?? 'result.csv' };
    };
    const service = new AutocompleteBridgeService({
      dbPath: paths.dbPath,
      researchRunner: runner,
      resultsDir: paths.resultsDir,
    });
    await service.initialize();

    const first = await service.submit({ type: 'autocomplete_check', seeds: ['first'] }, 'egrekov');
    const second = await service.submit({ type: 'autocomplete_check', seeds: ['second'] }, 'egrekov');
    await waitUntil(() => started.length === 1);

    expect((await service.getJob(first.job.id)).status).toBe('processing');
    expect((await service.getJob(second.job.id)).status).toBe('queued');
    releaseFirst?.();
    await waitForStatus(service, second.job.id, 'completed');
    expect(started).toEqual([first.job.id, second.job.id]);
  });

  it('leaves failures for manual retry', async () => {
    const paths = await tempPaths();
    let attempt = 0;
    const service = new AutocompleteBridgeService({
      dbPath: paths.dbPath,
      resultsDir: paths.resultsDir,
      researchRunner: async (job) => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error('temporary collector failure');
        }
        return { markdown: '# Retried\n', outputPath: job.outputPath ?? 'result.csv' };
      },
    });
    await service.initialize();
    const submitted = await service.submit({ type: 'autocomplete_check', seeds: ['retry me'] }, 'egrekov');
    const failed = await waitForStatus(service, submitted.job.id, 'failed');

    expect(failed.errorMessage).toBe('temporary collector failure');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    expect((await service.getJob(submitted.job.id)).status).toBe('failed');

    await service.retry(submitted.job.id);
    const completed = await waitForStatus(service, submitted.job.id, 'completed');
    expect(completed.resultMarkdown).toBe('# Retried\n');
  });

  it('marks an interrupted processing job failed without changing queued jobs', async () => {
    const paths = await tempPaths();
    const { db } = await openDatabase(paths.dbPath);
    try {
      applyMigrations(db);
      const processing = createOrGetBridgeJob(
        db,
        normalizeAutocompleteRequest({ type: 'autocomplete_check', seeds: ['processing'] }),
        'egrekov',
        '2026-07-21T10:00:00.000Z',
      ).job;
      createOrGetBridgeJob(
        db,
        normalizeAutocompleteRequest({ type: 'autocomplete_check', seeds: ['queued'] }),
        'egrekov',
        '2026-07-21T10:00:01.000Z',
      );
      startBridgeJob(db, processing.id, '2026-07-21T10:00:02.000Z', 'result.csv');

      expect(failInterruptedBridgeJobs(db, '2026-07-21T10:01:00.000Z')).toBe(1);
      const rows = db.prepare('SELECT status FROM autocomplete_bridge_jobs ORDER BY id').all() as Array<{ status: string }>;
      expect(rows.map((row) => row.status)).toEqual(['failed', 'queued']);
    } finally {
      db.close();
    }
  });
});

async function tempPaths(): Promise<{ dbPath: string; resultsDir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-bridge-service-'));
  tempDirs.push(dir);
  return { dbPath: join(dir, 'bridge.sqlite'), resultsDir: join(dir, 'results') };
}
async function waitForStatus(
  service: AutocompleteBridgeService,
  id: number,
  status: 'completed' | 'failed',
): Promise<Awaited<ReturnType<AutocompleteBridgeService['getJob']>>> {
  let job = await service.getJob(id);
  while (job.status !== status) {
    job = await service.waitForJob(id, 100);
  }
  return job;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for condition.');
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
}
