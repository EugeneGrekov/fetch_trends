import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface CopiedDirectorySummary {
  fileCount: number;
  included: boolean;
  sourcePath: string | null;
  targetPath: string;
  totalBytes: number;
}

export async function copyDirectoryIfPresent(sourcePath: string, targetPath: string): Promise<CopiedDirectorySummary> {
  const sourceStat = await stat(sourcePath).catch(() => null);
  if (!sourceStat || !sourceStat.isDirectory()) {
    return {
      fileCount: 0,
      included: false,
      sourcePath: null,
      targetPath,
      totalBytes: 0,
    };
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { recursive: true, force: true });

  const summary = await summarizeDirectory(sourcePath);
  return {
    ...summary,
    included: true,
    sourcePath,
    targetPath,
  };
}

export async function summarizeDirectory(sourcePath: string): Promise<{ fileCount: number; totalBytes: number }> {
  const summary = { fileCount: 0, totalBytes: 0 };
  await collectDirectorySummary(sourcePath, summary);
  return summary;
}

async function collectDirectorySummary(path: string, summary: { fileCount: number; totalBytes: number }): Promise<void> {
  const sourceStat = await stat(path);
  if (sourceStat.isFile()) {
    summary.fileCount += 1;
    summary.totalBytes += sourceStat.size;
    return;
  }

  if (!sourceStat.isDirectory()) {
    return;
  }

  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    await collectDirectorySummary(join(path, entry.name), summary);
  }
}
