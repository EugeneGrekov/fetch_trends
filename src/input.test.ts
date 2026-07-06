import { describe, expect, it } from 'vitest';
import { dedupePhrases, parseSeedCsv } from './input.js';

describe('input parsing', () => {
  it('reads a seed column from CSV input', () => {
    const seeds = parseSeedCsv('name,seed\none,"find my parked car"\ntwo,"Bluetooth parking app"\n');

    expect(seeds).toEqual(['find my parked car', 'Bluetooth parking app']);
  });

  it('requires a seed column in CSV input', () => {
    expect(() => parseSeedCsv('phrase\nfind my parked car\n')).toThrow(/column named "seed"/);
  });

  it('trims, removes empty values, and deduplicates phrases', () => {
    const phrases = dedupePhrases([' Find my parked car ', '', 'find   my parked car', 'automatic parking app']);

    expect(phrases).toEqual(['Find my parked car', 'automatic parking app']);
  });
});
