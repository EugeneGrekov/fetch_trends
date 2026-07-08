import { access, constants, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { missingRequiredHeadings } from './roadmap-support.js';
import { DOCS } from './docs-paths.js';

export const REQUIRED_BACKLOG_GUIDE_HEADINGS = [
  'Purpose',
  'Writing A Backlog Item',
  'Scoring Model',
  'Priority Buckets',
  'Missing Evidence Handling',
  'Choosing The Next Phase',
  'Defer, Reject, And Revisit Rules',
  'From Backlog Item To Phase Plan',
  'Using The Checker',
] as const;

export const REQUIRED_BACKLOG_ITEM_HEADINGS = [
  'Title',
  'Problem',
  'Proposed Change',
  'Evidence Basis',
  'Expected User Value',
  'Expected Validation Impact',
  'Reliability Impact',
  'Implementation Cost',
  'Dependency Risk',
  'Reversibility',
  'Non-Goals',
  'Acceptance Criteria',
] as const;

export interface BacklogIssue {
  message: string;
  path?: string;
  severity: 'error' | 'warning';
}

export interface BacklogCheckResult {
  checkedFileCount: number;
  errorCount: number;
  issues: BacklogIssue[];
  missingCount: number;
  warningCount: number;
}

export interface BacklogCheckOptions {
  file?: string;
}

export async function checkBacklog(projectRoot: string, options: BacklogCheckOptions = {}): Promise<BacklogCheckResult> {
  const root = resolve(projectRoot);
  const issues: BacklogIssue[] = [];
  let checkedFileCount = 0;
  let missingCount = 0;

  checkedFileCount += await checkRequiredHeadings({
    displayName: 'Backlog prioritization guide',
    headings: REQUIRED_BACKLOG_GUIDE_HEADINGS,
    issues,
    path: DOCS.governance.backlogPrioritization,
    projectRoot: root,
  });

  checkedFileCount += await checkRequiredHeadings({
    displayName: 'Backlog item template',
    headings: REQUIRED_BACKLOG_ITEM_HEADINGS,
    issues,
    path: DOCS.governance.templates.backlogItem,
    projectRoot: root,
  });

  if (options.file) {
    checkedFileCount += await checkRequiredHeadings({
      displayName: 'Backlog item',
      headings: REQUIRED_BACKLOG_ITEM_HEADINGS,
      issues,
      path: options.file,
      projectRoot: root,
    });
  }

  for (const issue of issues) {
    if (issue.message.includes('is missing.')) {
      missingCount += 1;
    }
  }

  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;

  return {
    checkedFileCount,
    errorCount,
    issues,
    missingCount,
    warningCount,
  };
}

async function checkRequiredHeadings(args: {
  displayName: string;
  headings: readonly string[];
  issues: BacklogIssue[];
  path: string;
  projectRoot: string;
}): Promise<number> {
  const filePath = resolve(args.projectRoot, args.path);
  const contents = await readOptionalFile(filePath);
  if (!contents) {
    args.issues.push({
      message: `${args.displayName} is missing: ${args.path}.`,
      path: args.path,
      severity: 'error',
    });
    return 0;
  }

  const missing = missingRequiredHeadings(contents, args.headings);
  for (const heading of missing) {
    args.issues.push({
      message: `${args.displayName} is missing required heading "${heading}" in ${args.path}.`,
      path: args.path,
      severity: 'error',
    });
  }

  return 1;
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }

  return readFile(filePath, 'utf8');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
