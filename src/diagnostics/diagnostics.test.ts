import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { createIdea } from '../db/repositories/ideas.js';
import { createJob, failJob } from '../db/repositories/jobs.js';
import { createReport } from '../db/repositories/reports.js';
import { createToolRun, failToolRun } from '../db/repositories/tool-runs.js';
import { checkArtifactHealth } from './artifact-health.js';
import { checkCollectorHealth } from './collector-health.js';
import { checkCommandHealth } from './command-health.js';
import { checkConfiguration } from './config-check.js';
import { checkDatabaseHealth } from './db-health.js';
import { checkJobHealth } from './job-health.js';
import {
  createDiagnosticContext,
  renderDiagnosticReportJson,
  runDiagnostics,
} from './report.js';
import type { DiagnosticCheck } from './types.js';

const tempDirs: string[] = [];
const NOW = new Date('2026-07-07T12:00:00.000Z');

describe('operator diagnostics', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('reports configuration status without exposing secret values', async () => {
    const dir = await createTempDir();
    const context = createDiagnosticContext({
      cwd: dir,
      dbPath: join(dir, 'custom.sqlite'),
      env: {
        FETCH_TRENDS_DB_PATH: 'custom.sqlite',
        PATH: '',
        SERP_API_KEY: 'secret-serp-key',
      },
      generatedAt: NOW,
    });

    const checks = await checkConfiguration(context);
    const secretCheck = findCheck(checks, 'config.collector_secrets');

    expect(secretCheck.status).toBe('pass');
    expect(JSON.stringify(secretCheck.details)).not.toContain('secret-serp-key');
    expect(secretCheck.details).toMatchObject({
      SERP_API_KEY: 'configured',
      YOUTUBE_API_KEY: 'missing',
    });
  });

  it('checks database health against migrated temp SQLite', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'health.sqlite');
    const { db } = await openDatabase(dbPath);
    try {
      applyMigrations(db);
      createIdea(db, {
        title: 'Parking reminder',
        rawDescription: 'Parking reminder',
      });
    } finally {
      db.close();
    }

    const checks = await checkDatabaseHealth(testContext(dir, dbPath));

    expect(findCheck(checks, 'db.file_exists').status).toBe('pass');
    expect(findCheck(checks, 'db.required_tables').status).toBe('pass');
    expect(findCheck(checks, 'db.latest_migration').status).toBe('pass');
    expect(findCheck(checks, 'db.integrity').status).toBe('pass');
    expect(findCheck(checks, 'db.counts').details).toMatchObject({
      counts: expect.objectContaining({ ideas: 1 }),
    });
  });

  it('reports missing database files and skips dependent DB checks', async () => {
    const dir = await createTempDir();
    const checks = await checkDatabaseHealth(testContext(dir, join(dir, 'missing.sqlite')));

    expect(findCheck(checks, 'db.file_exists').status).toBe('fail');
    expect(findCheck(checks, 'db.required_tables').status).toBe('skip');
  });

  it('reports missing required tables', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'partial.sqlite');
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(`
        CREATE TABLE schema_migrations (
          id TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
      `);
    } finally {
      db.close();
    }

    const checks = await checkDatabaseHealth(testContext(dir, dbPath));

    expect(findCheck(checks, 'db.required_tables').status).toBe('fail');
    expect(findCheck(checks, 'db.required_tables').details).toMatchObject({
      missingTables: expect.arrayContaining(['ideas', 'jobs', 'reports']),
    });
  });

  it('detects failed jobs, stale jobs, tool run errors, and jobs without reports', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'jobs.sqlite');
    const { db } = await openDatabase(dbPath);
    try {
      applyMigrations(db);
      const idea = createIdea(db, {
        title: 'Parking reminder',
        rawDescription: 'Parking reminder',
      });
      db.prepare(`
        UPDATE ideas
        SET created_at = '2026-07-06T10:00:00.000Z',
            updated_at = '2026-07-06T10:00:00.000Z'
        WHERE id = :id
      `).run({ id: idea.id });

      const failed = createJob(db, {
        ideaId: idea.id,
        jobType: 'validate',
        status: 'running',
        startedAt: '2026-07-07T09:00:00.000Z',
      });
      failJob(db, failed.id, 'collector failed', '2026-07-07T09:30:00.000Z');

      createJob(db, {
        ideaId: idea.id,
        jobType: 'validate',
        status: 'running',
        startedAt: '2026-07-07T08:00:00.000Z',
      });

      createJob(db, {
        ideaId: idea.id,
        jobType: 'validate',
        status: 'pending',
      });

      const completed = createJob(db, {
        ideaId: idea.id,
        jobType: 'validate',
        status: 'completed',
        startedAt: '2026-07-07T10:00:00.000Z',
      });
      const toolRun = createToolRun(db, {
        jobId: completed.id,
        toolName: 'autocomplete',
        inputJson: '{}',
        status: 'running',
        startedAt: '2026-07-07T10:00:00.000Z',
      });
      failToolRun(db, toolRun.id, 'browser failed', '2026-07-07T10:05:00.000Z');
    } finally {
      db.close();
    }

    const checks = await checkJobHealth(testContext(dir, dbPath));

    expect(findCheck(checks, 'jobs.failed').status).toBe('warn');
    expect(findCheck(checks, 'jobs.stale_running').status).toBe('warn');
    expect(findCheck(checks, 'jobs.stale_pending').status).toBe('warn');
    expect(findCheck(checks, 'jobs.tool_run_errors').status).toBe('warn');
    expect(findCheck(checks, 'jobs.without_reports').status).toBe('warn');
  });

  it('reports collector readiness without live calls', async () => {
    const dir = await createTempDir();
    await mkdir(join(dir, 'config'), { recursive: true });
    await mkdir(join(dir, 'src', 'utilities', 'autocomplete'), { recursive: true });
    await mkdir(join(dir, 'node_modules', 'playwright'), { recursive: true });
    await writeFile(join(dir, 'config', 'collectors.json'), JSON.stringify({
      competitors: { enabled: true },
      reddit: { enabled: true },
      reviews: { enabled: true },
      serp: { enabled: true, provider: 'serpapi' },
      youtube: { enabled: true },
    }));
    await writeFile(join(dir, 'src', 'utilities', 'autocomplete', 'collector.ts'), '');
    await writeFile(join(dir, 'node_modules', 'playwright', 'package.json'), '{}');

    const checks = await checkCollectorHealth(createDiagnosticContext({
      cwd: dir,
      dbPath: join(dir, 'unused.sqlite'),
      env: {
        PATH: '',
      },
      generatedAt: NOW,
    }));

    expect(findCheck(checks, 'collectors.autocomplete').status).toBe('pass');
    expect(findCheck(checks, 'collectors.serp').status).toBe('warn');
    expect(findCheck(checks, 'collectors.live').message).toContain('no external calls were made');
  });

  it('fails command diagnostics when the command reference or bins are missing', async () => {
    const dir = await createTempDir();
    await mkdir(join(dir, 'docs', 'reference'), { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      bin: {
        'fetch-trends-diagnose': './dist/src/diagnose.js',
        'fetch-trends-portfolio': './dist/src/commands/portfolio.js',
      },
      scripts: {
        diagnose: 'tsx src/commands/diagnose.ts',
        portfolio: 'tsx src/commands/portfolio.ts',
      },
    }));
    await writeFile(join(dir, 'docs', 'reference', 'commands.md'), [
      '# Command Reference',
      '',
      'Run npm run diagnose.',
    ].join('\n'));

    const checks = await checkCommandHealth(createDiagnosticContext({
      cwd: dir,
      dbPath: join(dir, 'unused.sqlite'),
      env: {
        PATH: '',
      },
      generatedAt: NOW,
    }));

    expect(findCheck(checks, 'commands.docs.reference').status).toBe('pass');
    expect(findCheck(checks, 'commands.docs.portfolio').status).toBe('fail');
    expect(findCheck(checks, 'commands.bin.portfolio').status).toBe('pass');
  });

  it('fails command diagnostics when a roadmap command is added without a bin entry', async () => {
    const dir = await createTempDir();
    await mkdir(join(dir, 'docs', 'reference'), { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      bin: {
        'fetch-trends-diagnose': './dist/src/diagnose.js',
      },
      scripts: {
        diagnose: 'tsx src/commands/diagnose.ts',
        'export-data': 'tsx src/commands/export-data.ts',
      },
    }));
    await writeFile(join(dir, 'docs', 'reference', 'commands.md'), [
      '# Command Reference',
      '',
      'Run npm run diagnose.',
      'Run npm run export-data.',
    ].join('\n'));

    const checks = await checkCommandHealth(createDiagnosticContext({
      cwd: dir,
      dbPath: join(dir, 'unused.sqlite'),
      env: {
        PATH: '',
      },
      generatedAt: NOW,
    }));

    expect(findCheck(checks, 'commands.script.export-data').status).toBe('pass');
    expect(findCheck(checks, 'commands.bin.export-data').status).toBe('fail');
  });

  it('reports missing and orphan artifact files using temp directories', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'artifacts.sqlite');
    const artifactsDir = join(dir, 'artifacts');
    const { db } = await openDatabase(dbPath);
    try {
      applyMigrations(db);
      const idea = createIdea(db, {
        title: 'Parking reminder',
        rawDescription: 'Parking reminder',
      });
      createReport(db, {
        ideaId: idea.id,
        jobId: null,
        reportType: 'payment_test_spec',
        markdown: '# Payment Test',
        json: '{}',
        createdAt: NOW.toISOString(),
      });
    } finally {
      db.close();
    }
    await mkdir(artifactsDir, { recursive: true });
    await writeFile(join(artifactsDir, 'orphan.txt'), 'orphan');

    const checks = await checkArtifactHealth(testContext(dir, dbPath, { artifactsDir }));

    expect(findCheck(checks, 'artifacts.report_references').status).toBe('warn');
    expect(findCheck(checks, 'artifacts.orphans').status).toBe('warn');
  });

  it('renders diagnostic JSON output', async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { diagnose: 'tsx src/diagnose.ts' } }));

    const report = await runDiagnostics({
      cwd: dir,
      dbPath: join(dir, 'missing.sqlite'),
      env: {
        PATH: '',
      },
      generatedAt: NOW,
    });
    const parsed = JSON.parse(renderDiagnosticReportJson(report)) as {
      generatedAt: string;
      nextActions: string[];
      status: string;
      summary: Record<string, number>;
    };

    expect(parsed.generatedAt).toBe(NOW.toISOString());
    expect(parsed.status).toBe('fail');
    expect(parsed.summary.fail).toBeGreaterThan(0);
    expect(parsed.nextActions.length).toBeGreaterThan(0);
  });
});

function testContext(
  cwd: string,
  dbPath: string,
  overrides: { artifactsDir?: string } = {},
) {
  return createDiagnosticContext({
    artifactsDir: overrides.artifactsDir ?? join(cwd, 'artifacts'),
    cwd,
    dbPath,
    env: {
      PATH: '',
    },
    generatedAt: NOW,
    resultsDir: join(cwd, 'results'),
  });
}

function findCheck(checks: DiagnosticCheck[], id: string): DiagnosticCheck {
  const check = checks.find((candidate) => candidate.id === id);
  if (!check) {
    throw new Error(`Missing diagnostic check ${id}.`);
  }

  return check;
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-diagnostics-'));
  tempDirs.push(dir);
  return dir;
}
