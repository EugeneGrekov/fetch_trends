export function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeQuery(value: string): string {
  return normalizeSpaces(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' '),
  );
}

export function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const cleaned = normalizeSpaces(value);
    if (!cleaned) {
      continue;
    }

    const key = normalizeQuery(cleaned);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(cleaned);
  }

  return output;
}

export function includesAny(normalizedQueryValue: string, terms: string[]): boolean {
  return terms.some((term) => normalizedQueryValue.includes(normalizeQuery(term)));
}

export function startsWithAny(normalizedQueryValue: string, terms: string[]): boolean {
  return terms.some((term) => normalizedQueryValue.startsWith(normalizeQuery(term)));
}
