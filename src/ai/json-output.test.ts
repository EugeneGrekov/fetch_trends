import { describe, expect, it } from 'vitest';
import { extractJsonCandidate, parseJsonOutput } from './json-output.js';

describe('AI JSON output parsing', () => {
  it('parses raw JSON output', () => {
    expect(parseJsonOutput<{ ok: boolean }>('{ "ok": true }')).toEqual({ ok: true });
  });

  it('parses JSON inside a fenced code block', () => {
    expect(parseJsonOutput<{ count: number }>('```json\n{ "count": 2 }\n```')).toEqual({ count: 2 });
  });

  it('rejects invalid JSON output', () => {
    expect(() => parseJsonOutput('{ nope ')).toThrow(/valid JSON/);
  });

  it('rejects non-single fenced output', () => {
    expect(() => extractJsonCandidate('before\n```json\n{}\n```')).toThrow(/single fenced JSON block/);
  });
});
