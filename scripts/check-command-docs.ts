#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DOCS } from './docs-paths.js';

export interface PackageJson {
  scripts?: Record<string, string>;
}

export interface CommandReference {
  documentPath: string;
  scriptName: string;
}

export interface CommandDocsCheckResult {
  missingCommandReferenceScripts: string[];
  unknownReadmeScripts: CommandReference[];
  unknownRecipeScripts: CommandReference[];
  warnings: string[];
}

export async function checkCommandDocs(projectRoot: string): Promise<CommandDocsCheckResult> {
  const root = resolve(projectRoot);
  const packageJson = await readPackageJson(root);
  const scripts = new Set(Object.keys(packageJson.scripts ?? {}));
  const warnings: string[] = [];

  const commandsDocPath = resolve(root, DOCS.reference.commands);
  const commandsDoc = await readOptionalFile(commandsDocPath);
  const missingCommandReferenceScripts = commandsDoc == null
    ? []
    : missingDocumentedScripts(commandsDoc, scripts);

  if (commandsDoc == null) {
    warnings.push(`${DOCS.reference.commands} is missing; command reference coverage was skipped.`);
  }

  const readmeReferences = extractNpmRunReferences(
    await readFile(join(root, 'README.md'), 'utf8'),
    'README.md',
  );
  const recipeReferences = await readRecipeReferences(root);

  return {
    missingCommandReferenceScripts,
    unknownReadmeScripts: referencesMissingFromScripts(readmeReferences, scripts),
    unknownRecipeScripts: referencesMissingFromScripts(recipeReferences, scripts),
    warnings,
  };
}

export function extractNpmRunReferences(contents: string, documentPath: string): CommandReference[] {
  const references: CommandReference[] = [];
  const pattern = /\bnpm\s+run\s+([a-zA-Z0-9:_-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(contents)) != null) {
    const scriptName = match[1];
    if (scriptName) {
      references.push({ documentPath, scriptName });
    }
  }

  return references;
}

export function missingDocumentedScripts(commandsDoc: string, scripts: ReadonlySet<string>): string[] {
  return [...scripts].sort().filter((scriptName) => !commandsDoc.includes(`npm run ${scriptName}`));
}

export function referencesMissingFromScripts(
  references: CommandReference[],
  scripts: ReadonlySet<string>,
): CommandReference[] {
  return references.filter((reference) => !scripts.has(reference.scriptName));
}

export function commandDocsFailures(result: CommandDocsCheckResult): string[] {
  return [
    ...result.missingCommandReferenceScripts.map(
      (scriptName) => `${DOCS.reference.commands} does not document npm run ${scriptName}.`,
    ),
    ...formatUnknownReferences('README.md references an unknown npm script', result.unknownReadmeScripts),
    ...formatUnknownReferences('Recipe references an unknown npm script', result.unknownRecipeScripts),
  ];
}

async function readPackageJson(projectRoot: string): Promise<PackageJson> {
  return JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')) as PackageJson;
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

async function readRecipeReferences(projectRoot: string): Promise<CommandReference[]> {
  const recipesDir = join(projectRoot, 'docs', 'recipes');
  const paths = await listMarkdownFiles(recipesDir);
  const references: CommandReference[] = [];

  for (const path of paths) {
    references.push(...extractNpmRunReferences(await readFile(path, 'utf8'), path));
  }

  return references;
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  });
  const paths: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const childPaths = await listMarkdownFiles(path);
      paths.push(...childPaths);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      paths.push(path);
    }
  }

  return paths.sort();
}

function formatUnknownReferences(prefix: string, references: CommandReference[]): string[] {
  return references.map((reference) => `${prefix}: npm run ${reference.scriptName} in ${reference.documentPath}.`);
}

async function main(): Promise<void> {
  const result = await checkCommandDocs(process.cwd());
  const failures = commandDocsFailures(result);

  for (const warning of result.warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(`Error: ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Command documentation check passed.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
