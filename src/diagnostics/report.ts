import { resolve } from 'node:path';
import { DEFAULT_DB_PATH } from '../db/connection.js';
import { checkArtifactHealth } from './artifact-health.js';
import { checkCollectorHealth } from './collector-health.js';
import { checkCommandHealth } from './command-health.js';
import { checkConfiguration } from './config-check.js';
import { checkDatabaseHealth } from './db-health.js';
import { checkJobHealth } from './job-health.js';
import type {
  DiagnosticCategory,
  DiagnosticCheck,
  DiagnosticContext,
  DiagnosticReport,
  DiagnosticRunOptions,
  DiagnosticStatus,
  DiagnosticSummary,
} from './types.js';
import {
  DEFAULT_ARTIFACTS_DIR,
  DEFAULT_LARGE_ARTIFACT_BYTES,
  DEFAULT_RESULTS_DIR,
} from './types.js';

const CATEGORY_LABELS: Record<DiagnosticCategory, string> = {
  configuration: 'Configuration',
  database: 'Database Health',
  jobs: 'Job Health',
  collectors: 'Collector Readiness',
  artifacts: 'Artifact Health',
  commands: 'Commands',
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as DiagnosticCategory[];

export async function runDiagnostics(options: DiagnosticRunOptions = {}): Promise<DiagnosticReport> {
  const context = createDiagnosticContext(options);
  const checks = [
    ...await checkGroup('configuration', () => checkConfiguration(context)),
    ...await checkGroup('database', () => checkDatabaseHealth(context)),
    ...await checkGroup('jobs', () => checkJobHealth(context)),
    ...await checkGroup('collectors', () => checkCollectorHealth(context)),
    ...await checkGroup('artifacts', () => checkArtifactHealth(context)),
    ...await checkGroup('commands', () => checkCommandHealth(context)),
  ];

  const summary = summarizeChecks(checks);
  return {
    generatedAt: context.generatedAt.toISOString(),
    status: overallStatus(summary),
    summary,
    checks,
    nextActions: collectNextActions(checks),
  };
}

export function createDiagnosticContext(options: DiagnosticRunOptions = {}): DiagnosticContext {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  return {
    artifactsDir: resolvePath(cwd, options.artifactsDir ?? env.FETCH_TRENDS_ARTIFACTS_DIR ?? DEFAULT_ARTIFACTS_DIR),
    backupDir: resolveOptionalPath(cwd, options.backupDir ?? env.FETCH_TRENDS_BACKUP_DIR),
    cwd,
    dbPath: resolvePath(cwd, options.dbPath ?? env.FETCH_TRENDS_DB_PATH ?? DEFAULT_DB_PATH),
    env,
    exportDir: resolveOptionalPath(cwd, options.exportDir ?? env.FETCH_TRENDS_EXPORT_DIR),
    generatedAt: options.generatedAt ?? new Date(),
    largeArtifactBytes: options.largeArtifactBytes ?? DEFAULT_LARGE_ARTIFACT_BYTES,
    live: options.live ?? false,
    packageJsonPath: resolvePath(cwd, options.packageJsonPath ?? 'package.json'),
    resultsDir: resolvePath(cwd, options.resultsDir ?? env.FETCH_TRENDS_RESULTS_DIR ?? DEFAULT_RESULTS_DIR),
  };
}

export function renderDiagnosticReportJson(report: DiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

export function renderDiagnosticReportMarkdown(report: DiagnosticReport): string {
  const lines: string[] = [
    '# Fetch Trends Diagnostic Report',
    '',
    `Generated at: ${report.generatedAt}`,
    `Overall status: ${report.status.toUpperCase()}`,
    '',
    '## Summary',
    '',
    '| Status | Count |',
    '|---|---:|',
    `| pass | ${report.summary.pass} |`,
    `| warn | ${report.summary.warn} |`,
    `| fail | ${report.summary.fail} |`,
    `| skip | ${report.summary.skip} |`,
    '',
  ];

  appendStatusSection(lines, 'Critical Failures', report.checks.filter((check) => check.status === 'fail'));
  appendStatusSection(lines, 'Warnings', report.checks.filter((check) => check.status === 'warn'));

  for (const category of CATEGORY_ORDER) {
    const checks = report.checks.filter((check) => check.category === category);
    if (checks.length === 0) {
      continue;
    }

    lines.push(`## ${CATEGORY_LABELS[category]}`, '');
    for (const check of checks) {
      lines.push(`- ${check.status.toUpperCase()} ${check.id}: ${check.message}`);
      if (check.nextAction) {
        lines.push(`  Next action: ${check.nextAction}`);
      }
    }
    lines.push('');
  }

  lines.push('## Recommended Next Actions', '');
  if (report.nextActions.length === 0) {
    lines.push('- No next actions recommended.');
  } else {
    for (const action of report.nextActions) {
      lines.push(`- ${action}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function appendStatusSection(lines: string[], title: string, checks: DiagnosticCheck[]): void {
  lines.push(`## ${title}`, '');
  if (checks.length === 0) {
    lines.push('- None.');
    lines.push('');
    return;
  }

  for (const check of checks) {
    lines.push(`- ${check.id}: ${check.message}`);
    if (check.nextAction) {
      lines.push(`  Next action: ${check.nextAction}`);
    }
  }
  lines.push('');
}

async function checkGroup(
  category: DiagnosticCategory,
  operation: () => Promise<DiagnosticCheck[]>,
): Promise<DiagnosticCheck[]> {
  try {
    return await operation();
  } catch (error) {
    return [
      {
        id: `${category}.internal_error`,
        label: `${CATEGORY_LABELS[category]} diagnostics`,
        category,
        status: 'fail',
        message: `${CATEGORY_LABELS[category]} diagnostics failed unexpectedly.`,
        details: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        nextAction: 'Inspect the diagnostics implementation and rerun npm run diagnose.',
      },
    ];
  }
}

function summarizeChecks(checks: DiagnosticCheck[]): DiagnosticSummary {
  return checks.reduce<DiagnosticSummary>(
    (summary, check) => ({
      ...summary,
      [check.status]: summary[check.status] + 1,
    }),
    {
      pass: 0,
      warn: 0,
      fail: 0,
      skip: 0,
    },
  );
}

function overallStatus(summary: DiagnosticSummary): DiagnosticStatus {
  if (summary.fail > 0) {
    return 'fail';
  }

  if (summary.warn > 0) {
    return 'warn';
  }

  if (summary.pass === 0 && summary.skip > 0) {
    return 'skip';
  }

  return 'pass';
}

function collectNextActions(checks: DiagnosticCheck[]): string[] {
  const actions = new Set<string>();
  for (const check of checks) {
    if (check.nextAction && check.status !== 'pass') {
      actions.add(check.nextAction);
    }
  }

  return [...actions];
}

function resolveOptionalPath(cwd: string, path: string | undefined): string | undefined {
  return path ? resolvePath(cwd, path) : undefined;
}

function resolvePath(cwd: string, path: string): string {
  return path === ':memory:' ? path : resolve(cwd, path);
}
