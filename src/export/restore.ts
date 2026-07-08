import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { readBackupManifest } from './bundle-reader.js';
import type { BackupManifest, RestoreArchiveResult } from './types.js';

export interface RestoreBackupArchiveOptions {
  backupDir: string;
  force?: boolean;
  targetArtifactsDir?: string;
  targetDbPath: string;
  targetReportsDir?: string;
}

export async function restoreBackupArchive(options: RestoreBackupArchiveOptions): Promise<RestoreArchiveResult> {
  const backupDir = resolve(options.backupDir);
  const manifest = await readBackupManifest(backupDir);
  await validateBackupSources(backupDir, manifest);

  const backupDbPath = join(backupDir, manifest.db.fileName);
  const targetDbPath = resolve(options.targetDbPath);
  await writeBackupFile(backupDbPath, targetDbPath, options.force ?? false);

  const artifactsComponent = manifest.components.find((component) => component.name === 'artifacts');
  const reportsComponent = manifest.components.find((component) => component.name === 'reports');

  let artifactsRestored = false;
  if (options.targetArtifactsDir && artifactsComponent?.included) {
    await copyBackupDirectory(join(backupDir, artifactsComponent.targetPath), resolve(options.targetArtifactsDir), options.force ?? false);
    artifactsRestored = true;
  }

  let targetReportsDir: string | null = null;
  if (options.targetReportsDir && reportsComponent?.included) {
    targetReportsDir = resolve(options.targetReportsDir);
    await copyBackupDirectory(join(backupDir, reportsComponent.targetPath), targetReportsDir, options.force ?? false);
  }

  return {
    artifactsRestored,
    backupDir,
    dbRestored: true,
    manifest,
    targetArtifactsDir: options.targetArtifactsDir ? resolve(options.targetArtifactsDir) : null,
    targetDbPath,
    targetReportsDir,
  };
}

async function validateBackupSources(backupDir: string, manifest: BackupManifest): Promise<void> {
  await assertPathExists(join(backupDir, manifest.db.fileName), 'backup database');
  for (const component of manifest.components) {
    if (component.included) {
      await assertPathExists(join(backupDir, component.targetPath), `${component.name} backup directory`);
    }
  }
}

async function assertPathExists(path: string, label: string): Promise<void> {
  const current = await stat(path).catch(() => null);
  if (!current) {
    throw new Error(`Backup ${label} is missing at ${path}.`);
  }
}

async function writeBackupFile(sourcePath: string, targetPath: string, force: boolean): Promise<void> {
  await ensureTargetAvailable(targetPath, force);
  await mkdir(dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { force: true, recursive: false });
}

async function copyBackupDirectory(sourcePath: string, targetPath: string, force: boolean): Promise<void> {
  await ensureTargetAvailable(targetPath, force);
  await mkdir(dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { force: true, recursive: true });
}

async function ensureTargetAvailable(targetPath: string, force: boolean): Promise<void> {
  const current = await stat(targetPath).catch(() => null);
  if (!current) {
    return;
  }

  if (!force) {
    throw new Error(`Refusing to overwrite existing path ${targetPath}. Pass --force to replace it.`);
  }

  await rm(targetPath, { force: true, recursive: true });
}
