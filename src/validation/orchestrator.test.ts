import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { listAutocompletePredictionsByIdea } from '../db/repositories/autocomplete-predictions.js';
import { listCompetitorsByIdea } from '../db/repositories/competitors.js';
import { listEvidenceByIdea } from '../db/repositories/evidence.js';
import { getJobById } from '../db/repositories/jobs.js';
import { listQueriesByIdea } from '../db/repositories/queries.js';
import { listReportsByIdea } from '../db/repositories/reports.js';
import { listScoresByIdea } from '../db/repositories/scores.js';
import { listSourcesByIdea } from '../db/repositories/sources.js';
import { getToolRunById } from '../db/repositories/tool-runs.js';
import { InvalidJsonAiExecutor } from '../testing/fake-ai.js';
import { createFakeExternalCollectors, FakeAutocompleteCollector } from '../testing/fake-collectors.js';
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
        createCollector: () => new FakeAutocompleteCollector(),
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

  it('stores external sources, evidence, and competitors with fake collectors', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'external.sqlite');
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
        external: true,
      },
      {
        createCollector: () => new FakeAutocompleteCollector(),
        collectors: createFakeExternalCollectors(),
      },
    );

    expect(result.external.sources.length).toBeGreaterThan(0);
    expect(result.external.evidence.length).toBeGreaterThan(0);
    expect(result.external.competitors.length).toBe(1);
    expect(result.markdown).toContain('## External Sources');
    expect(result.markdown).toContain('## Competitors');

    const { db } = await openDatabase(dbPath);
    try {
      expect(listSourcesByIdea(db, result.idea.id).length).toBe(result.external.sources.length);
      expect(listEvidenceByIdea(db, result.idea.id).length).toBe(result.external.evidence.length);
      expect(listCompetitorsByIdea(db, result.idea.id)).toEqual([
        expect.objectContaining({ name: 'Park Saver' }),
      ]);
    } finally {
      db.close();
    }
  });

  it('keeps validation non-fatal when external collectors are not configured', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'missing-keys.sqlite');
    const originalSerpApiKey = process.env.SERP_API_KEY;
    delete process.env.SERP_API_KEY;

    try {
      const result = await runValidationJob(
        {
          ai: false,
          idea: 'automatic app that saves parking location when bluetooth disconnects',
          dbPath,
          outDir: join(dir, 'results'),
          country: 'US',
          language: 'en',
          depth: 1,
          modifiers: ['automatic', 'app'],
          headless: true,
          delayMs: 0,
          keepAiArtifacts: false,
          maxPrefixes: 1,
          maxDepth2Prefixes: 1,
          external: true,
        },
        {
          createCollector: () => new FakeAutocompleteCollector(),
        },
      );

      expect(result.job.status).toBe('completed');
      expect(result.external.warnings.join('\n')).toContain('SERP collector unavailable');
      expect(result.external.collectorRuns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ collector: 'serp', status: 'blocked' }),
          expect.objectContaining({ collector: 'reddit', status: 'blocked' }),
        ]),
      );
    } finally {
      if (originalSerpApiKey) {
        process.env.SERP_API_KEY = originalSerpApiKey;
      } else {
        delete process.env.SERP_API_KEY;
      }
    }
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
        aiExecutor: new InvalidJsonAiExecutor(),
        createCollector: () => new FakeAutocompleteCollector(),
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

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-validate-'));
  tempDirs.push(dir);
  return dir;
}
