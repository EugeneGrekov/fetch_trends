import type { DatabaseSync } from 'node:sqlite';
import { createExperimentEvents, getExperimentById } from '../db/repositories/experiments.js';
import type { ExperimentEventRow } from '../db/schema.js';
import { MEASUREMENT_EVENT_NAMES } from './types.js';
import type { ManualMeasurementEvent, MeasurementEventName } from './types.js';

const REQUIRED_CSV_HEADERS = ['event_name', 'occurred_at', 'source'] as const;
const OPTIONAL_CSV_HEADERS = ['session_id', 'metadata_json'] as const;

export function parseMeasurementEventCsv(contents: string): ManualMeasurementEvent[] {
  const rows = parseCsv(contents);
  if (rows.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => header.trim());
  validateHeaders(headers);

  return dataRows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row, index) => {
      const values = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex]?.trim() ?? '']));
      return normalizeManualEvent(
        {
          eventName: normalizeMeasurementEventName(values.event_name ?? ''),
          occurredAt: values.occurred_at ?? '',
          source: values.source ?? '',
          sessionId: values.session_id || null,
          metadataJson: values.metadata_json || null,
        },
        `CSV row ${index + 2}`,
      );
    });
}

export function recordMeasurementEvents(args: {
  createdAt?: string;
  db: DatabaseSync;
  events: ManualMeasurementEvent[];
  experimentId: number;
}): ExperimentEventRow[] {
  getExperimentById(args.db, args.experimentId);
  const createdAt = args.createdAt ?? new Date().toISOString();

  return createExperimentEvents(
    args.db,
    args.events.map((event, index) => {
      const normalized = normalizeManualEvent(event, `event ${index + 1}`);
      return {
        createdAt,
        eventName: normalized.eventName,
        experimentId: args.experimentId,
        metadataJson: normalized.metadataJson,
        occurredAt: normalized.occurredAt,
        sessionId: normalized.sessionId,
        source: normalized.source,
      };
    }),
  );
}

export function normalizeManualEvent(
  event: ManualMeasurementEvent,
  label = 'event',
): ManualMeasurementEvent {
  const occurredAt = normalizeTimestamp(event.occurredAt, `${label} occurred_at`);
  const source = event.source.trim();
  if (source.length === 0) {
    throw new Error(`${label} source is required.`);
  }

  const metadataJson = normalizeMetadataJson(event.metadataJson, `${label} metadata_json`);

  return {
    eventName: normalizeMeasurementEventName(event.eventName),
    occurredAt,
    source,
    sessionId: event.sessionId?.trim() || null,
    metadataJson,
  };
}

export function normalizeMeasurementEventName(value: string): MeasurementEventName {
  if (MEASUREMENT_EVENT_NAMES.includes(value as MeasurementEventName)) {
    return value as MeasurementEventName;
  }

  throw new Error(`Unsupported measurement event "${value}". Expected one of: ${MEASUREMENT_EVENT_NAMES.join(', ')}.`);
}

function validateHeaders(headers: string[]): void {
  for (const required of REQUIRED_CSV_HEADERS) {
    if (!headers.includes(required)) {
      throw new Error(`Event CSV is missing required header "${required}".`);
    }
  }

  const allowed = new Set<string>([...REQUIRED_CSV_HEADERS, ...OPTIONAL_CSV_HEADERS]);
  const unknown = headers.filter((header) => !allowed.has(header));
  if (unknown.length > 0) {
    throw new Error(`Event CSV has unsupported header(s): ${unknown.join(', ')}.`);
  }
}

function normalizeTimestamp(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${label} must be a valid date/time.`);
  }

  return timestamp.toISOString();
}

function normalizeMetadataJson(value: string | null | undefined, label: string): string | null {
  if (value == null || value.trim().length === 0) {
    return null;
  }

  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function parseCsv(contents: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < contents.length; index += 1) {
    const char = contents[index];
    const next = contents[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new Error('Event CSV has an unterminated quoted field.');
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((parsedRow) => parsedRow.some((value) => value.trim().length > 0));
}
