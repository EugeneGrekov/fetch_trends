import type { CompetitorRow, EvidenceRow, SourceRow } from '../db/schema.js';
import type { CompetitorCollectorInput, CompetitorCollectorOutput } from '../utilities/competitors/types.js';
import type { EvidenceCollector } from '../utilities/external/types.js';
import type { RedditCollectorInput, RedditCollectorOutput } from '../utilities/reddit/types.js';
import type { ReviewsCollectorInput, ReviewsCollectorOutput } from '../utilities/reviews/types.js';
import type { SerpCollectorOutput, SerpQueryInput } from '../utilities/serp/types.js';
import type { YouTubeCollectorInput, YouTubeCollectorOutput } from '../utilities/youtube/types.js';

export interface CollectorConfig {
  serp: {
    enabled: boolean;
    limit: number;
    provider: 'serpapi';
  };
  reddit: {
    enabled: boolean;
    limit: number;
  };
  youtube: {
    enabled: boolean;
    limit: number;
  };
  competitors: {
    enabled: boolean;
    maxPages: number;
  };
  reviews: {
    enabled: boolean;
    limit: number;
  };
}

export interface ExternalCollectorOverrides {
  serp?: EvidenceCollector<SerpQueryInput, SerpCollectorOutput>;
  reddit?: EvidenceCollector<RedditCollectorInput, RedditCollectorOutput>;
  youtube?: EvidenceCollector<YouTubeCollectorInput, YouTubeCollectorOutput>;
  competitors?: EvidenceCollector<CompetitorCollectorInput, CompetitorCollectorOutput>;
  reviews?: EvidenceCollector<ReviewsCollectorInput, ReviewsCollectorOutput>;
}

export interface ExternalCollectorDependencies {
  collectors?: ExternalCollectorOverrides;
  loadConfig?: () => Promise<CollectorConfig>;
}

export interface ExternalCollectorRun {
  collector: 'serp' | 'reddit' | 'youtube' | 'competitors' | 'reviews';
  status: 'completed' | 'failed' | 'blocked' | 'skipped';
  itemCount: number;
  errorCount: number;
  toolRunId?: number;
  warning?: string;
}

export interface ExternalEvidenceSummary {
  enabled: boolean;
  warnings: string[];
  collectorRuns: ExternalCollectorRun[];
  sources: SourceRow[];
  evidence: EvidenceRow[];
  competitors: CompetitorRow[];
}
