export type AutocompleteBridgeJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface AutocompleteCheckRequest {
  type: 'autocomplete_check';
  seeds: string[];
  modifiers?: string[];
}

export interface NormalizedAutocompleteRequest {
  type: 'autocomplete_check';
  seeds: string[];
  modifiers: string[];
  requestKey: string;
}

export interface AutocompleteBridgeJobRow {
  id: number;
  request_key: string;
  created_by: string;
  seeds_json: string;
  modifiers_json: string;
  status: AutocompleteBridgeJobStatus;
  output_path: string | null;
  result_markdown: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AutocompleteBridgeJob {
  id: number;
  requestKey: string;
  createdBy: string;
  seeds: string[];
  modifiers: string[];
  status: AutocompleteBridgeJobStatus;
  outputPath: string | null;
  resultMarkdown: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ResearchResult {
  markdown: string;
  outputPath: string;
}

export type AutocompleteResearchRunner = (
  job: AutocompleteBridgeJob,
) => Promise<ResearchResult>;
