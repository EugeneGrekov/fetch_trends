export function expectRow<T>(value: unknown, message: string): T {
  if (!value || typeof value !== 'object') {
    throw new Error(message);
  }

  return value as T;
}

export function expectRows<T>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected a row array from SQLite.');
  }

  return value as T[];
}
