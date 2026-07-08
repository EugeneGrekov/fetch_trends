import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { buildBackupProgram } from './backup.js';
import { buildRestoreProgram } from './restore.js';
import { seedExportFixture } from '../testing/export-fixtures.js';

const tempDirs: string[] = [];

describe('backup and restore commands', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
    process.exitCode = 0;
  });

  it('creates a backup archive and restores it to a new database path', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'source.sqlite');
    const artifactRoot = join(dir, 'artifacts');
    const backupRoot = join(dir, 'backups');
    const restoreArtifacts = join(dir, 'restored-artifacts');
    const restoreDbPath = join(dir, 'restored.sqlite');
    const fixture = await seedExportFixture(dbPath, artifactRoot, 'backup');

    const backupProgram = buildBackupProgram();
    const timestamp = '2026-07-07T12:00:00.000Z';
    await backupProgram.parseAsync([
      'node',
      'backup',
      '--db',
      dbPath,
      '--out',
      backupRoot,
      '--artifacts-dir',
      artifactRoot,
      '--timestamp',
      timestamp,
    ]);

    const backupDir = join(backupRoot, 'fetch-trends-2026-07-07T120000Z');
    const manifest = JSON.parse(await readFile(join(backupDir, 'manifest.json'), 'utf8')) as {
      backupType: string;
      components: Array<{ included: boolean; name: string; targetPath: string }>;
      db: { fileName: string; sourcePath: string };
    };

    expect(manifest.backupType).toBe('full_backup');
    expect(manifest.db.sourcePath).toBe(dbPath);
    expect(manifest.components.find((component) => component.name === 'artifacts')?.included).toBe(true);
    expect(manifest.components.find((component) => component.name === 'reports')?.included).toBe(false);
    expect(await readFile(join(backupDir, 'fetch-trends.sqlite'), 'utf8')).not.toHaveLength(0);
    expect(await readFile(join(backupDir, 'artifacts', String(fixture.ideaId), 'validation-report.md'), 'utf8')).toContain('artifact report backup');

    const restoreProgram = buildRestoreProgram();
    await restoreProgram.parseAsync([
      'node',
      'restore',
      '--backup',
      backupDir,
      '--target-db',
      restoreDbPath,
      '--target-artifacts-dir',
      restoreArtifacts,
    ]);

    const { db } = await openDatabase(restoreDbPath);
    try {
      applyMigrations(db);
      expect((db.prepare('SELECT count(*) AS count FROM ideas').get() as { count: number }).count).toBe(1);
    } finally {
      db.close();
    }

    expect(await readFile(join(restoreArtifacts, String(fixture.ideaId), 'nested', 'note.txt'), 'utf8')).toContain('nested artifact backup');
  });

  it('refuses to overwrite an existing target database without force', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'source.sqlite');
    const artifactRoot = join(dir, 'artifacts');
    const backupRoot = join(dir, 'backups');
    const restoreDbPath = join(dir, 'restored.sqlite');
    await seedExportFixture(dbPath, artifactRoot, 'overwrite');
    await writeFile(restoreDbPath, 'existing');

    const backupProgram = buildBackupProgram();
    await backupProgram.parseAsync([
      'node',
      'backup',
      '--db',
      dbPath,
      '--out',
      backupRoot,
      '--artifacts-dir',
      artifactRoot,
      '--timestamp',
      '2026-07-07T12:00:00.000Z',
    ]);
    const backupDir = join(backupRoot, 'fetch-trends-2026-07-07T120000Z');

    const restoreProgram = buildRestoreProgram();
    await restoreProgram.parseAsync([
      'node',
      'restore',
      '--backup',
      backupDir,
      '--target-db',
      restoreDbPath,
    ]);

    expect(await readFile(restoreDbPath, 'utf8')).toBe('existing');
  });
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-backup-'));
  tempDirs.push(dir);
  return dir;
}
