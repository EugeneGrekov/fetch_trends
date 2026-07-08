import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  REQUIRED_IMPLEMENTATION_NOTE_HEADINGS,
  REQUIRED_PLAN_HEADINGS,
  checkRoadmap,
  expectedImplementationNotePath,
  extractDeclaredNextMissingDocument,
  missingRequiredHeadings,
  parseImplementationOrder,
} from './roadmap-support.js';

describe('roadmap governance support', () => {
  it('keeps the phase template aligned with required plan headings', async () => {
    const template = await readFile(resolve(process.cwd(), 'docs/governance/templates/phase.md'), 'utf8');

    expect(missingRequiredHeadings(template, REQUIRED_PLAN_HEADINGS)).toEqual([]);
  });

  it('keeps the implementation note template aligned with required note headings', async () => {
    const template = await readFile(resolve(process.cwd(), 'docs/governance/templates/implementation-note.md'), 'utf8');

    expect(missingRequiredHeadings(template, REQUIRED_IMPLEMENTATION_NOTE_HEADINGS)).toEqual([]);
  });

  it('parses implementation-order rows and expected implementation notes', () => {
    const phases = parseImplementationOrder(`
| Order | Phase | Plan Document | Purpose | Status |
|---:|---|---|---|---|
| 17 | Roadmap governance | \`docs/features/roadmap-governance/plan.md\` | Govern the roadmap. | \`verified\` |
`);

    expect(phases).toEqual([
      {
        order: 17,
        phase: 'Roadmap governance',
        planDocuments: ['docs/features/roadmap-governance/plan.md'],
        status: 'verified',
        statuses: ['verified'],
      },
    ]);
    expect(expectedImplementationNotePath(phases[0])).toBe('docs/features/roadmap-governance/implementation.md');
  });

  it('treats no active missing document as no declared next missing document', () => {
    expect(
      extractDeclaredNextMissingDocument(`
## Next Missing Document

No active phase is missing its required plan document.

The next proposed phase is:

\`\`\`text
docs/features/backlog-prioritization/plan.md
\`\`\`
`),
    ).toBeNull();
  });

  it('passes a complete governed roadmap fixture without live services', async () => {
    const root = await createRoadmapFixture({
      implementationOrder: `
# Implementation Order

## Next Missing Document

No active phase is missing its required plan document.

| Order | Phase | Plan Document | Purpose | Status |
|---:|---|---|---|---|
| 17 | Roadmap governance | \`docs/features/roadmap-governance/plan.md\` | Govern the roadmap. | \`verified\` |
| 18 | Backlog prioritization | \`docs/features/backlog-prioritization/plan.md\` | Rank candidate work. | \`proposed\` |
`,
      includeImplementationNote: true,
    });

    const result = await checkRoadmap(root);

    expect(result.errorCount).toBe(0);
    expect(result.missingCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it('fails implemented phases without implementation notes', async () => {
    const root = await createRoadmapFixture({
      implementationOrder: `
# Implementation Order

## Next Missing Document

No active phase is missing its required plan document.

| Order | Phase | Plan Document | Purpose | Status |
|---:|---|---|---|---|
| 17 | Roadmap governance | \`docs/features/roadmap-governance/plan.md\` | Govern the roadmap. | \`implemented\` |
`,
      includeImplementationNote: false,
    });

    const result = await checkRoadmap(root);

    expect(result.errorCount).toBe(1);
    expect(result.issues[0]).toMatchObject({
      path: 'docs/features/roadmap-governance/implementation.md',
      severity: 'error',
    });
  });

  it('warns when a phase has an implementation note but a pre-implementation status', async () => {
    const root = await createRoadmapFixture({
      implementationOrder: `
# Implementation Order

## Next Missing Document

No active phase is missing its required plan document.

| Order | Phase | Plan Document | Purpose | Status |
|---:|---|---|---|---|
| 17 | Roadmap governance | \`docs/features/roadmap-governance/plan.md\` | Govern the roadmap. | \`delegated\` |
`,
      includeImplementationNote: true,
    });

    const result = await checkRoadmap(root);

    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(1);
    expect(result.issues[0]?.message).toContain('does not reflect implemented work');
  });
});

async function createRoadmapFixture(options: {
  implementationOrder: string;
  includeImplementationNote: boolean;
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'fetch-trends-roadmap-'));
  const docsDir = join(root, 'docs');
  await mkdir(docsDir, { recursive: true });

  await mkdir(join(docsDir, 'features', 'roadmap-governance'), { recursive: true });
  await mkdir(join(docsDir, 'governance', 'templates'), { recursive: true });
  await writeFile(join(docsDir, 'governance', 'implementation-order.md'), options.implementationOrder);
  await writeFile(join(docsDir, 'governance', 'roadmap-governance.md'), '# Roadmap Governance\n');
  await writeFile(join(docsDir, 'governance', 'templates', 'phase.md'), buildDocument('Phase Template', REQUIRED_PLAN_HEADINGS));
  await writeFile(
    join(docsDir, 'governance', 'templates', 'implementation-note.md'),
    buildDocument('Implementation Note Template', REQUIRED_IMPLEMENTATION_NOTE_HEADINGS),
  );
  await writeFile(
    join(docsDir, 'features', 'roadmap-governance', 'plan.md'),
    buildDocument('Roadmap Governance Plan', REQUIRED_PLAN_HEADINGS),
  );

  if (options.includeImplementationNote) {
    await writeFile(
      join(docsDir, 'features', 'roadmap-governance', 'implementation.md'),
      buildDocument('Roadmap Governance Implementation', REQUIRED_IMPLEMENTATION_NOTE_HEADINGS),
    );
  }

  return root;
}

function buildDocument(title: string, headings: readonly string[]): string {
  return [`# ${title}`, ...headings.map((heading) => `## ${heading}\nContent.`)].join('\n\n');
}
