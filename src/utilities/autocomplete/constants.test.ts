import { describe, expect, it } from 'vitest';
import { DEFAULT_MODIFIERS } from './constants.js';

describe('autocomplete default modifiers', () => {
  it('uses neutral business-validation modifiers by default', () => {
    expect(DEFAULT_MODIFIERS).toEqual(expect.arrayContaining([
      'tool',
      'software',
      'chrome extension',
      'api',
      'pricing',
      'alternative',
      'for small business',
    ]));
  });

  it('does not include the old parking and mobile-map modifiers', () => {
    expect(DEFAULT_MODIFIERS).not.toEqual(expect.arrayContaining([
      'Android',
      'iPhone',
      'Bluetooth',
      'Google Maps',
      'Apple Maps',
      'no tap',
    ]));
  });
});
