import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import type { DiagnosticCheck, DiagnosticContext } from './types.js';

interface CollectorConfigFile {
  serp?: {
    enabled?: boolean;
    provider?: string;
  };
  reddit?: {
    enabled?: boolean;
  };
  youtube?: {
    enabled?: boolean;
  };
  competitors?: {
    enabled?: boolean;
  };
  reviews?: {
    enabled?: boolean;
  };
}

interface CollectorReadiness {
  config: CollectorConfigFile;
  configWarning?: string;
  serpConfigured: boolean;
  serpEnabled: boolean;
}

export async function checkCollectorHealth(context: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const readiness = await readCollectorReadiness(context);
  const checks: DiagnosticCheck[] = [];

  if (readiness.configWarning) {
    checks.push({
      id: 'collectors.config',
      label: 'Collector config file',
      category: 'collectors',
      status: 'warn',
      message: readiness.configWarning,
      nextAction: 'Fix config/collectors.json or remove it to use defaults.',
    });
  } else {
    checks.push({
      id: 'collectors.config',
      label: 'Collector config file',
      category: 'collectors',
      status: 'pass',
      message: 'Collector configuration can be read.',
    });
  }

  const autocompleteSourceExists = await pathExists(join(context.cwd, 'src', 'utilities', 'autocomplete', 'collector.ts'));
  const playwrightPackageExists = await pathExists(join(context.cwd, 'node_modules', 'playwright', 'package.json'));
  checks.push({
    id: 'collectors.autocomplete',
    label: 'Autocomplete collector',
    category: 'collectors',
    status: autocompleteSourceExists && playwrightPackageExists ? 'pass' : 'warn',
    message: autocompleteSourceExists && playwrightPackageExists
      ? 'Autocomplete collector code and Playwright package are available.'
      : 'Autocomplete collector readiness is incomplete.',
    details: {
      sourceAvailable: autocompleteSourceExists,
      playwrightInstalled: playwrightPackageExists,
    },
    nextAction: autocompleteSourceExists && playwrightPackageExists
      ? undefined
      : 'Run npm install and verify src/utilities/autocomplete exists.',
  });

  checks.push(serpCollectorCheck(readiness));
  checks.push(serpBackedCollectorCheck({
    configEnabled: readiness.config.reddit?.enabled ?? true,
    id: 'collectors.reddit',
    label: 'Reddit discovery',
    readiness,
  }));
  checks.push(serpBackedCollectorCheck({
    configEnabled: readiness.config.youtube?.enabled ?? true,
    id: 'collectors.youtube',
    label: 'YouTube discovery',
    readiness,
  }));
  checks.push(serpBackedCollectorCheck({
    configEnabled: readiness.config.reviews?.enabled ?? true,
    id: 'collectors.reviews',
    label: 'Review discovery',
    readiness,
  }));
  checks.push(competitorCollectorCheck(context, readiness));
  checks.push({
    id: 'collectors.live',
    label: 'Live collector checks',
    category: 'collectors',
    status: 'skip',
    message: context.live
      ? 'Live collector probes are not implemented in this local diagnostics phase; no external calls were made.'
      : 'Live collector probes were not requested; no external calls were made.',
    nextAction: context.live ? undefined : 'Pass --live only when a future live diagnostic probe is explicitly needed.',
  });

  return checks;
}

