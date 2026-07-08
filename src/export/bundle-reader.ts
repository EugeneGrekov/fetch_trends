import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupManifest, BackupComponentManifest } from './types.js';

export async function readBackupManifest(backupDir: string): Promise<BackupManifest> {
  const manifestPath = join(backupDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  assertBackupManifest(manifest);
  return manifest;
}

export function assertBackupManifest(value: unknown): asserts value is BackupManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('Backup manifest must be an object.');
  }

  const manifest = value as BackupManifest;
  if (manifest.version !== 1) {
    throw new Error(`Unsupported backup manifest version: ${String(manifest.version)}.`);
  }
  if (manifest.app !== 'fetch-trends') {
    throw new Error('Backup manifest app must be fetch-trends.');
  }
  if (manifest.backupType !== 'full_backup') {
    throw new Error('Backup manifest type must be full_backup.');
  }
  if (!manifest.db || typeof manifest.db.fileName !== 'string' || typeof manifest.db.sourcePath !== 'string') {
    throw new Error('Backup manifest db entry is invalid.');
  }
  if (!Array.isArray(manifest.components)) {
    throw new Error('Backup manifest components must be an array.');
  }

  for (const component of manifest.components) {
    assertBackupComponent(component);
  }
}

export function assertBackupComponent(value: unknown): asserts value is BackupComponentManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('Backup manifest component must be an object.');
  }

  const component = value as BackupComponentManifest;
  if (component.name !== 'artifacts' && component.name !== 'reports') {
    throw new Error('Backup manifest component name is invalid.');
  }
  if (typeof component.targetPath !== 'string') {
    throw new Error('Backup manifest component target path is invalid.');
  }
  if (typeof component.fileCount !== 'number' || component.fileCount < 0) {
    throw new Error('Backup manifest component file count is invalid.');
  }
  if (typeof component.totalBytes !== 'number' || component.totalBytes < 0) {
    throw new Error('Backup manifest component size is invalid.');
  }
  if (typeof component.included !== 'boolean') {
    throw new Error('Backup manifest component included flag is invalid.');
  }
  if (component.sourcePath != null && typeof component.sourcePath !== 'string') {
    throw new Error('Backup manifest component source path is invalid.');
  }
}
