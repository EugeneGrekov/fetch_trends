import { normalizeSpaces } from './normalize.js';

export const DEFAULT_OUTPUT_DIR = './results';

export function resolveAutocompleteOutputPath(outPath: string | undefined, seeds: string[], now = new Date()): string {
  return outPath ?? buildDefaultOutputPath(seeds, now);
}

export function buildDefaultOutputPath(seeds: string[], now = new Date(), outputDir = DEFAULT_OUTPUT_DIR): string {
  const timestamp = formatOutputTimestamp(now);
  const firstWord = sanitizeOutputToken(getFirstSeedWord(seeds));
  const filename = `${timestamp}_${firstWord || 'seeds'}.csv`;

  return joinOutputPath(outputDir, filename);
}

function getFirstSeedWord(seeds: string[]): string {
  const firstSeed = normalizeSpaces(seeds[0] ?? '');
  return firstSeed.split(/\s+/, 1)[0] ?? '';
}

function formatOutputTimestamp(now: Date): string {
  const year = now.getFullYear();
  const month = padDatePart(now.getMonth() + 1);
  const day = padDatePart(now.getDate());
  const hour = padDatePart(now.getHours());
  const minute = padDatePart(now.getMinutes());

  return `${year}-${month}-${day}_${hour}:${minute}`;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function sanitizeOutputToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function joinOutputPath(outputDir: string, filename: string): string {
  const normalizedDir = outputDir.replace(/\/+$/, '');
  return `${normalizedDir}/${filename}`;
}
