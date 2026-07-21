import { beforeAll, describe, expect, it } from 'vitest';

interface SharedProtocol {
  AUTOCOMPLETE_INSTRUCTION: string;
  CORRECTION_INSTRUCTION: string;
  classifyCodeBlock(text: string):
    | { kind: 'none' }
    | { kind: 'malformed'; reason: string }
    | { kind: 'valid'; request: { type: string; seeds: string[]; modifiers?: string[] } };
  classifyCodeBlocks(texts: string[]): ReturnType<SharedProtocol['classifyCodeBlock']>;
}

let shared: SharedProtocol;

beforeAll(async () => {
  await import('../../extension/shared.js');
  shared = (globalThis as typeof globalThis & { AutocompleteBridgeShared: SharedProtocol })
    .AutocompleteBridgeShared;
});

describe('extension autocomplete request detection', () => {
  it('accepts the exact data-only request shape', () => {
    expect(shared.classifyCodeBlock(JSON.stringify({
      type: 'autocomplete_check',
      seeds: [' AI   app builder ', 'business research'],
      modifiers: ['for', 'with'],
    }))).toEqual({
      kind: 'valid',
      request: {
        type: 'autocomplete_check',
        seeds: ['AI app builder', 'business research'],
        modifiers: ['for', 'with'],
      },
    });
  });

  it('uses only the first recognizable request block', () => {
    const result = shared.classifyCodeBlocks([
      '{"type":"autocomplete_check","seeds":',
      '{"type":"autocomplete_check","seeds":["later valid block"]}',
    ]);

    expect(result.kind).toBe('malformed');
  });

  it('ignores unrelated JSON and rejects extra request fields', () => {
    expect(shared.classifyCodeBlock('{"type":"something_else"}')).toEqual({ kind: 'none' });
    expect(shared.classifyCodeBlock(JSON.stringify({
      type: 'autocomplete_check',
      seeds: ['valid'],
      version: 1,
    }))).toMatchObject({ kind: 'malformed' });
  });

  it('keeps the normal and corrective instructions data-only', () => {
    expect(shared.AUTOCOMPLETE_INSTRUCTION).toContain('exact language people type');
    expect(shared.AUTOCOMPLETE_INSTRUCTION).not.toContain('"version"');
    expect(shared.CORRECTION_INSTRUCTION).not.toContain('"version"');
  });
});
