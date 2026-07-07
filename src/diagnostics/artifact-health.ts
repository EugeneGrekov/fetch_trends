import { access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { DiagnosticCheck, DiagnosticContext } from './types.js';
import { hasTable, inspectDatabaseFile, openReadonlyDatabase } from './sqlite.js';

interface DirectoryState {
  exists: boolean;
  isDirectory: boolean;
  errorMessage?: string;
}

interface ArtifactReference {
  path: string;
  source: string;
  type: 'ai' | 'autocomplete' | 'report';
}

interface ArtifactReferenceCollection {
  databaseAvailable: boolean;
  references: ArtifactReference[];
  resultReferences: ArtifactReference[];
}

interface ScannedFile {
  path: string;
  sizeBytes: number;
}

interface DirectoryScan {
  files: ScannedFile[];
  sizeBytes: number;
  truncated: boolean;
}

const MAX_SCAN_FILES = 5000;

export async function checkArtifactHealth(context: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const [artifactDir, resultsDir, references] = await Promise.all([
    directoryState(context.artifactsDir),
    directoryState(context.resultsDir),
    collectArtifactReferences(context),
  ]);

  const missingArtifactRefs = await missingReferences(references.references);
  const missingResultRefs = await missingReferences(references.resultReferences);
  const checks: DiagnosticCheck[] = [
    artifactDirectoryCheck(context, artifactDir, references.references.length),
    artifactReferenceCheck(references, missingArtifactRefs),
    resultReferenceCheck(references, missingResultRefs),
  ];

  if (artifactDir.exists && artifactDir.isDirectory) {
    try {
      const scan = await scanDirectory(context.artifactsDir);
      checks.push(orphanArtifactCheck(context, scan, references.references));
      checks.push(artifactSizeCheck(context, scan));
    } catch (error) {
      checks.push({
        id: 'artifacts.scan',
        label: 'Artifact directory scan',
        category: 'artifacts',
        status: 'warn',
        message: 'Artifact directory could not be scanned.',
        details: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        nextAction: 'Check artifact directory permissions before relying on orphan or size diagnostics.',
      });
    }
  } else {
    checks.push(skippedArtifactCheck('artifacts.orphans', 'Orphan artifacts', 'Orphan artifact checks skipped because the artifact directory is unavailable.'));
    checks.push(skippedArtifactCheck('artifacts.size', 'Artifact directory size', 'Artifact size checks skipped because the artifact directory is unavailable.'));
  }

  checks.push(await configuredDirectoryCheck({
    id: 'artifacts.backup_directory',
    label: 'Backup directory',
    path: context.backupDir,
    unconfiguredMessage: 'No backup directory is configured.',
  }));
  checks.push(await configuredDirectoryCheck({
    id: 'artifacts.export_directory',
    label: 'Export directory',
    path: context.exportDir,
    unconfiguredMessage: 'No export directory is configured.',
  }));

  return checks;
}

function artifactDirectoryCheck(
  context: DiagnosticContext,
  state: DirectoryState,
  referenceCount: number,
): DiagnosticCheck {
  if (state.exists && state.isDirectory) {
    return {
      id: 'artifacts.directory',
      label: 'Artifact directory',
      category: 'artifacts',
      status: 'pass',
      message: 'Artifact directory exists.',
      details: {
        path: context.artifactsDir,
      },
    };
  }

  return {
    id: 'artifacts.directory',
    label: 'Artifact directory',
    category: 'artifacts',
    status: referenceCount > 0 ? 'warn' : 'skip',
    message: state.exists
      ? 'Artifact path exists but is not a directory.'
      : 'Artifact directory does not exist.',
    details: {
      path: context.artifactsDir,
      errorMessage: state.errorMessage,
    },
    nextAction: referenceCount > 0 ? 'Create the artifact directory or regenerate missing artifacts.' : undefined,
  };
}

function artifactReferenceCheck(
  collection: ArtifactReferenceCollection,
  missing: ArtifactReference[],
): DiagnosticCheck {
  if (!collection.databaseAvailable) {
    return skippedArtifactCheck(
      'artifacts.report_references',
      'Artifact references',
      'Artifact reference checks skipped because the database is unavailable.',
    );
  }

  return {
    id: 'artifacts.report_references',
    label: 'Artifact references',
    category: 'artifacts',
    status: missing.length === 0 ? 'pass' : 'warn',
    message: missing.length === 0
      ? 'All known artifact references exist.'
      : `${missing.length} known artifact reference(s) are missing.`,
    details: {
      checked: collection.references.length,
      missing: missing.slice(0, 20),
    },
    nextAction: missing.length === 0 ? undefined : 'Regenerate the affected artifacts from the stored report or AI run.',
  };
}

function resultReferenceCheck(
  collection: ArtifactReferenceCollection,
  missing: ArtifactReference[],
): DiagnosticCheck {
  if (!collection.databaseAvailable) {
    return skippedArtifactCheck(
      'artifacts.result_references',
      'Result references',
      'Result reference checks skipped because the database is unavailable.',
    );
  }

  return {
    id: 'artifacts.result_references',
    label: 'Result references',
    category: 'artifacts',
    status: missing.length === 0 ? 'pass' : 'warn',
    message: missing.length === 0
      ? 'All known autocomplete result references exist.'
      : `${missing.length} autocomplete result reference(s) are missing.`,
    details: {
      checked: collection.resultReferences.length,
      missing: missing.slice(0, 20),
    },
    nextAction: missing.length === 0 ? undefined : 'Regenerate autocomplete result files or inspect the tool run input path.',
  };
}

function orphanArtifactCheck(
  context: DiagnosticContext,
  scan: DirectoryScan,
  references: ArtifactReference[],
): DiagnosticCheck {
  const known = new Set(references.map((reference) => normalizePath(context, reference.path)));
  const orphans = scan.files
    .filter((file) => !known.has(normalizePath(context, file.path)))
    .map((file) => file.path);

  return {
    id: 'artifacts.orphans',
    label: 'Orphan artifacts',
    category: 'artifacts',
    status: orphans.length === 0 ? 'pass' : 'warn',
    message: orphans.length === 0
      ? 'No orphan artifact files were found.'
      : `${orphans.length} artifact file(s) are not referenced by current diagnostics rules.`,
    details: {
      count: orphans.length,
      sample: orphans.slice(0, 20),
      truncated: scan.truncated,
    },
    nextAction: orphans.length === 0 ? undefined : 'Review orphan files manually before deleting anything.',
  };
}

function artifactSizeCheck(context: DiagnosticContext, scan: DirectoryScan): DiagnosticCheck {
  const oversized = scan.sizeBytes > context.largeArtifactBytes;
  return {
    id: 'artifacts.size',
    label: 'Artifact directory size',
    category: 'artifacts',
    status: oversized ? 'warn' : 'pass',
    message: oversized
      ? 'Artifact directory is larger than the local warning threshold.'
      : 'Artifact directory size is within the local warning threshold.',
    details: {
      fileCount: scan.files.length,
      sizeBytes: scan.sizeBytes,
      thresholdBytes: context.largeArtifactBytes,
      truncated: scan.truncated,
    },
    nextAction: oversized ? 'Archive or remove obsolete artifacts after confirming they are no longer needed.' : undefined,
  };
}

async function configuredDirectoryCheck(args: {
  id: string;
  label: string;
  path?: string;
  unconfiguredMessage: string;
}): Promise<DiagnosticCheck> {
  if (!args.path) {
    return skippedArtifactCheck(args.id, args.label, args.unconfiguredMessage);
  }

  const state = await directoryState(args.path);
  return {
    id: args.id,
    label: args.label,
    category: 'artifacts',
    status: state.exists && state.isDirectory ? 'pass' : 'warn',
    message: state.exists && state.isDirectory
      ? `${args.label} exists.`
      : `${args.label} is configured but unavailable.`,
    details: {
      path: args.path,
      errorMessage: state.errorMessage,
    },
    nextAction: state.exists && state.isDirectory ? undefined : `Create ${args.path} before relying on this directory.`,
  };
}

function skippedArtifactCheck(id: string, label: string, message: string): DiagnosticCheck {
  return {
    id,
    label,
    category: 'artifacts',
    status: 'skip',
    message,
  };
}

async function collectArtifactReferences(context: DiagnosticContext): Promise<ArtifactReferenceCollection> {
  const fileState = await inspectDatabaseFile(context.dbPath);
  if (!fileState.exists || !fileState.readable) {
    return {
      databaseAvailable: false,
      references: [],
      resultReferences: [],
    };
  }

  const db = openReadonlyDatabase(context.dbPath);
  try {
    const references: ArtifactReference[] = [];
    const resultReferences: ArtifactReference[] = [];

    if (hasTable(db, 'reports')) {
      references.push(...reportArtifactReferences(db, context, hasTable(db, 'experiment_decisions')));
    }

    if (hasTable(db, 'tool_runs')) {
      references.push(...aiArtifactReferences(db, context));
      resultReferences.push(...autocompleteResultReferences(db, context));
    }

    return {
      databaseAvailable: true,
      references,
      resultReferences,
    };
  } finally {
    db.close();
  }
}

function reportArtifactReferences(
  db: DatabaseSync,
  context: DiagnosticContext,
  hasExperimentDecisions: boolean,
): ArtifactReference[] {
  const sql = hasExperimentDecisions
    ? `
      SELECT
        reports.id,
        reports.idea_id,
        reports.report_type,
        experiment_decisions.experiment_id AS measurement_experiment_id
      FROM reports
      LEFT JOIN experiment_decisions ON experiment_decisions.report_id = reports.id
    `
    : `
      SELECT
        reports.id,
        reports.idea_id,
        reports.report_type,
        NULL AS measurement_experiment_id
      FROM reports
    `;
  const rows = db.prepare(sql).all() as Array<{
    id: number;
    idea_id: number;
    report_type: string;
    measurement_experiment_id: number | null;
  }>;

  const references: ArtifactReference[] = [];
  for (const row of rows) {
    references.push(...expectedReportArtifacts(context, row));
  }

  return references;
}

function expectedReportArtifacts(
  context: DiagnosticContext,
  row: { id: number; idea_id: number; report_type: string; measurement_experiment_id: number | null },
): ArtifactReference[] {
  const ideaDir = join(context.artifactsDir, 'ideas', String(row.idea_id));
  const source = `report:${row.id}:${row.report_type}`;

  if (row.report_type === 'payment_test_spec') {
    return [
      { path: join(ideaDir, 'payment-test.md'), source, type: 'report' },
      { path: join(ideaDir, 'payment-test.json'), source, type: 'report' },
    ];
  }

  if (row.report_type === 'seo_plan') {
    return [
      { path: join(ideaDir, 'seo-plan.md'), source, type: 'report' },
      { path: join(ideaDir, 'seo-plan.json'), source, type: 'report' },
    ];
  }

  if (row.report_type === 'decision_memo') {
    return [
      { path: join(ideaDir, `decision-memo-${row.id}.md`), source, type: 'report' },
      { path: join(ideaDir, `decision-memo-${row.id}.json`), source, type: 'report' },
    ];
  }

  if (row.report_type === 'measurement_report' && row.measurement_experiment_id != null) {
    return [
      { path: join(ideaDir, `measurement-experiment-${row.measurement_experiment_id}.md`), source, type: 'report' },
      { path: join(ideaDir, `measurement-experiment-${row.measurement_experiment_id}.json`), source, type: 'report' },
    ];
  }

  return [];
}

function aiArtifactReferences(db: DatabaseSync, context: DiagnosticContext): ArtifactReference[] {
  const rows = db.prepare(`
    SELECT id, metadata_json
    FROM tool_runs
    WHERE metadata_json IS NOT NULL
      AND tool_name LIKE 'ai.%'
  `).all() as Array<{ id: number; metadata_json: string | null }>;
  const references: ArtifactReference[] = [];

  for (const row of rows) {
    const metadata = parseJsonObject(row.metadata_json);
    if (!metadata) {
      continue;
    }

    for (const path of extractPathValues(metadata)) {
      references.push({
        path: normalizePath(context, path),
        source: `tool_run:${row.id}:metadata`,
        type: 'ai',
      });
    }
  }

  return references;
}

function autocompleteResultReferences(db: DatabaseSync, context: DiagnosticContext): ArtifactReference[] {
  const rows = db.prepare(`
    SELECT id, input_json
    FROM tool_runs
    WHERE tool_name = 'autocomplete'
      AND input_json IS NOT NULL
  `).all() as Array<{ id: number; input_json: string }>;
  const references: ArtifactReference[] = [];

  for (const row of rows) {
    const input = parseJsonObject(row.input_json);
    if (!input || typeof input.out !== 'string') {
      continue;
    }

    const csvPath = normalizePath(context, input.out);
    references.push({
      path: csvPath,
      source: `tool_run:${row.id}:input.out`,
      type: 'autocomplete',
    });
    references.push({
      path: replaceExtension(csvPath, '.json'),
      source: `tool_run:${row.id}:input.out`,
      type: 'autocomplete',
    });
    references.push({
      path: replaceExtension(csvPath, '.summary.csv'),
      source: `tool_run:${row.id}:input.out`,
      type: 'autocomplete',
    });
    references.push({
      path: replaceExtension(csvPath, '.summary.json'),
      source: `tool_run:${row.id}:input.out`,
      type: 'autocomplete',
    });
  }

  return references;
}

function extractPathValues(value: unknown): string[] {
  const paths: string[] = [];

  if (!value || typeof value !== 'object') {
    return paths;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested === 'string' && key.toLowerCase().endsWith('path')) {
      paths.push(nested);
    } else if (nested && typeof nested === 'object') {
      paths.push(...extractPathValues(nested));
    }
  }

  return paths;
}

