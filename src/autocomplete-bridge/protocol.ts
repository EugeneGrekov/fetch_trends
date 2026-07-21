import { createHash } from 'node:crypto';
import type { NormalizedAutocompleteRequest } from './types.js';

const REQUEST_KEYS = new Set(['type', 'seeds', 'modifiers']);
const MAX_ROWS = 500;
const MAX_ROW_LENGTH = 1_000;

export class InvalidAutocompleteRequestError extends Error {}

export function normalizeAutocompleteRequest(value: unknown): NormalizedAutocompleteRequest {
  if (!isRecord(value)) {
    throw new InvalidAutocompleteRequestError('Request must be a JSON object.');
  }

  const unknownKeys = Object.keys(value).filter((key) => !REQUEST_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new InvalidAutocompleteRequestError(`Unknown request field: ${unknownKeys[0]}.`);
  }

  if (value.type !== 'autocomplete_check') {
    throw new InvalidAutocompleteRequestError('type must be exactly "autocomplete_check".');
  }

  const seeds = normalizeRows(value.seeds, 'seeds', false);
  const modifiers = value.modifiers === undefined
    ? []
    : normalizeRows(value.modifiers, 'modifiers', true);
  const canonical = {
    seeds: canonicalRows(seeds),
    modifiers: canonicalRows(modifiers),
  };

  return {
    type: 'autocomplete_check',
    seeds,
    modifiers,
    requestKey: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
  };
}
export function normalizeIdentity(value: string): string {
  return normalizeDisplayRow(value).toLocaleLowerCase('en-US');
}

function normalizeRows(value: unknown, name: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value)) {
    throw new InvalidAutocompleteRequestError(`${name} must be an array of strings.`);
  }

  if (value.length > MAX_ROWS) {
    throw new InvalidAutocompleteRequestError(`${name} may contain at most ${MAX_ROWS} rows.`);
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const row of value) {
    if (typeof row !== 'string') {
      throw new InvalidAutocompleteRequestError(`${name} must contain only strings.`);
    }

    const display = normalizeDisplayRow(row);
    if (!display) {
      throw new InvalidAutocompleteRequestError(`${name} may not contain empty rows.`);
    }

    if (display.length > MAX_ROW_LENGTH) {
      throw new InvalidAutocompleteRequestError(`${name} rows may contain at most ${MAX_ROW_LENGTH} characters.`);
    }

    const identity = normalizeIdentity(display);
    if (seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    normalized.push(display);
  }

  if (!allowEmpty && normalized.length === 0) {
    throw new InvalidAutocompleteRequestError(`${name} must contain at least one row.`);
  }

  return normalized;
}

function canonicalRows(values: string[]): string[] {
  return values.map(normalizeIdentity).sort((left, right) => left.localeCompare(right));
}

function normalizeDisplayRow(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
