import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { DiagnosticCheck, DiagnosticContext } from './types.js';

const REQUIRED_NODE_MAJOR = 20;

export async function checkConfiguration(context: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  checks.push({
    id: 'config.db_path',
    label: 'SQLite database path',
    category: 'configuration',
    status: 'pass',
    message: context.env.FETCH_TRENDS_DB_PATH
      ? 'FETCH_TRENDS_DB_PATH is configured.'
      : 'Using the default SQLite database path.',
    details: {
      configured: Boolean(context.env.FETCH_TRENDS_DB_PATH),
      path: context.dbPath,
    },
  });

  checks.push({
    id: 'config.results_path',
    label: 'Results path',
    category: 'configuration',
    status: 'pass',
    message: context.env.FETCH_TRENDS_RESULTS_DIR
      ? 'FETCH_TRENDS_RESULTS_DIR is configured.'
      : 'Using the default results directory.',
    details: {
      configured: Boolean(context.env.FETCH_TRENDS_RESULTS_DIR),
      path: context.resultsDir,
    },
  });

  checks.push({
    id: 'config.artifacts_path',
    label: 'Artifacts path',
    category: 'configuration',
    status: 'pass',
    message: context.env.FETCH_TRENDS_ARTIFACTS_DIR
      ? 'FETCH_TRENDS_ARTIFACTS_DIR is configured.'
      : 'Using the default artifacts directory.',
    details: {
      configured: Boolean(context.env.FETCH_TRENDS_ARTIFACTS_DIR),
      path: context.artifactsDir,
    },
  });

  checks.push(await optionalPathCheck({
    category: 'configuration',
    configuredPath: context.exportDir,
    id: 'config.export_path',
    label: 'Export path',
    missingMessage: 'No export path is configured for diagnostics.',
  }));

  checks.push(await optionalPathCheck({
    category: 'configuration',
    configuredPath: context.backupDir,
    id: 'config.backup_path',
    label: 'Backup path',
    missingMessage: 'No backup path is configured for diagnostics.',
  }));

  const codexPath = await findExecutable('codex', context.env.PATH);
  checks.push({
    id: 'config.codex_cli',
    label: 'Codex CLI availability',
    category: 'configuration',
    status: codexPath ? 'pass' : 'warn',
    message: codexPath
      ? 'Codex CLI is available on PATH.'
      : 'Codex CLI is not available on PATH; AI tasks may be blocked unless disabled.',
    details: {
      configured: Boolean(codexPath),
    },
    nextAction: codexPath ? undefined : 'Install the Codex CLI or run validation with AI disabled.',
  });

  checks.push({
    id: 'config.collector_secrets',
    label: 'Collector secret configuration',
    category: 'configuration',
    status: configured(context.env, 'SERP_API_KEY') ? 'pass' : 'warn',
    message: configured(context.env, 'SERP_API_KEY')
      ? 'The current SERP-backed collector secret is configured.'
      : 'SERP_API_KEY is missing; SERP-backed external collectors will be unavailable.',
    details: {
      SERP_API_KEY: secretStatus(context.env, 'SERP_API_KEY'),
      YOUTUBE_API_KEY: secretStatus(context.env, 'YOUTUBE_API_KEY'),
      REDDIT_CLIENT_ID: secretStatus(context.env, 'REDDIT_CLIENT_ID'),
      REDDIT_CLIENT_SECRET: secretStatus(context.env, 'REDDIT_CLIENT_SECRET'),
    },
    nextAction: configured(context.env, 'SERP_API_KEY')
      ? undefined
      : 'Set SERP_API_KEY to enable SERP, Reddit, YouTube, and review discovery.',
  });

  const nodeMajor = Number(process.versions.node.split('.')[0] ?? '0');
  checks.push({
    id: 'config.node_version',
    label: 'Node.js version',
    category: 'configuration',
    status: nodeMajor >= REQUIRED_NODE_MAJOR ? 'pass' : 'fail',
    message: nodeMajor >= REQUIRED_NODE_MAJOR
      ? `Node.js ${process.versions.node} satisfies the project engine requirement.`
      : `Node.js ${process.versions.node} is below the project engine requirement.`,
    details: {
      required: `>=${REQUIRED_NODE_MAJOR}.0.0`,
      current: process.versions.node,
    },
    nextAction: nodeMajor >= REQUIRED_NODE_MAJOR ? undefined : 'Upgrade Node.js to version 20 or newer.',
  });

  const playwrightPackagePath = join(context.cwd, 'node_modules', 'playwright', 'package.json');
  const playwrightInstalled = await pathExists(playwrightPackagePath);
  checks.push({
    id: 'config.playwright_package',
    label: 'Playwright package',
    category: 'configuration',
    status: playwrightInstalled ? 'pass' : 'warn',
    message: playwrightInstalled
      ? 'Playwright package is installed locally.'
      : 'Playwright package is missing from node_modules.',
    details: {
      configured: playwrightInstalled,
    },
    nextAction: playwrightInstalled ? undefined : 'Run npm install before using autocomplete collection.',
  });

  checks.push({
    id: 'config.playwright_browser',
    label: 'Playwright browser availability',
    category: 'configuration',
    status: 'skip',
    message: 'Browser launch checks are skipped by default to avoid side effects.',
    nextAction: 'Run an autocomplete smoke test manually if browser installation is uncertain.',
  });

  return checks;
}

function configured(env: Record<string, string | undefined>, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function secretStatus(env: Record<string, string | undefined>, name: string): 'configured' | 'missing' {
  return configured(env, name) ? 'configured' : 'missing';
}

async function optionalPathCheck(args: {
  category: DiagnosticCheck['category'];
  configuredPath?: string;
  id: string;
  label: string;
  missingMessage: string;
}): Promise<DiagnosticCheck> {
  if (!args.configuredPath) {
    return {
      id: args.id,
      label: args.label,
      category: args.category,
      status: 'skip',
      message: args.missingMessage,
      details: {
        configured: false,
      },
    };
  }

  return {
    id: args.id,
    label: args.label,
    category: args.category,
    status: await pathExists(args.configuredPath) ? 'pass' : 'warn',
    message: await pathExists(args.configuredPath)
      ? `${args.label} is configured and exists.`
      : `${args.label} is configured but does not exist yet.`,
    details: {
      configured: true,
      path: args.configuredPath,
    },
    nextAction: await pathExists(args.configuredPath) ? undefined : `Create ${args.configuredPath} before relying on this path.`,
  };
}

async function findExecutable(command: string, pathValue: string | undefined): Promise<string | null> {
  const pathEntries = (pathValue ?? '').split(delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = join(entry, command);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep scanning PATH.
    }
  }

  return null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
