import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { stdin } from 'node:process';
import { DEFAULT_MODIFIERS } from './constants.js';
import { normalizeQuery, normalizeSpaces } from './normalize.js';

export async function loadSeeds(inlineSeeds: string[], seedPaths: string[]): Promise<string[]> {
  const rawSeeds = [...inlineSeeds];
  let stdinCache: string | undefined;

  for (const seedPath of seedPaths) {
    if (seedPath === '-') {
      stdinCache ??= await readStdin();
      rawSeeds.push(...parseTxt(stdinCache));
      continue;
    }

    const content = await readFile(seedPath, 'utf8');
    const extension = extname(seedPath).toLowerCase();

    if (extension === '.csv') {
      rawSeeds.push(...parseSeedCsv(content, seedPath));
    } else {
      rawSeeds.push(...parseTxt(content));
    }
  }

  return dedupePhrases(rawSeeds);
}

export async function resolveModifiers(modifierValues: string[], modifierSources: string[]): Promise<string[]> {
  if (modifierValues.length === 0 && modifierSources.length === 0) {
    return [...DEFAULT_MODIFIERS];
  }

  const rawModifiers = [...modifierValues];

  for (const source of modifierSources) {
    if (existsSync(source)) {
      rawModifiers.push(...parseTxt(await readFile(source, 'utf8')));
      continue;
    }

    rawModifiers.push(...source.split(','));
  }

  return dedupePhrases(rawModifiers);
}

export function parseSeedCsv(content: string, sourceName = 'CSV input'): string[] {
  const rows = parseCsvRows(content);
  if (rows.length === 0) {
    return [];
  }

  const header = rows[0]?.map((value) => normalizeQuery(value)) ?? [];
  const seedColumnIndex = header.indexOf('seed');

  if (seedColumnIndex === -1) {
    throw new Error(`${sourceName} must include a column named "seed".`);
  }

  return rows.slice(1).map((row) => row[seedColumnIndex] ?? '');
}

export function parseTxt(content: string): string[] {
  return content.split(/\r?\n/);
}

export function dedupePhrases(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const cleaned = normalizeSpaces(value);
    const key = normalizeQuery(cleaned);

    if (!cleaned || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(cleaned);
  }

  return output;
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let content = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk) => {
      content += chunk;
    });
    stdin.on('end', () => resolve(content));
    stdin.on('error', reject);
  });
}
