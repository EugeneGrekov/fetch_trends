import { readFile } from 'node:fs/promises';
import type { DiagnosticCheck, DiagnosticContext } from './types.js';

interface PackageJson {
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
}

const IMPLEMENTED_SCRIPTS = [
  'autocomplete',
  'validate',
  'db',
  'web',
  'worker',
  'payment-test',
  'seo-plan',
  'measurement',
  'decide',
  'report',
  'diagnose',
];

const ROADMAP_SCRIPTS = [
  'revalidate',
  'export-data',
  'backup',
  'restore',
];

export async function checkCommandHealth(context: DiagnosticContext): Promise<DiagnosticCheck[]> {
  let packageJson: PackageJson;
  try {
    packageJson = JSON.parse(await readFile(context.packageJsonPath, 'utf8')) as PackageJson;
  } catch (error) {
    return [
      {
        id: 'commands.package_json',
        label: 'package.json',
        category: 'commands',
        status: 'fail',
        message: 'package.json could not be read for command diagnostics.',
        details: {
          path: context.packageJsonPath,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        nextAction: 'Restore package.json before running project commands.',
      },
    ];
  }

  const scripts = packageJson.scripts ?? {};
  const checks: DiagnosticCheck[] = [
    {
      id: 'commands.package_json',
      label: 'package.json',
      category: 'commands',
      status: 'pass',
      message: 'package.json command metadata can be read.',
      details: {
        path: context.packageJsonPath,
      },
    },
  ];

  for (const script of IMPLEMENTED_SCRIPTS) {
    const exists = Boolean(scripts[script]?.trim());
    checks.push({
      id: `commands.script.${script}`,
      label: `npm script: ${script}`,
      category: 'commands',
      status: exists ? 'pass' : 'warn',
      message: exists
        ? `npm run ${script} is available.`
        : `npm run ${script} is missing.`,
      details: {
        configured: exists,
      },
      nextAction: exists ? undefined : `Add a package.json script for ${script}.`,
    });
  }

  for (const script of ROADMAP_SCRIPTS) {
    const exists = Boolean(scripts[script]?.trim());
    checks.push({
      id: `commands.script.${script}`,
      label: `npm script: ${script}`,
      category: 'commands',
      status: exists ? 'pass' : 'skip',
      message: exists
        ? `npm run ${script} is available.`
        : `npm run ${script} is not implemented in the current package.`,
      details: {
        configured: exists,
        roadmap: true,
      },
      nextAction: exists ? undefined : `Implement ${script} in its dedicated feature phase before requiring it operationally.`,
    });
  }

  const diagnoseBin = packageJson.bin?.['fetch-trends-diagnose'];
  checks.push({
    id: 'commands.bin.diagnose',
    label: 'diagnose bin entry',
    category: 'commands',
    status: diagnoseBin ? 'pass' : 'warn',
    message: diagnoseBin
      ? 'fetch-trends-diagnose bin entry is configured.'
      : 'fetch-trends-diagnose bin entry is missing.',
    details: {
      configured: Boolean(diagnoseBin),
    },
    nextAction: diagnoseBin ? undefined : 'Add fetch-trends-diagnose to package.json bin metadata.',
  });

  return checks;
}
