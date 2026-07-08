import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  REQUIRED_BACKLOG_GUIDE_HEADINGS,
  REQUIRED_BACKLOG_ITEM_HEADINGS,
  checkBacklog,
} from './backlog-support.js';
import { missingRequiredHeadings } from './roadmap-support.js';

describe('backlog support', () => {
  it('expects the guide headings used by the backlog prioritization guide', async () => {
    const guide = await readFile(resolve(process.cwd(), 'docs/governance/backlog-prioritization.md'), 'utf8');

    expect(missingRequiredHeadings(guide, REQUIRED_BACKLOG_GUIDE_HEADINGS)).toEqual([]);
  });

  it('expects the headings used by the backlog item template', async () => {
    const template = await readFile(resolve(process.cwd(), 'docs/governance/templates/backlog-item.md'), 'utf8');

    expect(missingRequiredHeadings(template, REQUIRED_BACKLOG_ITEM_HEADINGS)).toEqual([]);
  });

  it('passes a complete backlog fixture without live services', async () => {
    const root = await createBacklogFixture({
      backlogItem: buildDocument('Backlog Item', REQUIRED_BACKLOG_ITEM_HEADINGS),
      includeBacklogItem: true,
    });

    const result = await checkBacklog(root, { file: 'docs/backlog/example-item.md' });

    expect(result.errorCount).toBe(0);
    expect(result.missingCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });

  it('fails when a backlog item file is missing required headings', async () => {
    const root = await createBacklogFixture({
      backlogItem: '# Incomplete Backlog Item\n\n## Title\nContent.\n',
      includeBacklogItem: true,
    });

    const result = await checkBacklog(root, { file: 'docs/backlog/example-item.md' });

    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.message.includes('Problem'))).toBe(true);
  });
});

async function createBacklogFixture(options: {
  backlogItem: string;
  includeBacklogItem: boolean;
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'fetch-trends-backlog-'));
  const docsDir = join(root, 'docs');
  const backlogDir = join(docsDir, 'backlog');
  await mkdir(backlogDir, { recursive: true });

  await writeFile(join(docsDir, 'backlog-prioritization.md'), buildDocument('Backlog Prioritization', REQUIRED_BACKLOG_GUIDE_HEADINGS));
  await writeFile(join(docsDir, 'templates/backlog-item.md'), buildDocument('Backlog Item Template', REQUIRED_BACKLOG_ITEM_HEADINGS));

  if (options.includeBacklogItem) {
    await writeFile(join(backlogDir, 'example-item.md'), options.backlogItem);
  }

  return root;
}

function buildDocument(title: string, headings: readonly string[]): string {
  return [`# ${title}`, ...headings.map((heading) => `## ${heading}\nContent.`)].join('\n\n');
}
