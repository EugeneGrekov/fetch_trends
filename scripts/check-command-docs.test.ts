import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkCommandDocs,
  commandDocsFailures,
  extractNpmRunReferences,
  missingDocumentedScripts,
  referencesMissingFromScripts,
} from './check-command-docs.js';

describe('command documentation checks', () => {
  it('extracts npm script references from Markdown snippets', () => {
    expect(extractNpmRunReferences('Run `npm run validate -- --idea "x"` and npm run build.', 'doc.md'))
      .toEqual([
        { documentPath: 'doc.md', scriptName: 'validate' },
        { documentPath: 'doc.md', scriptName: 'build' },
      ]);
  });

  it('finds missing and unknown command references without running commands', () => {
    const scripts = new Set(['build', 'test', 'validate']);

    expect(missingDocumentedScripts('Use npm run build and npm run test.', scripts)).toEqual(['validate']);
    expect(referencesMissingFromScripts([
      { documentPath: 'README.md', scriptName: 'build' },
      { documentPath: 'README.md', scriptName: 'deploy' },
    ], scripts)).toEqual([
      { documentPath: 'README.md', scriptName: 'deploy' },
    ]);
  });

  it('checks project command docs, README examples, and recipes offline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fetch-trends-command-docs-'));
    await mkdir(join(root, 'docs', 'reference'), { recursive: true });
    await mkdir(join(root, 'docs', 'recipes'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({
      scripts: {
        build: 'tsc -p tsconfig.json',
        test: 'vitest --run',
        validate: 'tsx src/validate.ts',
      },
    }));
    await writeFile(join(root, 'README.md'), 'Run npm run validate, then npm run build.\n');
    await writeFile(join(root, 'docs', 'reference', 'commands.md'), [
      'npm run build',
      'npm run test',
      'npm run validate',
    ].join('\n'));
    await writeFile(join(root, 'docs', 'recipes', 'validate-one-idea.md'), 'Use npm run validate.\n');

    expect(commandDocsFailures(await checkCommandDocs(root))).toEqual([]);
  });

  it('keeps the current README and optional command docs aligned with package scripts', async () => {
    const result = await checkCommandDocs(process.cwd());

    expect(commandDocsFailures(result)).toEqual([]);
  });
});
