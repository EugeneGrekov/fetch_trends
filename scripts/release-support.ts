import { access, constants } from 'node:fs/promises';
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

export interface PackageJson {
  bin?: Record<string, string> | string;
  name?: string;
  scripts?: Record<string, string>;
  version?: string;
}

export interface PackageLockJson {
  packages?: {
    ''?: {
      bin?: Record<string, string> | string;
    };
  };
}

export interface ReleaseCommandTask {
  args: string[];
  env?: Record<string, string>;
  label: string;
  scriptName: string;
}

export interface ReleaseVerificationResult {
  detail?: string;
  label: string;
}

export interface LocalPackageEntry {
  required: boolean;
  source: string;
}

export const REQUIRED_PACKAGE_SCRIPTS = [
  'autocomplete',
  'db',
  'build',
  'decide',
  'lint',
  'measurement',
  'package:local',
  'payment-test',
  'release:check',
  'report',
  'seo-plan',
  'test',
  'validate',
  'web',
  'worker',
] as const;

export const REQUIRED_RELEASE_DOCS = [
  'README.md',
  'docs/architecture.md',
  'docs/commands.md',
  'docs/install.md',
  'docs/release-checklist.md',
  'docs/release-packaging-plan.md',
] as const;

export const REQUIRED_PROJECT_SKILLS = [
  '.codex/skills/micro-business-autocomplete/SKILL.md',
  '.codex/skills/micro-business-report/SKILL.md',
  '.codex/skills/micro-business-validate/SKILL.md',
] as const;

export const LOCAL_PACKAGE_ENTRIES: LocalPackageEntry[] = [
  { source: 'dist', required: true },
  { source: 'package.json', required: true },
  { source: 'package-lock.json', required: true },
  { source: 'README.md', required: true },
  { source: 'docs', required: true },
  { source: '.codex/skills', required: true },
  { source: 'prompts', required: true },
  { source: 'config/collectors.json', required: true },
  { source: 'config/example.env', required: true },
];

const GENERATED_PATH_SEGMENTS = new Set([
  '.git',
  'artifacts',
  'backups',
  'dist-package',
  'exports',
  'node_modules',
  'results',
  'runs',
  'tmp',
]);

const GENERATED_FILE_PATTERNS = [
  /\.env(?:\..*)?$/,
  /\.sqlite(?:-.+)?$/,
  /\.resume\.json$/,
  /\.db(?:-.+)?$/,
  /\.log$/,
];

export async function readPackageJson(projectRoot: string): Promise<PackageJson> {
  return JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8')) as PackageJson;
}

export async function readPackageLock(projectRoot: string): Promise<PackageLockJson | null> {
  const lockPath = resolve(projectRoot, 'package-lock.json');
  if (!(await pathExists(lockPath))) {
    return null;
  }

  return JSON.parse(await readFile(lockPath, 'utf8')) as PackageLockJson;
}

export function getReleaseCommandPlan(
  packageJson: PackageJson,
  tempDbPath: string,
): ReleaseCommandTask[] {
  const scripts = packageJson.scripts ?? {};
  const tasks: ReleaseCommandTask[] = [
    { args: ['run', 'test'], label: 'Tests', scriptName: 'test' },
    { args: ['run', 'build'], label: 'Build', scriptName: 'build' },
    { args: ['run', 'lint'], label: 'Lint', scriptName: 'lint' },
  ];

  if (scripts.diagnose) {
    tasks.push({
      args: ['run', 'diagnose', '--', '--json'],
      env: { FETCH_TRENDS_DB_PATH: tempDbPath },
      label: 'Diagnostics',
      scriptName: 'diagnose',
    });
  }

  return tasks;
}

export function missingRequiredScripts(packageJson: PackageJson): string[] {
  const scripts = packageJson.scripts ?? {};
  return REQUIRED_PACKAGE_SCRIPTS.filter((scriptName) => !scripts[scriptName]);
}

export function validateExampleEnvContents(contents: string): string[] {
  const errors: string[] = [];
  const names = new Set<string>();

  contents.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      errors.push(`Line ${index + 1} must use KEY= format.`);
      return;
    }

    const name = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    if (value !== '') {
      errors.push(`Line ${index + 1} (${name}) must not include a value.`);
    }
    if (names.has(name)) {
      errors.push(`Line ${index + 1} duplicates ${name}.`);
    }
    names.add(name);
  });

  return errors;
}

export function normalizePackagePath(path: string): string {
  return path.split(/[\\/]+/).filter(Boolean).join('/');
}

