import { describe, expect, it } from 'vitest';
import { buildPrompt, loadPromptTemplate } from './prompt-loader.js';

describe('AI prompt loading', () => {
  it('loads prompt templates from prompts/', async () => {
    const prompt = await loadPromptTemplate('idea_normalize');

    expect(prompt.fileName).toBe('idea-normalize.md');
    expect(prompt.template).toMatch(/Return JSON only/);
  });

  it('appends the JSON payload to the prompt', () => {
    const rendered = buildPrompt('Return JSON only.', { idea: 'parking app' });

    expect(rendered).toContain('Input JSON:');
    expect(rendered).toContain('"idea": "parking app"');
  });
});
