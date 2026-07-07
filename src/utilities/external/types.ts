export interface CollectorError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface CollectorOutput<TItem> {
  items: TItem[];
  rawMetadata: Record<string, unknown>;
  errors: CollectorError[];
  blocked: boolean;
  fetchedAt: string;
}

export interface EvidenceCollector<Input, Output> {
  readonly name: string;
  collect(input: Input): Promise<Output>;
}