export function isGeneratedLocalPath(path: string): boolean {
  const normalized = normalizePackagePath(path);
  if (!normalized) {
    return false;
  }

  if (normalized === 'config/example.env') {
    return false;
  }

  const parts = normalized.split('/');
  if (parts.some((part) => GENERATED_PATH_SEGMENTS.has(part))) {
    return true;
  }

  const fileName = parts.at(-1) ?? '';
  return GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

export function shouldIncludePackagePath(path: string): boolean {
  return !isGeneratedLocalPath(path);
}

export function getBinEntries(packageJson: PackageJson): Record<string, string> {
  if (!packageJson.bin) {
    return {};
  }

  if (typeof packageJson.bin === 'string') {
    return packageJson.name ? { [packageJson.name]: packageJson.bin } : {};
  }

  return packageJson.bin;
}

export function sourcePathForBinPath(binPath: string): string | null {
  const normalized = normalizePackagePath(binPath).replace(/^\.\//, '');
  if (!normalized.startsWith('dist/') || !normalized.endsWith('.js')) {
    return null;
  }

  return `${normalized.slice('dist/'.length, -'.js'.length)}.ts`;
}

export function docsIncludeAllScripts(commandsDoc: string, packageJson: PackageJson): string[] {
  return Object.keys(packageJson.scripts ?? {})
    .sort()
    .filter((scriptName) => !commandsDoc.includes(`npm run ${scriptName}`));
}

export async function collectReleaseVerificationFailures(projectRoot: string): Promise<string[]> {
  const failures: string[] = [];
  const packageJson = await readPackageJson(projectRoot);
  const packageLock = await readPackageLock(projectRoot);

  failures.push(
    ...missingRequiredScripts(packageJson).map((scriptName) => `package.json is missing npm script "${scriptName}".`),
  );

  for (const docPath of REQUIRED_RELEASE_DOCS) {
    if (!(await pathExists(resolve(projectRoot, docPath)))) {
      failures.push(`Required release document is missing: ${docPath}.`);
    }
  }

  const commandsDocPath = resolve(projectRoot, 'docs/commands.md');
  if (await pathExists(commandsDocPath)) {
    const commandsDoc = await readFile(commandsDocPath, 'utf8');
    failures.push(
      ...docsIncludeAllScripts(commandsDoc, packageJson).map(
        (scriptName) => `docs/commands.md does not document npm run ${scriptName}.`,
      ),
    );
  }

  const envPath = resolve(projectRoot, 'config/example.env');
  if (await pathExists(envPath)) {
    failures.push(...validateExampleEnvContents(await readFile(envPath, 'utf8')));
  }

  for (const skillPath of REQUIRED_PROJECT_SKILLS) {
    if (!(await pathExists(resolve(projectRoot, skillPath)))) {
      failures.push(`Required local Codex skill is missing: ${skillPath}.`);
    }
  }

  for (const entry of LOCAL_PACKAGE_ENTRIES) {
    if (entry.required && !(await pathExists(resolve(projectRoot, entry.source)))) {
      failures.push(`Required package entry is missing: ${entry.source}.`);
    }
    if (isGeneratedLocalPath(entry.source)) {
      failures.push(`Package entry must not include generated/local data: ${entry.source}.`);
    }
  }

  const binEntries = getBinEntries(packageJson);
  if (Object.keys(binEntries).length === 0) {
    failures.push('package.json must expose at least one bin entry.');
  }

  for (const [binName, rawBinPath] of Object.entries(binEntries)) {
    const binPath = normalizePackagePath(rawBinPath);
    if (!(await pathExists(resolve(projectRoot, binPath)))) {
      failures.push(`Bin path for ${binName} is missing after build: ${binPath}.`);
    }

    const sourcePath = sourcePathForBinPath(binPath);
    if (!sourcePath) {
      failures.push(`Bin path for ${binName} must point at a dist/*.js file: ${binPath}.`);
      continue;
    }

    if (!(await pathExists(resolve(projectRoot, sourcePath)))) {
      failures.push(`Bin path for ${binName} has no source counterpart: ${sourcePath}.`);
    }
  }

  if (packageLock?.packages?.['']?.bin) {
    const lockBin = getBinEntries({ bin: packageLock.packages[''].bin, name: packageJson.name });
    const manifestBinJson = JSON.stringify(sortRecord(normalizeBinRecord(binEntries)));
    const lockBinJson = JSON.stringify(sortRecord(normalizeBinRecord(lockBin)));
    if (manifestBinJson !== lockBinJson) {
      failures.push('package-lock.json root bin entries do not match package.json.');
    }
  }

  return failures;
}

export async function buildLocalPackage(options: {
  outDir: string;
  projectRoot: string;
}): Promise<ReleaseVerificationResult[]> {
  const projectRoot = resolve(options.projectRoot);
  const outDir = resolve(projectRoot, options.outDir);

  if (outDir === projectRoot) {
    throw new Error('Refusing to package into the project root.');
  }
  if (!isPathInside(projectRoot, outDir)) {
    throw new Error('Refusing to package outside the project root.');
  }

  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });

  const copied: ReleaseVerificationResult[] = [];
  for (const entry of LOCAL_PACKAGE_ENTRIES) {
    const sourcePath = resolve(projectRoot, entry.source);
    if (!(await pathExists(sourcePath))) {
      if (entry.required) {
        throw new Error(`Required package entry is missing: ${entry.source}`);
      }
      continue;
    }

    await copyPackagePath(projectRoot, sourcePath, resolve(outDir, entry.source));
    copied.push({ label: entry.source });
  }

  return copied;
}

async function copyPackagePath(projectRoot: string, sourcePath: string, destinationPath: string): Promise<void> {
  const relativePath = normalizePackagePath(relative(projectRoot, sourcePath));
  if (!shouldIncludePackagePath(relativePath)) {
    return;
  }

  const entries = await readdir(sourcePath, { withFileTypes: true }).catch(async (error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') {
      throw error;
    }

    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, { force: true });
    return null;
  });

  if (!entries) {
    return;
  }

  await mkdir(destinationPath, { recursive: true });
  for (const entry of entries) {
    const childSource = resolve(sourcePath, entry.name);
    const childDestination = resolve(destinationPath, entry.name);
    await copyPackagePath(projectRoot, childSource, childDestination);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !relativePath.split(sep).includes('..');
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeBinRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([name, path]) => [name, normalizePackagePath(path).replace(/^\.\//, '')]),
  );
}
