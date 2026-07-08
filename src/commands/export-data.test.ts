import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { buildExportDataProgram } from './export-data.js';
import { seedExportFixture } from '../testing/export-fixtures.js';

const tempDirs: string[] = [];

describe('export-data command', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
    process.exitCode = 0;
  });

  it('exports an idea bundle with basic redaction', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'export.sqlite');
    const artifactRoot = join(dir, 'artifacts');
    const outPath = join(dir, 'idea.json');
    const idea = await seedExportFixture(dbPath, artifactRoot, 'basic');

    const program = buildExportDataProgram();
    await program.parseAsync([
      'node',
      'export-data',
      '--db',
      dbPath,
      '--idea-id',
      String(idea.ideaId),
      '--artifacts-root',
      artifactRoot,
      '--format',
      'json',
      '--out',
      outPath,
    ]);

    const exported = JSON.parse(await readFile(outPath, 'utf8')) as {
      export: {
        data: {
          artifactPaths: string[];
          evidence: Array<{ quote: string }>;
          jobs: Array<{ toolRuns: Array<{ metadata_json: string | null; output_json: string | null }> }>;
          reports: Array<{ json: string | null; markdown: string }>;
          sources: Array<{ url: string }>;
        };
      };
      manifest: { bundleType: string; ideaIds: number[]; redaction: string };
    };

    expect(exported.manifest.bundleType).toBe('idea_bundle');
    expect(exported.manifest.ideaIds).toEqual([idea.ideaId]);
    expect(exported.manifest.redaction).toBe('basic');
    expect(exported.export.data.sources[0]?.url).toBe('example.test');
    expect(exported.export.data.evidence[0]?.quote).toBe('[redacted]');
    expect(exported.export.data.jobs[0]?.toolRuns[0]?.output_json).toBe('[redacted]');
    expect(exported.export.data.jobs[0]?.toolRuns[0]?.metadata_json).toBe('[redacted]');
    expect(exported.export.data.reports[0]?.markdown).toContain('[redacted]');
    expect(exported.export.data.artifactPaths).toEqual(['1/nested/note.txt', '1/validation-report.md']);
  });

  it('exports a portfolio bundle as markdown with multiple ideas', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'portfolio.sqlite');
    const artifactRoot = join(dir, 'artifacts');
    await seedExportFixture(dbPath, artifactRoot, 'one');
    const second = await seedExportFixture(dbPath, artifactRoot, 'two');

    const program = buildExportDataProgram();
    const outPath = join(dir, 'portfolio.md');
    await program.parseAsync([
      'node',
      'export-data',
      '--db',
      dbPath,
      '--portfolio',
      '--format',
      'markdown',
      '--out',
      outPath,
    ]);

    const markdown = await readFile(outPath, 'utf8');
    expect(markdown).toContain('# Fetch Trends Portfolio Export');
    expect(markdown).toContain('Invoice late fee calculator one');
    expect(markdown).toContain('Invoice late fee calculator two');
    expect(markdown).toContain(String(second.ideaId));
    expect(markdown).toContain('continue');
    expect(markdown).toContain('Run a payment test');
  });

  it('applies strict redaction in markdown exports', async () => {
    const dir = await createTempDir();
    const dbPath = join(dir, 'strict.sqlite');
    const artifactRoot = join(dir, 'artifacts');
    const idea = await seedExportFixture(dbPath, artifactRoot, 'strict');

    const program = buildExportDataProgram();
    const outPath = join(dir, 'strict.md');
    await program.parseAsync([
      'node',
      'export-data',
      '--db',
      dbPath,
      '--idea-id',
      String(idea.ideaId),
      '--artifacts-root',
      artifactRoot,
      '--format',
      'markdown',
      '--redaction',
      'strict',
      '--out',
      outPath,
    ]);

    const markdown = await readFile(outPath, 'utf8');
    expect(markdown).toContain('[redacted report]');
    expect(markdown).toContain('[redacted url]');
    expect(markdown).toContain('[redacted path]');
    expect(markdown).toContain('strict');
  });
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-export-'));
  tempDirs.push(dir);
  return dir;
}
