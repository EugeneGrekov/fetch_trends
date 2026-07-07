import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { applyMigrations } from '../migrations.js';
import { createAutocompletePredictions, listAutocompletePredictionsByIdea } from './autocomplete-predictions.js';
import { createCompetitors, listCompetitorsByIdea } from './competitors.js';
import { createEvidence, listEvidenceByIdea, listEvidenceBySource } from './evidence.js';
import { createIdea, getIdeaById } from './ideas.js';
import { completeJob, createJob } from './jobs.js';
import { createQueries, listQueriesByIdea } from './queries.js';
import { createReport, listReportsByIdea, listReportsByJob } from './reports.js';
import { createScore, listScoresByIdea } from './scores.js';
import { createSources, listSourcesByIdea } from './sources.js';
import { completeToolRun, createToolRun } from './tool-runs.js';

const tempDirs: string[] = [];

describe('database repositories', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('creates and reads idea validation entities', async () => {
    const dir = await createTempDir();
    const { db } = await openDatabase(join(dir, 'repositories.sqlite'));
    applyMigrations(db);

    try {
      const idea = createIdea(db, {
        title: 'Automatic parking location app',
        rawDescription: 'Automatic parking location app',
        normalizedJson: '{"cleanedIdea":"Automatic parking location app"}',
        targetMarket: 'drivers',
        platform: 'Android',
        businessModel: 'software',
      });
      const job = createJob(db, {
        ideaId: idea.id,
        jobType: 'validate',
        status: 'running',
        startedAt: '2026-07-07T10:00:00.000Z',
      });
      const toolRun = createToolRun(db, {
        jobId: job.id,
        toolName: 'autocomplete',
        inputJson: '{"seeds":["automatic parking location app"]}',
        status: 'running',
        startedAt: '2026-07-07T10:00:00.000Z',
      });
      const queries = createQueries(db, [
        {
          ideaId: idea.id,
          query: 'automatic parking location app',
          normalizedQuery: 'automatic parking location app',
          intentType: 'high purchase intent',
          source: 'idea',
          priorityScore: 100,
          createdAt: '2026-07-07T10:00:00.000Z',
        },
      ]);
      createAutocompletePredictions(db, [
        {
          ideaId: idea.id,
          queryId: queries[0]?.id,
          prediction: 'automatic parking location app android',
          normalizedPrediction: 'automatic parking location app android',
          intent: 'high purchase intent',
          confidenceScore: 88,
          sourceSeed: queries[0]?.query ?? '',
          sourcePrefix: queries[0]?.query ?? '',
          country: 'US',
          language: 'en',
          createdAt: '2026-07-07T10:01:00.000Z',
        },
      ]);
      const sources = createSources(db, [
        {
          ideaId: idea.id,
          url: 'https://www.reddit.com/r/androidapps/comments/example/',
          sourceType: 'reddit_thread',
          title: 'App keeps losing parked location',
          snippet: 'The app loses my parked location unless I open it first.',
          fetchedAt: '2026-07-07T10:01:30.000Z',
        },
      ]);
      createEvidence(db, [
        {
          ideaId: idea.id,
          sourceId: sources[0]?.id ?? 0,
          quote: 'The app loses my parked location unless I open it first.',
          painType: 'reliability',
          complaint: 'location is lost',
          workaround: 'open it first',
          urgency: 'medium',
          paymentSignal: 'weak',
          confidenceScore: 72,
          createdAt: '2026-07-07T10:01:45.000Z',
        },
      ]);
      createCompetitors(db, [
        {
          ideaId: idea.id,
          name: 'Example Parking Tool',
          url: 'https://example.com/parking-tool',
          productType: 'direct_competitor',
          priceText: '$29 one-time',
          pricingModel: 'one-time',
          strengthsJson: '["Clear positioning"]',
          weaknessesJson: '[]',
          reviewSummary: 'Users mention setup friction.',
          createdAt: '2026-07-07T10:02:00.000Z',
        },
      ]);
      const score = createScore(db, {
        ideaId: idea.id,
        scoreType: 'search-language',
        scoreJson: '{"averageConfidence":88}',
        totalScore: 72,
        decision: 'validate deeper',
        createdAt: '2026-07-07T10:02:00.000Z',
      });
      const report = createReport(db, {
        ideaId: idea.id,
        jobId: job.id,
        reportType: 'search-language-validation',
        markdown: '# Validation Report',
        json: '{"decision":"validate deeper"}',
        createdAt: '2026-07-07T10:03:00.000Z',
      });

      const completedToolRun = completeToolRun(db, toolRun.id, '{"finalSummary":{"predictionCount":1}}', '2026-07-07T10:02:30.000Z');
      const completedJob = completeJob(db, job.id, '2026-07-07T10:03:00.000Z');

      expect(getIdeaById(db, idea.id).title).toBe('Automatic parking location app');
      expect(completedJob.status).toBe('completed');
      expect(completedToolRun.status).toBe('completed');
      expect(listQueriesByIdea(db, idea.id)).toHaveLength(1);
      expect(listAutocompletePredictionsByIdea(db, idea.id)).toHaveLength(1);
      expect(listSourcesByIdea(db, idea.id)).toHaveLength(1);
      expect(listEvidenceByIdea(db, idea.id)).toHaveLength(1);
      expect(listEvidenceBySource(db, sources[0]?.id ?? 0)).toHaveLength(1);
      expect(listCompetitorsByIdea(db, idea.id)).toEqual([
        expect.objectContaining({ name: 'Example Parking Tool' }),
      ]);
      expect(listScoresByIdea(db, idea.id)).toEqual([
        expect.objectContaining({ id: score.id, total_score: 72 }),
      ]);
      expect(listReportsByIdea(db, idea.id)).toEqual([
        expect.objectContaining({ id: report.id, report_type: 'search-language-validation' }),
      ]);
      expect(listReportsByJob(db, job.id)).toEqual([
        expect.objectContaining({ id: report.id, job_id: job.id }),
      ]);
    } finally {
      db.close();
    }
  });
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-repo-'));
  tempDirs.push(dir);
  return dir;
}
