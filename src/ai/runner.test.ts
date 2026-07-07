import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { createIdea } from '../db/repositories/ideas.js';
import { createJob } from '../db/repositories/jobs.js';
import { LocalAiRunner } from './runner.js';
import type { AiExecutionRequest, AiExecutionResult, AiExecutor } from './types.js';

const tempDirs: string[] = [];

describe('LocalAiRunner', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
    tempDirs.length = 0;
  });

  it('stores completed AI runs with parsed JSON output', async () => {
    const dir = await createTempDir();
    const { db } = await openDatabase(':memory:');
    applyMigrations(db);

    try {
      const { jobId } = seedJob(db);
      const runner = new LocalAiRunner({
        artifactsRoot: join(dir, 'artifacts'),
        db,
        executor: new FakeAiExecutor(['{"title":"Automatic parked car locator","user":"drivers","pain":"forgot where I parked","trigger":"leaving the car","current_workarounds":["manual pin"],"desired_result":"find the car fast","business_model":"one-time payment","price_range":"$5-$30","category":"mobile utility","assumptions":["location access is granted"]}']),
        keepArtifacts: true,
      });

      const result = await runner.runTask({
        artifactsRoot: join(dir, 'artifacts'),
        input: { rawIdea: 'parking app' },
        jobId,
        keepArtifacts: true,
        task: 'idea_normalize',
      });

      const stored = db.prepare('SELECT * FROM tool_runs WHERE id = ?').get(result.toolRunId) as {
        metadata_json: string | null;
        output_json: string | null;
        status: string;
      };

      expect(result.status).toBe('completed');
      expect(stored.status).toBe('completed');
      expect(stored.output_json).toContain('"title":"Automatic parked car locator"');

      const metadata = JSON.parse(stored.metadata_json ?? '{}') as {
        artifacts?: { outputTextPath?: string };
      };
      expect(metadata.artifacts?.outputTextPath).toBeTruthy();
      expect(await readFile(metadata.artifacts?.outputTextPath ?? '', 'utf8')).toContain('Automatic parked car locator');
    } finally {
      db.close();
    }
  });

  it('stores failed AI runs when JSON parsing fails', async () => {
    const dir = await createTempDir();
    const { db } = await openDatabase(':memory:');
    applyMigrations(db);

    try {
      const { jobId } = seedJob(db);
      const runner = new LocalAiRunner({
        artifactsRoot: join(dir, 'artifacts'),
        db,
        executor: new FakeAiExecutor(['not json']),
        keepArtifacts: true,
      });

      const result = await runner.runTask({
        artifactsRoot: join(dir, 'artifacts'),
        input: { rawIdea: 'parking app' },
        jobId,
        keepArtifacts: true,
        task: 'idea_normalize',
      });

      const stored = db.prepare('SELECT status, error_message FROM tool_runs WHERE id = ?').get(result.toolRunId) as {
        error_message: string | null;
        status: string;
      };

      expect(result.status).toBe('failed');
      expect(stored.status).toBe('failed');
      expect(stored.error_message).toMatch(/valid JSON/);
    } finally {
      db.close();
    }
  });
});

class FakeAiExecutor implements AiExecutor {
  private readonly outputs: string[];

  constructor(outputs: string[]) {
    this.outputs = [...outputs];
  }

  async execute(request: AiExecutionRequest): Promise<AiExecutionResult> {
    const output = this.outputs.shift() ?? '{}';
    await writeFile(request.outputPath, output);

    return {
      command: ['fake-codex'],
      durationMs: 5,
      exitCode: 0,
      outputPath: request.outputPath,
      stderr: '',
      stdout: output,
    };
  }
}

function seedJob(db: Awaited<ReturnType<typeof openDatabase>>['db']): { ideaId: number; jobId: number } {
  const idea = createIdea(db, {
    title: 'Automatic parking location app',
    rawDescription: 'Automatic parking location app',
  });
  const job = createJob(db, {
    ideaId: idea.id,
    jobType: 'validate',
    status: 'running',
    startedAt: '2026-07-07T12:00:00.000Z',
  });

  return { ideaId: idea.id, jobId: job.id };
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-ai-runner-'));
  tempDirs.push(dir);
  return dir;
}
