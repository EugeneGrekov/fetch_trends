import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildLocalPackage,
  docsIncludeAllScripts,
  getReleaseCommandPlan,
  shouldIncludePackagePath,
  sourcePathForBinPath,
  validateExampleEnvContents,
  type PackageJson,
} from './release-support.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs.length = 0;
});

describe('release packaging support', () => {
  it('assembles release commands without running external services', () => {
    const packageJson: PackageJson = {
      scripts: {
        build: 'tsc -p tsconfig.json',
        diagnose: 'tsx src/commands/diagnose.ts',
        lint: 'eslint .',
        test: 'vitest --run',
      },
    };

    const tasks = getReleaseCommandPlan(packageJson, '/tmp/fetch-trends-release.sqlite');

    expect(tasks.map((task) => task.scriptName)).toEqual(['test', 'build', 'lint', 'diagnose']);
    expect(tasks.at(-1)).toMatchObject({
      args: ['run', 'diagnose', '--', '--json'],
      env: { FETCH_TRENDS_DB_PATH: '/tmp/fetch-trends-release.sqlite' },
      label: 'Diagnostics',
    });
  });

  it('allows release checks to warn when diagnostics are not implemented yet', () => {
    const packageJson: PackageJson = {
      scripts: {
        build: 'tsc -p tsconfig.json',
        lint: 'eslint .',
        test: 'vitest --run',
      },
    };

    expect(getReleaseCommandPlan(packageJson, '/tmp/fetch-trends-release.sqlite').map((task) => task.scriptName))
      .toEqual(['test', 'build', 'lint']);
  });

  it('keeps the example environment file value-free', async () => {
    const contents = await readFile(resolve(process.cwd(), 'config/example.env'), 'utf8');

    expect(validateExampleEnvContents(contents)).toEqual([]);
  });

  it('documents every package script in the command reference', async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), 'package.json'), 'utf8')) as PackageJson;
    const commandsDoc = await readFile(resolve(process.cwd(), 'docs/reference/commands.md'), 'utf8');

    expect(docsIncludeAllScripts(commandsDoc, packageJson)).toEqual([]);
  });

  it('keeps package bin paths tied to source entrypoints', async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), 'package.json'), 'utf8')) as PackageJson;
    const binEntries = packageJson.bin;
    expect(typeof binEntries).toBe('object');

    for (const binPath of Object.values(binEntries as Record<string, string>)) {
      const sourcePath = sourcePathForBinPath(binPath);
      expect(sourcePath).not.toBeNull();
      await expect(access(resolve(process.cwd(), sourcePath as string))).resolves.toBeUndefined();
    }
  });

  it('excludes generated local data from local package outputs', async () => {
    expect(shouldIncludePackagePath('results/example.csv')).toBe(false);
    expect(shouldIncludePackagePath('artifacts/ideas/1/payment-test.json')).toBe(false);
    expect(shouldIncludePackagePath('backups/fetch-trends.sqlite')).toBe(false);
    expect(shouldIncludePackagePath('exports/report.json')).toBe(false);
    expect(shouldIncludePackagePath('data/fetch-trends.sqlite')).toBe(false);
    expect(shouldIncludePackagePath('docs/report.resume.json')).toBe(false);
    expect(shouldIncludePackagePath('config/example.env')).toBe(true);

    const root = await mkdtemp(join(tmpdir(), 'fetch-trends-package-test-'));
    tempDirs.push(root);
    await createFakeProject(root);

    await buildLocalPackage({
      outDir: './dist-package/fetch-trends',
      projectRoot: root,
    });

    await expect(access(join(root, 'dist-package/fetch-trends/dist/src/cli.js'))).resolves.toBeUndefined();
    await expect(access(join(root, 'dist-package/fetch-trends/docs/reference/install.md'))).resolves.toBeUndefined();
    await expect(access(join(root, 'dist-package/fetch-trends/config/example.env'))).resolves.toBeUndefined();
    await expect(access(join(root, 'dist-package/fetch-trends/config/autocomplete-users.example.json'))).resolves.toBeUndefined();
    await expect(access(join(root, 'dist-package/fetch-trends/ecosystem.config.cjs'))).resolves.toBeUndefined();
    await expect(access(join(root, 'dist-package/fetch-trends/extension/manifest.json'))).resolves.toBeUndefined();
    await expect(access(join(root, 'dist-package/fetch-trends/docs/report.resume.json'))).rejects.toThrow();
    await expect(access(join(root, 'dist-package/fetch-trends/results/local.csv'))).rejects.toThrow();
  });
});

async function createFakeProject(root: string): Promise<void> {
  const files = new Map<string, string>([
    ['dist/src/cli.js', ''],
    ['package.json', '{"name":"fetch-trends"}\n'],
    ['package-lock.json', '{"packages":{"":{}}}\n'],
    ['README.md', '# Fetch Trends\n'],
    ['docs/reference/install.md', '# Install\n'],
    ['docs/report.resume.json', '{}\n'],
    ['.codex/skills/micro-business-autocomplete/SKILL.md', '# Skill\n'],
    ['prompts/final-report.md', 'Prompt\n'],
    ['config/collectors.json', '{}\n'],
    ['config/autocomplete-users.example.json', '{"users":[]}\n'],
    ['config/example.env', 'FETCH_TRENDS_DB_PATH=\n'],
    ['ecosystem.config.cjs', 'module.exports = { apps: [] };\n'],
    ['extension/manifest.json', '{"manifest_version":3}\n'],
    ['results/local.csv', 'query\n'],
    ['artifacts/ideas/1/payment-test.json', '{}\n'],
    ['backups/fetch-trends.sqlite', ''],
    ['exports/report.json', '{}\n'],
    ['data/fetch-trends.sqlite', ''],
  ]);

  for (const [path, contents] of files.entries()) {
    const filePath = join(root, path);
    await mkdir(resolve(filePath, '..'), { recursive: true });
    await writeFile(filePath, contents);
  }
}
