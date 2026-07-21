import { describe, expect, it } from 'vitest';
import { InvalidAutocompleteRequestError, normalizeAutocompleteRequest } from './protocol.js';

describe('autocomplete bridge protocol', () => {
  it('treats row order, case, whitespace, and duplicates as the same request', () => {
    const first = normalizeAutocompleteRequest({
      type: 'autocomplete_check',
      seeds: [' AI   App Builder ', 'Business Research', 'ai app builder'],
      modifiers: [' With ', 'for'],
    });
    const second = normalizeAutocompleteRequest({
      type: 'autocomplete_check',
      seeds: ['business research', 'ai app builder'],
      modifiers: ['FOR', 'with'],
    });

    expect(first.requestKey).toBe(second.requestKey);
    expect(first.seeds).toEqual(['AI App Builder', 'Business Research']);
    expect(first.modifiers).toEqual(['With', 'for']);
  });

  it('uses modifiers as part of the cache identity', () => {
    const organic = normalizeAutocompleteRequest({
      type: 'autocomplete_check',
      seeds: ['ai app builder'],
    });
    const modified = normalizeAutocompleteRequest({
      type: 'autocomplete_check',
      seeds: ['ai app builder'],
      modifiers: ['for'],
    });

    expect(organic.requestKey).not.toBe(modified.requestKey);
    expect(organic.modifiers).toEqual([]);
  });

  it.each([
    {},
    { type: 'autocomplete_check', seeds: [] },
    { type: 'autocomplete_check', seeds: ['valid'], extra: true },
    { type: 'autocomplete_check', seeds: [42] },
    { type: 'wrong', seeds: ['valid'] },
  ])('rejects malformed input %#', (value) => {
    expect(() => normalizeAutocompleteRequest(value)).toThrow(InvalidAutocompleteRequestError);
  });
});
