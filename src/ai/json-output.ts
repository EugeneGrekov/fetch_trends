export function parseJsonOutput<T>(rawOutput: string): T {
  const candidate = extractJsonCandidate(rawOutput);

  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AI output was not valid JSON: ${message}`);
  }
}

export function extractJsonCandidate(rawOutput: string): string {
  const trimmed = rawOutput.trim();

  if (trimmed.length === 0) {
    throw new Error('AI output was empty.');
  }

  if (!trimmed.startsWith('```')) {
    if (trimmed.includes('```')) {
      throw new Error('AI output must be raw JSON or a single fenced JSON block.');
    }
    return trimmed;
  }

  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (!fenceMatch) {
    throw new Error('AI output must be raw JSON or a single fenced JSON block.');
  }

  const candidate = fenceMatch[1]?.trim() ?? '';
  if (candidate.length === 0) {
    throw new Error('AI output fenced block was empty.');
  }

  return candidate;
}
