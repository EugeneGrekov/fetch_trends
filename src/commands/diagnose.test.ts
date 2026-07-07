import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDiagnoseProgram } from './diagnose.js';
import type { DiagnosticReport } from '../diagnostics/types.js';

const tempDirs: string[] = [];

describe('diagnose command', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('prints JSON diagnostics', async () => {
    const output: string[] = [];
    const program = buildDiagnoseProgram({
      runDiagnostics: async () => fixtureReport(),
      stdout: {
        write(chunk: string) {
          output.push(chunk);
        },
      },
    });

    await program.parseAsync(['node', 'diagnose', '--json']);

    const parsed = JSON.parse(output.join('')) as DiagnosticReport;
    expect(parsed.status).toBe('warn');
    expect(parsed.summary.warn).toBe(1);
  });

  it('writes Markdown diagnostics to --out', async () => {
    const dir = await createTempDir();
    const outPath = join(dir, 'diagnostics.md');
    const output: string[] = [];
    const program = buildDiagnoseProgram({
      runDiagnostics: async () => fixtureReport(),
      stdout: {
        write(chunk: string) {
          output.push(chunk);
        },
      },
    });

    await program.parseAsync(['node', 'diagnose', '--out', outPath]);

    expect(output.join('')).toContain('Wrote diagnostic report');
    expect(await readFile(outPath, 'utf8')).toContain('# Fetch Trends Diagnostic Report');
  });
});

function fixtureReport(): DiagnosticReport {
  return {
    generatedAt: '2026-07-07T12:00:00.000Z',
    status: 'warn',
    summary: {
      fail: 0,
      pass: 1,
      skip: 0,
      warn: 1,
    },
    checks: [
      {
        id: 'config.db_path',
        label: 'SQLite database path',
        category: 'configuration',
        status: 'pass',
        message: 'Using the default SQLite database path.',
      },
      {
        id: 'collectors.serp',
        label: 'SERP provider',
        category: 'collectors',
        status: 'warn',
        message: 'SERP provider is missing SERP_API_KEY.',
        nextAction: 'Set SERP_API_KEY.',
      },
    ],
    nextActions: ['Set SERP_API_KEY.'],
  };
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-diagnose-command-'));
  tempDirs.push(dir);
  return dir;
}
