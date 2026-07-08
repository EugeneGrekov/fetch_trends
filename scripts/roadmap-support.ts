import { access, constants, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const REQUIRED_PLAN_HEADINGS = [
  'Goal',
  'Prerequisite',
  'Non-Goals',
  'Target Structure',
  'Implementation Steps',
  'Data / API / CLI Contracts',
  'Testing Plan',
  'Verification',
  'Acceptance Criteria',
  'Risks',
  'Recommended Next Phase',
] as const;

export const REQUIRED_IMPLEMENTATION_NOTE_HEADINGS = [
  'Summary',
  'Files Changed',
  'Commands Added or Changed',
  'Schema/Migration Changes',
  'Tests Added or Updated',
  'Verification Results',
  'Known Limitations',
  'Follow-Up Work',
  'Plan Deviations',
] as const;

export const ALLOWED_PHASE_STATUSES = [
  'proposed',
  'planned',
  'delegated',
  'in_progress',
  'implemented',
  'verified',
  'deferred',
  'retired',
  'superseded',
  'blocked',
] as const;

const STRICT_GOVERNANCE_ORDER = 17;
const ALLOWED_PHASE_STATUS_SET = new Set<string>(ALLOWED_PHASE_STATUSES);
const IMPLEMENTATION_NOTE_STATUSES = new Set(['implemented', 'verified']);
const MISSING_PLAN_ALLOWED_STATUSES = new Set(['proposed', 'deferred', 'retired', 'superseded']);
const REQUIRED_GOVERNANCE_DOCS = [
  'docs/governance/roadmap-governance.md',
  'docs/governance/templates/phase.md',
  'docs/governance/templates/implementation-note.md',
  'docs/governance/implementation-order.md',
] as const;

export interface RoadmapPhase {
  order: number;
  phase: string;
  planDocuments: string[];
  status: string;
  statuses: string[];
}

export interface RoadmapIssue {
  message: string;
  path?: string;
  severity: 'error' | 'warning';
}

export interface RoadmapCheckResult {
  errorCount: number;
  implementationNoteCount: number;
  issues: RoadmapIssue[];
  missingCount: number;
  phases: RoadmapPhase[];
  planCount: number;
  warningCount: number;
}

export async function checkRoadmap(projectRoot: string): Promise<RoadmapCheckResult> {
  const root = resolve(projectRoot);
  const issues: RoadmapIssue[] = [];
  const implementationNotesSeen = new Set<string>();
  const planDocumentsSeen = new Set<string>();
  let missingCount = 0;

  for (const docPath of REQUIRED_GOVERNANCE_DOCS) {
    if (!(await pathExists(resolve(root, docPath)))) {
      issues.push({
        message: `Required governance document is missing: ${docPath}.`,
        path: docPath,
        severity: 'error',
      });
      missingCount += 1;
    }
  }

  await checkRequiredHeadings({
    headings: REQUIRED_PLAN_HEADINGS,
    issues,
    path: 'docs/governance/templates/phase.md',
    projectRoot: root,
    severity: 'error',
  });
  await checkRequiredHeadings({
    headings: REQUIRED_IMPLEMENTATION_NOTE_HEADINGS,
    issues,
    path: 'docs/governance/templates/implementation-note.md',
    projectRoot: root,
    severity: 'error',
  });

  const implementationOrderPath = resolve(root, 'docs/governance/implementation-order.md');
  const implementationOrder = await readOptionalFile(implementationOrderPath);
  const phases = implementationOrder ? parseImplementationOrder(implementationOrder) : [];

  if (!implementationOrder) {
    issues.push({
      message: 'docs/governance/implementation-order.md could not be read.',
      path: 'docs/governance/implementation-order.md',
      severity: 'error',
    });
  }

  const missingActivePlanDocuments: string[] = [];

  for (const phase of phases) {
    if (phase.statuses.length !== 1 || !ALLOWED_PHASE_STATUS_SET.has(phase.statuses[0] ?? '')) {
      issues.push({
        message: `Phase "${phase.phase}" uses invalid status "${phase.status}".`,
        path: 'docs/governance/implementation-order.md',
        severity: 'error',
      });
    }

    for (const planDocument of phase.planDocuments) {
      const absolutePlanPath = resolve(root, planDocument);
      const exists = await pathExists(absolutePlanPath);
      if (!exists) {
        if (allowsMissingPlan(phase.statuses)) {
          continue;
        }

        issues.push({
          message: `Phase "${phase.phase}" references missing plan document: ${planDocument}.`,
          path: planDocument,
          severity: 'error',
        });
        missingCount += 1;
        missingActivePlanDocuments.push(planDocument);
        continue;
      }

      if (phase.order >= STRICT_GOVERNANCE_ORDER && planDocument.endsWith('-plan.md')) {
        await checkRequiredHeadings({
          headings: REQUIRED_PLAN_HEADINGS,
          issues,
          path: planDocument,
          projectRoot: root,
          severity: 'error',
        });
      }

      if (!allowsMissingPlan(phase.statuses) && planDocument.endsWith('-plan.md')) {
        planDocumentsSeen.add(planDocument);
      }
    }

    if (requiresImplementationNote(phase)) {
      const implementationNote = expectedImplementationNotePath(phase);
      if (!implementationNote) {
        continue;
      }

      if (!(await pathExists(resolve(root, implementationNote)))) {
        issues.push({
          message: `Implemented phase "${phase.phase}" is missing implementation note: ${implementationNote}.`,
          path: implementationNote,
          severity: 'error',
        });
        missingCount += 1;
        continue;
      }

      implementationNotesSeen.add(implementationNote);

      if (phase.order >= STRICT_GOVERNANCE_ORDER) {
        await checkRequiredHeadings({
          headings: REQUIRED_IMPLEMENTATION_NOTE_HEADINGS,
          issues,
          path: implementationNote,
          projectRoot: root,
          severity: 'error',
        });
      }
    } else {
      const implementationNote = expectedImplementationNotePath(phase);
      if (implementationNote && (await pathExists(resolve(root, implementationNote)))) {
        issues.push({
          message: `Phase "${phase.phase}" has implementation note ${implementationNote} but status "${phase.status}" does not reflect implemented work.`,
          path: 'docs/governance/implementation-order.md',
          severity: 'warning',
        });
      }
    }
  }

  if (implementationOrder) {
    const declaredNextMissing = extractDeclaredNextMissingDocument(implementationOrder);
    const expectedNextMissing = missingActivePlanDocuments[0] ?? null;
    if (expectedNextMissing && declaredNextMissing !== expectedNextMissing) {
      issues.push({
        message: `Next missing document should be ${expectedNextMissing}, but implementation-order records ${declaredNextMissing ?? 'none'}.`,
        path: 'docs/governance/implementation-order.md',
        severity: 'warning',
      });
    }
    if (!expectedNextMissing && declaredNextMissing) {
      issues.push({
        message: `Next missing document records ${declaredNextMissing}, but no active phase is missing a plan document.`,
        path: 'docs/governance/implementation-order.md',
        severity: 'warning',
      });
    }
  }

  const planCount = planDocumentsSeen.size;
  const implementationNoteCount = implementationNotesSeen.size;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;

  return {
    errorCount,
    implementationNoteCount,
    issues,
    missingCount,
    phases,
    planCount,
    warningCount,
  };
}

export function missingRequiredHeadings(markdown: string, requiredHeadings: readonly string[]): string[] {
  const headings = new Set(
    Array.from(markdown.matchAll(/^##\s+(.+)$/gm), (match) => normalizeHeading(match[1] ?? '')),
  );

  return requiredHeadings.filter((heading) => !headings.has(normalizeHeading(heading)));
}

export function parseImplementationOrder(markdown: string): RoadmapPhase[] {
  return markdown
    .split(/\r?\n/)
    .map(parseImplementationOrderRow)
    .filter((phase): phase is RoadmapPhase => Boolean(phase));
}

export function expectedImplementationNotePath(phase: RoadmapPhase): string | null {
  if (phase.planDocuments.length !== 1) {
    return null;
  }

  const planDocument = phase.planDocuments[0] ?? '';
  if (!planDocument.endsWith('-plan.md')) {
    return null;
  }

  return planDocument.replace(/-plan\.md$/, '-implementation.md');
}

export function extractDeclaredNextMissingDocument(markdown: string): string | null {
  const sectionStart = markdown.indexOf('## Next Missing Document');
  if (sectionStart === -1) {
    return null;
  }

  const section = markdown.slice(sectionStart).split(/\n##\s+/)[0] ?? '';
  if (/No active phase is missing/i.test(section)) {
    return null;
  }

  return section.match(/docs\/[^\s`]+/)?.[0] ?? null;
}

function parseImplementationOrderRow(line: string): RoadmapPhase | null {
  const cells = parseMarkdownTableCells(line);
  if (cells.length < 5) {
    return null;
  }

  const order = Number(cells[0]);
  if (!Number.isInteger(order)) {
    return null;
  }

  const status = stripInlineCode(cells[4] ?? '');

  return {
    order,
    phase: cells[1] ?? '',
    planDocuments: Array.from((cells[2] ?? '').matchAll(/`([^`]+)`/g), (match) => match[1] ?? ''),
    status,
    statuses: [normalizeStatus(status)].filter(Boolean),
  };
}

function parseMarkdownTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) {
    return [];
  }

  const withoutLeading = trimmed.slice(1);
  const withoutOuterPipes = withoutLeading.endsWith('|') ? withoutLeading.slice(0, -1) : withoutLeading;
  return withoutOuterPipes.split('|').map((cell) => cell.trim());
}

function normalizeStatus(status: string): string {
  return stripInlineCode(status).toLowerCase().replace(/[\s-]+/g, '_');
}

function stripInlineCode(value: string): string {
  return value.replace(/^`|`$/g, '').trim();
}

function normalizeHeading(heading: string): string {
  return heading.trim().replace(/\s+/g, ' ');
}

function requiresImplementationNote(phase: RoadmapPhase): boolean {
  return phase.statuses.some((status) => IMPLEMENTATION_NOTE_STATUSES.has(status));
}

function allowsMissingPlan(statuses: string[]): boolean {
  return statuses.some((status) => MISSING_PLAN_ALLOWED_STATUSES.has(status));
}

async function checkRequiredHeadings(args: {
  headings: readonly string[];
  issues: RoadmapIssue[];
  path: string;
  projectRoot: string;
  severity: 'error' | 'warning';
}): Promise<void> {
  const filePath = resolve(args.projectRoot, args.path);
  const contents = await readOptionalFile(filePath);
  if (!contents) {
    return;
  }

  const missing = missingRequiredHeadings(contents, args.headings);
  if (missing.length === 0) {
    return;
  }

  args.issues.push({
    message: `${args.path} is missing required heading(s): ${missing.join(', ')}.`,
    path: args.path,
    severity: args.severity,
  });
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
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
