import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import type { AiExecutionRequest, AiExecutionResult, AiExecutor } from '../ai/types.js';
import type { AutocompleteCollector, CollectContext } from '../utilities/autocomplete/types.js';
import type { CompetitorCollectorInput, CompetitorCollectorOutput } from '../utilities/competitors/types.js';
import type { EvidenceCollector } from '../utilities/external/types.js';
import type { RedditCollectorInput, RedditCollectorOutput } from '../utilities/reddit/types.js';
import type { ReviewsCollectorInput, ReviewsCollectorOutput } from '../utilities/reviews/types.js';
import type { SerpCollectorOutput, SerpQueryInput } from '../utilities/serp/types.js';
import type { YouTubeCollectorInput, YouTubeCollectorOutput } from '../utilities/youtube/types.js';
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
        createCollector: () => new FakeCollector(),
        collectors: {
          serp: new FakeSerpCollector(),
          reddit: new FakeRedditCollector(),
          youtube: new FakeYouTubeCollector(),
          reviews: new FakeReviewCollector(),
          competitors: new FakeCompetitorCollector(),
        },
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
          createCollector: () => new FakeCollector(),
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

class FakeSerpCollector implements EvidenceCollector<SerpQueryInput, SerpCollectorOutput> {
  readonly name = 'serp';

  async collect(input: SerpQueryInput): Promise<SerpCollectorOutput> {
    return {
      items: [
        {
          query: input.queries[0] ?? 'parking location app',
          url: 'https://parksaver.app',
          title: 'Park Saver',
          snippet: 'One-time parking location app with automatic save.',
          position: 1,
          resultType: 'organic',
          domain: 'parksaver.app',
        },
        {
          query: input.queries[0] ?? 'parking location app',
          url: 'https://reddit.com/r/androidapps/comments/example',
          title: 'Parking app keeps losing location',
          snippet: 'The app loses my parked location unless I open it first.',
          position: 2,
          resultType: 'discussion',
          domain: 'reddit.com',
        },
      ],
      rawMetadata: { provider: 'fake-serp' },
      errors: [],
      blocked: false,
      fetchedAt: '2026-07-07T10:00:00.000Z',
    };
  }
}

class FakeRedditCollector implements EvidenceCollector<RedditCollectorInput, RedditCollectorOutput> {
  readonly name = 'reddit';

  async collect(input: RedditCollectorInput): Promise<RedditCollectorOutput> {
    return {
      items: [
        {
          query: input.queries[0] ?? 'parking location app',
          url: 'https://reddit.com/r/androidapps/comments/example',
          title: 'Parking app keeps losing location',
          snippet: 'The app loses my parked location unless I open it first.',
          community: 'r/androidapps',
          score: 12,
          commentCount: 8,
          createdAt: null,
        },
      ],
      rawMetadata: { provider: 'fake-reddit' },
      errors: [],
      blocked: false,
      fetchedAt: '2026-07-07T10:00:01.000Z',
    };
  }
}

class FakeYouTubeCollector implements EvidenceCollector<YouTubeCollectorInput, YouTubeCollectorOutput> {
  readonly name = 'youtube';

  async collect(input: YouTubeCollectorInput): Promise<YouTubeCollectorOutput> {
    return {
      items: [
        {
          query: input.queries[0] ?? 'parking location app',
          url: 'https://youtube.com/watch?v=abc123',
          title: 'How to recover a lost parking location',
          description: 'Manual workaround if the parking app is not working.',
          channelTitle: 'Parking Hacks',
          publishedAt: null,
          viewCount: null,
        },
      ],
      rawMetadata: { provider: 'fake-youtube' },
      errors: [],
      blocked: false,
      fetchedAt: '2026-07-07T10:00:02.000Z',
    };
  }
}

class FakeReviewCollector implements EvidenceCollector<ReviewsCollectorInput, ReviewsCollectorOutput> {
  readonly name = 'reviews';

  async collect(input: ReviewsCollectorInput): Promise<ReviewsCollectorOutput> {
    return {
      items: [
        {
          query: input.queries[0] ?? 'parking location app',
          url: 'https://play.google.com/store/apps/details?id=example',
          title: 'Parking App Reviews',
          snippet: 'Paid app but users say it stops working and ask for a refund.',
          domain: 'play.google.com',
        },
      ],
      rawMetadata: { provider: 'fake-reviews' },
      errors: [],
      blocked: false,
      fetchedAt: '2026-07-07T10:00:03.000Z',
    };
  }
}

class FakeCompetitorCollector implements EvidenceCollector<CompetitorCollectorInput, CompetitorCollectorOutput> {
  readonly name = 'competitors';

  async collect(_input: CompetitorCollectorInput): Promise<CompetitorCollectorOutput> {
    return {
      items: [
        {
          name: 'Park Saver',
          url: 'https://parksaver.app',
          productType: 'direct_competitor',
          priceText: '$29 one-time',
          pricingModel: 'one-time',
          positioning: 'Automatically save your parking location.',
          strengths: [],
          weaknesses: [],
          reviewSummary: 'Users want better reliability.',
          excerpt: 'Automatically save your parking location.',
        },
      ],
      rawMetadata: { provider: 'fake-competitor' },
      errors: [],
      blocked: false,
      fetchedAt: '2026-07-07T10:00:04.000Z',
    };
  }
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-validate-'));
  tempDirs.push(dir);
  return dir;
}