async function missingReferences(references: ArtifactReference[]): Promise<ArtifactReference[]> {
  const missing: ArtifactReference[] = [];
  for (const reference of references) {
    try {
      await access(reference.path, constants.F_OK);
    } catch {
      missing.push(reference);
    }
  }

  return missing;
}

async function directoryState(path: string): Promise<DirectoryState> {
  try {
    const value = await stat(path);
    return {
      exists: true,
      isDirectory: value.isDirectory(),
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      exists: code !== 'ENOENT' && code !== 'ENOTDIR',
      isDirectory: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function scanDirectory(root: string): Promise<DirectoryScan> {
  const files: ScannedFile[] = [];
  let sizeBytes = 0;
  let truncated = false;

  async function walk(dir: string): Promise<void> {
    if (files.length >= MAX_SCAN_FILES) {
      truncated = true;
      return;
    }

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        const file = await stat(path);
        files.push({ path, sizeBytes: file.size });
        sizeBytes += file.size;
      }

      if (files.length >= MAX_SCAN_FILES) {
        truncated = true;
        return;
      }
    }
  }

  await walk(root);
  return {
    files,
    sizeBytes,
    truncated,
  };
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function replaceExtension(path: string, extension: string): string {
  return path.replace(/\.[^/.]+$/, extension);
}

function normalizePath(context: DiagnosticContext, path: string): string {
  return isAbsolute(path) ? path : resolve(context.cwd, path);
}
