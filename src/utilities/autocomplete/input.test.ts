import { describe, expect, it } from 'vitest';
import { dedupePhrases, loadSeedsWithOptions, parseSeedCsv, parseSeedInput } from './input.js';

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

  it('parses plain stdin input as seed lines when no seed args are provided', async () => {
    const seeds = await loadSeedsWithOptions([], [], {
      stdinIsTTY: false,
      readStdin: async () => 'find my parked car\nparking app\n',
    });

    expect(seeds).toEqual(['find my parked car', 'parking app']);
  });

  it('parses CSV stdin input when the header includes seed', () => {
    const seeds = parseSeedInput('name,seed\none,"find my parked car"\ntwo,"parking app"\n');

    expect(seeds).toEqual(['find my parked car', 'parking app']);
  });
});
