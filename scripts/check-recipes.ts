import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageJson {
  scripts?: Record<string, string>;
}

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const recipeDir = join(rootDir, 'docs', 'recipes');
const workflowIndexPath = join(rootDir, 'docs', 'workflows.md');
const packageJsonPath = join(rootDir, 'package.json');

const recipeFiles = [
  'validate-one-idea.md',
  'compare-idea-portfolio.md',
  'run-payment-test.md',
  'measure-experiment.md',
  'decide-pivot-or-persevere.md',
  'revalidate-stale-evidence.md',
  'backup-and-restore.md',
  'diagnose-local-setup.md',
];

const requiredHeadings = [
  '## When To Use',
  '## Prerequisites',
  '## Commands',
  '## Expected Outputs',
  '## How To Read The Result',
  '## Failure Handling',
  '## Next Step',
];

async function main(): Promise<void> {
  const errors: string[] = [];
  const packageJson = await readJson<PackageJson>(packageJsonPath);
  const packageScripts = new Set(Object.keys(packageJson.scripts ?? {}));
  const markdownFiles: Array<{ label: string; path: string }> = [
    { label: 'docs/workflows.md', path: workflowIndexPath },
  ];

  for (const recipeFile of recipeFiles) {
    const recipePath = join(recipeDir, recipeFile);
    markdownFiles.push({ label: `docs/recipes/${recipeFile}`, path: recipePath });

    if (!existsSync(recipePath)) {
      errors.push(`Missing recipe file: docs/recipes/${recipeFile}`);
      continue;
    }

    const contents = await readFile(recipePath, 'utf8');
    if (!/^# .+/m.test(contents)) {
      errors.push(`Recipe docs/recipes/${recipeFile} must start with an H1 title.`);
    }

    for (const heading of requiredHeadings) {
      if (!contents.includes(heading)) {
        errors.push(`Recipe docs/recipes/${recipeFile} is missing heading: ${heading}`);
      }
    }
  }

  if (!existsSync(workflowIndexPath)) {
    errors.push('Missing workflow index: docs/workflows.md');
  } else {
    const workflowIndex = await readFile(workflowIndexPath, 'utf8');
    for (const recipeFile of recipeFiles) {
      const expectedLink = `./recipes/${recipeFile}`;
      if (!workflowIndex.includes(expectedLink)) {
        errors.push(`docs/workflows.md must link to ${expectedLink}`);
      }
    }
  }

  for (const file of markdownFiles) {
    if (!existsSync(file.path)) {
      continue;
    }

    const contents = await readFile(file.path, 'utf8');
    for (const command of extractNpmRunCommands(contents)) {
      if (!packageScripts.has(command)) {
        errors.push(`${file.label} references missing package script: npm run ${command}`);
      }
    }
  }

  if (errors.length > 0) {
    process.stderr.write(`Recipe check failed with ${errors.length} error(s):\n`);
    for (const error of errors) {
      process.stderr.write(`- ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Recipe check passed for ${recipeFiles.length} recipes.\n`);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function extractNpmRunCommands(markdown: string): string[] {
  const commands = new Set<string>();
  const commandPattern = /\bnpm\s+run\s+([a-z0-9:_-]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = commandPattern.exec(markdown)) !== null) {
    commands.add(match[1]);
  }

  return [...commands];
}

await main();