async function readCollectorReadiness(context: DiagnosticContext): Promise<CollectorReadiness> {
  const fallbackConfig: CollectorConfigFile = {
    serp: { enabled: true, provider: 'serpapi' },
    reddit: { enabled: true },
    youtube: { enabled: true },
    competitors: { enabled: true },
    reviews: { enabled: true },
  };

  const configPath = join(context.cwd, 'config', 'collectors.json');
  let parsed: CollectorConfigFile = fallbackConfig;
  let configWarning: string | undefined;
  try {
    parsed = {
      ...fallbackConfig,
      ...JSON.parse(await readFile(configPath, 'utf8')) as CollectorConfigFile,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      configWarning = `Collector configuration could not be read: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return {
    config: parsed,
    configWarning,
    serpConfigured: Boolean(context.env.SERP_API_KEY?.trim()),
    serpEnabled: parsed.serp?.enabled ?? true,
  };
}

function serpCollectorCheck(readiness: CollectorReadiness): DiagnosticCheck {
  const provider = readiness.config.serp?.provider ?? 'serpapi';
  if (!readiness.serpEnabled) {
    return {
      id: 'collectors.serp',
      label: 'SERP provider',
      category: 'collectors',
      status: 'skip',
      message: 'SERP collector is disabled in config/collectors.json.',
    };
  }

  if (provider !== 'serpapi') {
    return {
      id: 'collectors.serp',
      label: 'SERP provider',
      category: 'collectors',
      status: 'warn',
      message: `Configured SERP provider ${provider} is not implemented by the current codebase.`,
      details: {
        provider,
      },
      nextAction: 'Use provider "serpapi" or add the missing provider adapter in a dedicated feature phase.',
    };
  }

  return {
    id: 'collectors.serp',
    label: 'SERP provider',
    category: 'collectors',
    status: readiness.serpConfigured ? 'pass' : 'warn',
    message: readiness.serpConfigured
      ? 'SERP provider is configured.'
      : 'SERP provider is missing SERP_API_KEY.',
    details: {
      provider,
      SERP_API_KEY: readiness.serpConfigured ? 'configured' : 'missing',
    },
    nextAction: readiness.serpConfigured ? undefined : 'Set SERP_API_KEY to enable live SERP collection during validation.',
  };
}

function serpBackedCollectorCheck(args: {
  configEnabled: boolean;
  id: string;
  label: string;
  readiness: CollectorReadiness;
}): DiagnosticCheck {
  if (!args.configEnabled) {
    return {
      id: args.id,
      label: args.label,
      category: 'collectors',
      status: 'skip',
      message: `${args.label} is disabled in config/collectors.json.`,
    };
  }

  if (!args.readiness.serpEnabled) {
    return {
      id: args.id,
      label: args.label,
      category: 'collectors',
      status: 'warn',
      message: `${args.label} depends on the SERP provider, but SERP collection is disabled.`,
      nextAction: 'Enable the SERP collector or keep this collector disabled.',
    };
  }

  return {
    id: args.id,
    label: args.label,
    category: 'collectors',
    status: args.readiness.serpConfigured ? 'pass' : 'warn',
    message: args.readiness.serpConfigured
      ? `${args.label} is ready through the configured SERP provider.`
      : `${args.label} is unavailable because SERP_API_KEY is missing.`,
    details: {
      backend: 'serp',
      SERP_API_KEY: args.readiness.serpConfigured ? 'configured' : 'missing',
    },
    nextAction: args.readiness.serpConfigured ? undefined : 'Set SERP_API_KEY or disable this collector in config/collectors.json.',
  };
}

function competitorCollectorCheck(context: DiagnosticContext, readiness: CollectorReadiness): DiagnosticCheck {
  const sourceAvailable = true;
  const configEnabled = readiness.config.competitors?.enabled ?? true;
  if (!configEnabled) {
    return {
      id: 'collectors.competitors',
      label: 'Competitor pages',
      category: 'collectors',
      status: 'skip',
      message: 'Competitor page collection is disabled in config/collectors.json.',
    };
  }

  return {
    id: 'collectors.competitors',
    label: 'Competitor pages',
    category: 'collectors',
    status: sourceAvailable && readiness.serpConfigured ? 'pass' : 'warn',
    message: readiness.serpConfigured
      ? 'Competitor collector code is available and can use SERP candidate URLs during validation.'
      : 'Competitor collector code is available, but it needs SERP candidate URLs before it can run usefully.',
    details: {
      sourceAvailable,
      requiresSerpCandidates: true,
      SERP_API_KEY: readiness.serpConfigured ? 'configured' : 'missing',
    },
    nextAction: readiness.serpConfigured ? undefined : 'Set SERP_API_KEY to discover competitor candidate URLs.',
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
