#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations, listAppliedMigrations } from '../src/db/migrations.js';
import {
  collectReleaseVerificationFailures,
  getReleaseCommandPlan,
  readPackageJson,
  type ReleaseCommandTask,
} from './release-support.js';

interface CheckResult {
  detail?: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
}

const projectRoot = resolve(process.cwd());
type CheckStatus = CheckResult['status'];

try {
  await runReleaseCheck();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Release check failed: ${message}\n`);
  process.exitCode = 1;
}

async function runReleaseCheck(): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'fetch-trends-release-'));
  const tempDbPath = join(tempDir, 'release-check.sqlite');
  const packageJson = await readPackageJson(projectRoot);
  const results: CheckResult[] = [];
  let migrationCheckRan = false;

  try {
    for (const task of getReleaseCommandPlan(packageJson, tempDbPath)) {
      if (task.scriptName === 'diagnose' && !migrationCheckRan) {
        results.push(runMigrationCheckResult(tempDbPath));
        migrationCheckRan = true;
      }

      const commandResult = await runTask(task, { captureOutput: task.scriptName === 'diagnose' });
      if (task.scriptName === 'diagnose') {
        const diagnosticResult = parseDiagnosticResult(commandResult.stdout);
        results.push(diagnosticResult);
        if (diagnosticResult.status === 'fail') {
          printResults(results);
          throw new Error('diagnostics failed.');
        }
        continue;
      }

      results.push({ label: task.label, status: 'pass' });
    }

    if (!packageJson.scripts?.diagnose) {
      results.push({
        detail: 'npm script "diagnose" is not available yet; package verification is used as the safe local equivalent.',
        label: 'Diagnostics',
        status: 'warn',
      });
    }

    if (!migrationCheckRan) {
      results.push(runMigrationCheckResult(tempDbPath));
    }

    const failures = await collectReleaseVerificationFailures(projectRoot);
    if (failures.length > 0) {
      results.push({
        detail: failures.join(' '),
        label: 'Package verification',
        status: 'fail',
      });
      printResults(results);
      throw new Error('package verification failed.');
    }

    results.push({ label: 'Package verification', status: 'pass' });
    printResults(results);
    process.stdout.write('Release check passed.\n');
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

function runMigrationCheckResult(tempDbPath: string): CheckResult {
  const db = new DatabaseSync(tempDbPath);
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(db);
    const migrations = listAppliedMigrations(db);
    if (migrations.length === 0) {
      throw new Error('No migrations were applied or found.');
    }

    return {
      detail: `${migrations.length} migration(s) applied/found in a temp SQLite database.`,
      label: 'Migrations',
      status: 'pass',
    };
  } finally {
    db.close();
  }
}

async function runTask(
  task: ReleaseCommandTask,
  options: { captureOutput?: boolean } = {},
): Promise<{ stderr: string; stdout: string }> {
  if (!task.scriptName) {
    throw new Error(`Invalid release task: ${task.label}`);
  }

  return await new Promise<{ stderr: string; stdout: string }>((resolveTask, rejectTask) => {
    const child = spawn(npmCommand(), task.args, {
      cwd: projectRoot,
      env: { ...process.env, ...task.env },
      stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';

    if (options.captureOutput) {
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
    }

    child.on('error', rejectTask);
    child.on('exit', (code) => {
      if (code === 0) {
        resolveTask({ stderr, stdout });
        return;
      }

      const output = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
      const detail = output ? `\n${output}` : '';
      rejectTask(new Error(`${task.label} exited with code ${code ?? 'unknown'}.${detail}`));
    });
  });
}

function parseDiagnosticResult(stdout: string): CheckResult {
  const jsonStart = stdout.indexOf('{');
  const jsonEnd = stdout.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    return {
      detail: 'diagnose completed but did not return JSON output.',
      label: 'Diagnostics',
      status: 'fail',
    };
  }

  try {
    const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1)) as {
      status?: unknown;
      summary?: {
        fail?: unknown;
        pass?: unknown;
        skip?: unknown;
        warn?: unknown;
      };
    };
    const status = normalizeDiagnosticStatus(parsed.status);
    const summary = parsed.summary
      ? `pass ${parsed.summary.pass ?? 0}, warn ${parsed.summary.warn ?? 0}, fail ${parsed.summary.fail ?? 0}, skip ${parsed.summary.skip ?? 0}`
      : 'summary unavailable';

    return {
      detail: `diagnose reported ${summary}.`,
      label: 'Diagnostics',
      status,
    };
  } catch (error) {
    return {
      detail: `diagnose JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      label: 'Diagnostics',
      status: 'fail',
    };
  }
}

function normalizeDiagnosticStatus(status: unknown): CheckStatus {
  if (status === 'pass' || status === 'warn' || status === 'fail') {
    return status;
  }

  return 'warn';
}

function printResults(results: CheckResult[]): void {
  for (const result of results) {
    const detail = result.detail ? ` - ${result.detail}` : '';
    process.stdout.write(`${result.label}: ${result.status}${detail}\n`);
  }
}

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}
