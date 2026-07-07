import { describe, expect, it } from 'vitest';
import { createEvidence, listEvidenceByIdea } from './repositories/evidence.js';
import { createIdea } from './repositories/ideas.js';
import { createReport, listReportsByIdea } from './repositories/reports.js';
import {
  createRevalidationQueueItem,
  createRevalidationRun,
  listRevalidationQueueByIdea,
  listRevalidationRules,
  listRevalidationRuns,
} from './repositories/revalidation.js';
import { createScore, listScoresByIdea } from './repositories/scores.js';
import { createSources } from './repositories/sources.js';
import { applyMigrations, listAppliedMigrations } from './migrations.js';
import {
  evidenceFixture,
  ideaFixture,
  reportFixture,
  revalidationQueueFixture,
  revalidationRunFixture,
  scoreFixture,
  sourceFixture,
} from '../testing/fixtures.js';
import { createTempDatabase } from '../testing/temp-db.js';

const REQUIRED_TABLES = [
  'autocomplete_predictions',
  'competitors',
  'evidence',
  'experiment_decisions',
  'experiment_events',
  'experiments',
  'idea_decisions',
  'ideas',
  'jobs',
  'measurement_snapshots',
  'queries',
  'reports',
  'revalidation_queue',
  'revalidation_rules',
  'revalidation_runs',
  'schema_migrations',
  'scores',
  'sources',
  'tool_runs',
];

describe('migration compatibility', () => {
  it('applies all migrations once and leaves reruns as no-ops', async () => {
    const tempDb = await createTempDatabase({ migrate: false, prefix: 'fetch-trends-migrations-' });

    try {
      const applied = applyMigrations(tempDb.db);
      const appliedAgain = applyMigrations(tempDb.db);
      const recorded = listAppliedMigrations(tempDb.db).map((migration) => migration.id);

      expect(applied.length).toBeGreaterThanOrEqual(5);
      expect(applied.every((id) => /^\d{3}_[a-z0-9_]+$/.test(id))).toBe(true);
      expect(new Set(applied).size).toBe(applied.length);
      expect(appliedAgain).toEqual([]);
      expect(recorded).toEqual(applied);
    } finally {
      await tempDb.cleanup();
    }
  });

  it('creates the required schema tables without depending on an exact migration count', async () => {
    const tempDb = await createTempDatabase({ prefix: 'fetch-trends-schema-' });

    try {
      const tables = tempDb.db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name
      `).all() as Array<{ name: string }>;

      expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining(REQUIRED_TABLES));
    } finally {
      await tempDb.cleanup();
    }
  });

  it('keeps representative repositories compatible with the fully migrated schema', async () => {
    const tempDb = await createTempDatabase({ prefix: 'fetch-trends-repo-compat-' });

    try {
      const idea = createIdea(tempDb.db, ideaFixture());
      const source = createSources(tempDb.db, [sourceFixture(idea.id)])[0];
      expect(source).toBeDefined();
      if (!source) {
        throw new Error('Source fixture was not created.');
      }

      createEvidence(tempDb.db, [evidenceFixture(idea.id, source.id)]);
      createScore(tempDb.db, scoreFixture(idea.id));
      createReport(tempDb.db, reportFixture(idea.id));
      createRevalidationRun(tempDb.db, revalidationRunFixture({ ideaId: idea.id }));
      createRevalidationQueueItem(tempDb.db, revalidationQueueFixture(idea.id));

      expect(listEvidenceByIdea(tempDb.db, idea.id)).toHaveLength(1);
      expect(listScoresByIdea(tempDb.db, idea.id)).toHaveLength(1);
      expect(listReportsByIdea(tempDb.db, idea.id)).toHaveLength(1);
      expect(listRevalidationRules(tempDb.db).length).toBeGreaterThan(0);
      expect(listRevalidationRuns(tempDb.db)).toEqual([
        expect.objectContaining({ idea_id: idea.id, mode: 'scan' }),
      ]);
      expect(listRevalidationQueueByIdea(tempDb.db, idea.id)).toEqual([
        expect.objectContaining({ status: 'pending', task_type: 'refresh_autocomplete' }),
      ]);
    } finally {
      await tempDb.cleanup();
    }
  });
});
