import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AiTaskName } from './types.js';

const TASK_PROMPTS: Record<AiTaskName, string> = {
  idea_normalize: 'idea-normalize.md',
  query_generate: 'query-generate.md',
  evidence_summarize: 'evidence-summarize.md',
  score_explain: 'score-explain.md',
  final_report: 'final-report.md',
};

export async function loadPromptTemplate(task: AiTaskName): Promise<{ fileName: string; template: string }> {
  const fileName = TASK_PROMPTS[task];
  const promptPath = await resolvePromptPath(fileName);
  const template = await readFile(promptPath, 'utf8');

  return { fileName, template };
}

export function buildPrompt(template: string, input: unknown): string {
  return [
    template.trim(),
    '',
    'Input JSON:',
    '```json',
    JSON.stringify(input, null, 2),
    '```',
  ].join('\n');
}

async function resolvePromptPath(fileName: string): Promise<string> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, '../../prompts', fileName),
    resolve(moduleDir, '../../../prompts', fileName),
    resolve(process.cwd(), 'prompts', fileName),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`Prompt template ${fileName} was not found in prompts/.`);
}
