import { describe, expect, it } from 'vitest';
import { buildDefaultOutputPath, resolveAutocompleteOutputPath } from './output.js';

describe('autocomplete output paths', () => {
  it('keeps an explicit output path unchanged', () => {
    expect(resolveAutocompleteOutputPath('./results/custom.csv', ['parking app'], new Date('2026-07-10T12:34:56.789Z'))).toBe(
      './results/custom.csv',
    );
  });

  it('builds a timestamped default path from the first seed word', () => {
    const date = new Date('2026-07-10T12:34:56.789Z');
    const path = buildDefaultOutputPath(['Parking app ideas'], date);

    expect(path).toBe(`./results/${formatExpectedLocalTimestamp(date)}_parking.csv`);
    expect(path).not.toContain('T');
    expect(path).not.toContain('Z_');
  });

  it('falls back to a safe suffix when the first seed has no filename token', () => {
    const date = new Date('2026-07-10T12:34:56.789Z');

    expect(buildDefaultOutputPath(['!!!'], date)).toBe(
      `./results/${formatExpectedLocalTimestamp(date)}_seeds.csv`,
    );
  });
});

function formatExpectedLocalTimestamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
