import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { listAutocompletePredictionsByIdea } from '../db/repositories/autocomplete-predictions.js';
import { getJobById } from '../db/repositories/jobs.js';
import { listQueriesByIdea } from '../db/repositories/queries.js';
import { listReportsByIdea } from '../db/repositories/reports.js';
import { listScoresByIdea } from '../db/repositories/scores.js';
import { getToolRunById } from '../db/repositories/tool-runs.js';
import type { AiExecutionRequest, AiExecutionResult, AiExecutor } from '../ai/types.js';
import type { AutocompleteCollector, CollectContext } from '../utilities/autocomplete/types.js';
import { runValidationJob } from './orchestrator.js';

const tempDirs: string[] = [];

describe('validation orchestrator', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('persists a full first-pass validation run', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'validate.sqlite');
    const outDir = join(dir, 'results');

    const result = await runValidationJob(
      {
        ai: false,
        idea: 'automatic app that saves parking location when bluetooth disconnects',
        dbPath,
        outDir,
        country: 'US',
        language: 'en',
        depth: 1,
        modifiers: ['automatic', 'app'],
        headless: true,
        delayMs: 0,
        keepAiArtifacts: false,
        maxPrefixes: 2,
        maxDepth2Prefixes: 2,
      },
      {
        createCollector: () => new FakeCollector(),
      },
    );

    expect(result.job.status).toBe('completed');
    expect(result.toolRun.status).toBe('completed');
    expect(result.queries.length).toBeGreaterThan(0);
    expect(result.uniquePredictions.length).toBeGreaterThan(0);
    expect(result.markdown).toContain('This report validates search language only. It does not prove demand size or willingness to pay.');
    await access(result.outputPath);
    await access(result.outputPath.replace(/\.csv$/, '.json'));

    const { db } = await openDatabase(dbPath);

    try {
      expect(getJobById(db, result.job.id).status).toBe('completed');
      expect(getToolRunById(db, result.toolRun.id).status).toBe('completed');
      expect(listQueriesByIdea(db, result.idea.id).length).toBe(result.queries.length);
      expect(listAutocompletePredictionsByIdea(db, result.idea.id).length).toBe(result.autocompleteReport.collectedPredictions.length);
      expect(listScoresByIdea(db, result.idea.id)).toEqual([
        expect.objectContaining({ id: result.score.id }),
      ]);
      expect(listReportsByIdea(db, result.idea.id)).toEqual([
        expect.objectContaining({ id: result.report.id }),
      ]);
      const storedReport = listReportsByIdea(db, result.idea.id)[0];
      expect(storedReport?.markdown).toContain('## Top Autocomplete Predictions');
    } finally {
      db.close();
    }

    const summaryJson = JSON.parse(await readFile(result.outputPath.replace(/\.csv$/, '.summary.json'), 'utf8')) as {
      finalSummary: { uniquePredictionCount: number };
    };
    expect(summaryJson.finalSummary.uniquePredictionCount).toBeGreaterThan(0);
  });

  it('falls back to deterministic reporting when AI output is invalid', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'validation.sqlite');
    const result = await runValidationJob(
      {
        ai: true,
        aiArtifactsDir: join(dir, 'artifacts'),
        aiModel: 'test-model',
        aiReasoning: 'medium',
        country: 'US',
        dbPath,
        delayMs: 0,
        depth: 1,
        headless: true,
        idea: 'automatic app that saves parking location when bluetooth disconnects',
        keepAiArtifacts: true,
        language: 'en',
        maxDepth2Prefixes: 1,
        maxPrefixes: 1,
        modifiers: [],
        outDir: join(dir, 'results'),
      },
      {
        aiExecutor: new InvalidJsonExecutor(),
        createCollector: () => new FakeCollector(),
      },
    );

    const { db } = await openDatabase(dbPath);
    try {
      const toolRuns = db.prepare('SELECT tool_name, status FROM tool_runs ORDER BY id').all() as Array<{
        status: string;
        tool_name: string;
      }>;

      expect(result.report.markdown).toContain('## Facts');
      expect(result.ai.used).toBe(false);
      expect(result.ai.warnings.length).toBeGreaterThan(0);
      expect(toolRuns).toEqual([
        expect.objectContaining({ tool_name: 'ai.idea_normalize', status: 'failed' }),
        expect.objectContaining({ tool_name: 'ai.query_generate', status: 'failed' }),
        expect.objectContaining({ tool_name: 'autocomplete', status: 'completed' }),
        expect.objectContaining({ tool_name: 'ai.evidence_summarize', status: 'failed' }),
        expect.objectContaining({ tool_name: 'ai.final_report', status: 'failed' }),
      ]);
    } finally {
      db.close();
    }
  });
});

class InvalidJsonExecutor implements AiExecutor {
  async execute(request: AiExecutionRequest): Promise<AiExecutionResult> {
    await writeFile(request.outputPath, 'definitely not json');
    return {
      command: ['fake-codex'],
      durationMs: 5,
      exitCode: 0,
      outputPath: request.outputPath,
      stderr: '',
      stdout: 'definitely not json',
    };
  }
}

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

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-validate-'));
  tempDirs.push(dir);
  return dir;
}
