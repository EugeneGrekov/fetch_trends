import { beforeAll, describe, expect, it } from 'vitest';

interface SharedProtocol {
  AUTOCOMPLETE_INSTRUCTION: string;
  CORRECTION_INSTRUCTION: string;
  classifyCodeBlock(text: string):
    | { kind: 'none' }
    | { kind: 'malformed'; reason: string }
    | { kind: 'valid'; request: { type: string; seeds: string[]; modifiers?: string[] } };
  classifyCodeBlocks(texts: string[]): ReturnType<SharedProtocol['classifyCodeBlock']>;
  classifyGoogleTrendsUrl(value: string):
    | { kind: 'none' }
    | { kind: 'valid'; url: string };
  findFirstGoogleTrendsUrl(values: string[]): ReturnType<SharedProtocol['classifyGoogleTrendsUrl']>;
  calculateCropRegion(input: {
    imageWidth: number;
    imageHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    rect: { left: number; top: number; right: number; bottom: number };
    padding?: number;
  }): { x: number; y: number; width: number; height: number };
  isResponseBundleReady(bundle: unknown): boolean;
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
    expect(shared.AUTOCOMPLETE_INSTRUCTION).toContain('https://trends.google.com/explore');
    expect(shared.AUTOCOMPLETE_INSTRUCTION).toContain('relative search interest');
    expect(shared.AUTOCOMPLETE_INSTRUCTION).not.toContain('"version"');
    expect(shared.CORRECTION_INSTRUCTION).not.toContain('"version"');
  });
});

describe('extension Google Trends response bundles', () => {
  it('accepts only HTTPS Google Trends Explore URLs with comparison data', () => {
    const url = 'https://trends.google.com/trends/explore?geo=US&q=addblocker%2Cblock%20adds';
    expect(shared.classifyGoogleTrendsUrl(url)).toEqual({ kind: 'valid', url });
    expect(shared.classifyGoogleTrendsUrl('http://trends.google.com/explore?q=one')).toEqual({ kind: 'none' });
    expect(shared.classifyGoogleTrendsUrl('https://trends.google.com/explore?geo=US')).toEqual({ kind: 'none' });
    expect(shared.classifyGoogleTrendsUrl('https://trends.google.com.evil.test/explore?q=one')).toEqual({ kind: 'none' });
  });

  it('uses the first valid URL from links or plain response text', () => {
    const first = 'https://trends.google.com/explore?geo=US&q=first%2Csecond';
    const later = 'https://trends.google.com/explore?geo=GB&q=later';
    expect(shared.findFirstGoogleTrendsUrl([
      `Compare [these terms](${first}).`,
      later,
    ])).toEqual({ kind: 'valid', url: first });
  });

  it('maps the visible card rectangle into captured-image pixels', () => {
    expect(shared.calculateCropRegion({
      imageWidth: 2000,
      imageHeight: 1200,
      viewportWidth: 1000,
      viewportHeight: 600,
      rect: { left: 10, top: 20, right: 900, bottom: 550 },
      padding: 5,
    })).toEqual({ x: 10, y: 30, width: 1800, height: 1080 });
  });

  it('waits for every requested operation in the finalized response', () => {
    const bundle = {
      finalized: true,
      delivered: false,
      autocomplete: { requested: true, status: 'completed' },
      trends: { requested: true, status: 'processing' },
    };
    expect(shared.isResponseBundleReady(bundle)).toBe(false);
    bundle.trends.status = 'completed';
    expect(shared.isResponseBundleReady(bundle)).toBe(true);
    bundle.delivered = true;
    expect(shared.isResponseBundleReady(bundle)).toBe(false);
  });
});
