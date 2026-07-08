import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  'portfolio',
  'revalidate',
  'export-data',
  'backup',
  'restore',
];

const COMMANDS_DOC_PATH = 'docs/reference/commands.md';

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

  const commandDocs = await readOptionalFile(join(context.cwd, COMMANDS_DOC_PATH));
  checks.push({
    id: 'commands.docs.reference',
    label: 'command reference docs',
    category: 'commands',
    status: commandDocs ? 'pass' : 'fail',
    message: commandDocs
      ? `${COMMANDS_DOC_PATH} is available.`
      : `${COMMANDS_DOC_PATH} is missing.`,
    details: {
      configured: Boolean(commandDocs),
      path: join(context.cwd, COMMANDS_DOC_PATH),
    },
    nextAction: commandDocs ? undefined : `Restore ${COMMANDS_DOC_PATH} before relying on command documentation checks.`,
  });

  for (const script of [...IMPLEMENTED_SCRIPTS, ...ROADMAP_SCRIPTS]) {
    const exists = Boolean(scripts[script]?.trim());
    const roadmap = ROADMAP_SCRIPTS.includes(script);
    checks.push({
      id: `commands.script.${script}`,
      label: `npm script: ${script}`,
      category: 'commands',
      status: exists ? 'pass' : roadmap ? 'skip' : 'warn',
      message: exists
        ? `npm run ${script} is available.`
        : roadmap
          ? `npm run ${script} is not implemented in the current package.`
          : `npm run ${script} is missing.`,
      details: {
        configured: exists,
        roadmap,
      },
      nextAction: exists
        ? undefined
        : roadmap
          ? `Implement ${script} in its dedicated feature phase before requiring it operationally.`
          : `Add a package.json script for ${script}.`,
    });

    if (!exists) {
      continue;
    }

    if (commandDocs && !commandDocs.includes(`npm run ${script}`)) {
      checks.push({
        id: `commands.docs.${script}`,
        label: `command reference entry: ${script}`,
        category: 'commands',
        status: 'fail',
        message: `docs/reference/commands.md does not document npm run ${script}.`,
        details: {
          configured: true,
          script,
        },
        nextAction: `Add npm run ${script} to docs/reference/commands.md.`,
      });
    }

    const binName = `fetch-trends-${script}`;
    const binPath = packageJson.bin?.[binName];
    checks.push({
      id: `commands.bin.${script}`,
      label: `bin entry: ${binName}`,
      category: 'commands',
      status: binPath ? 'pass' : 'fail',
      message: binPath
        ? `${binName} bin entry is configured.`
        : `${binName} bin entry is missing.`,
      details: {
        configured: Boolean(binPath),
        path: binPath,
      },
      nextAction: binPath ? undefined : `Add ${binName} to package.json bin metadata.`,
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

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}
