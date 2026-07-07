import type {
  IdeaEvidenceSnapshot,
  StalenessReason,
  StalenessResult,
  StalenessRule,
} from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_STALENESS_RULES: StalenessRule[] = [
  {
    evidenceType: 'autocomplete_prediction',
    staleAfterDays: 90,
    taskType: 'refresh_autocomplete',
  },
  {
    evidenceType: 'serp_result',
    sourceTypes: ['serp_result'],
    staleAfterDays: 30,
    taskType: 'refresh_serp',
  },
  {
    evidenceType: 'competitor_pricing',
    sourceTypes: ['competitor_page'],
    staleAfterDays: 30,
    taskType: 'refresh_competitors',
  },
  {
    evidenceType: 'reviews_complaints',
    sourceTypes: ['reddit_thread', 'forum_thread', 'review_page', 'youtube_video', 'youtube_comment'],
    staleAfterDays: 90,
    taskType: 'refresh_reviews',
  },
  {
    evidenceType: 'measurement_event',
    staleAfterDays: null,
    taskType: 'refresh_measurement',
  },
  {
    evidenceType: 'score_snapshot',
    staleAfterDays: null,
    taskType: 'refresh_score',
  },
  {
    evidenceType: 'report_snapshot',
    staleAfterDays: null,
    taskType: 'refresh_report',
  },
  {
    evidenceType: 'portfolio_snapshot',
    staleAfterDays: null,
    taskType: 'refresh_portfolio',
  },
];

export function evaluateIdeaStaleness(
  snapshot: IdeaEvidenceSnapshot,
  now = new Date(),
  rules = DEFAULT_STALENESS_RULES,
): StalenessResult {
  const reasons: StalenessReason[] = [];
  const hasBaselineEvidence = hasAnyStoredEvidence(snapshot);
  const autocompleteRule = requiredRule(rules, 'autocomplete_prediction');
  const latestAutocompleteAt = latestTimestamp(snapshot.autocompletePredictions.map((row) => row.created_at));

  if (!latestAutocompleteAt) {
    reasons.push({
      type: 'autocomplete_prediction',
      lastFetchedAt: null,
      staleAfterDays: autocompleteRule.staleAfterDays,
      recommendedTask: autocompleteRule.taskType,
      reason: 'No autocomplete evidence is stored for this idea.',
    });
  } else {
    appendAgeReason({
      lastFetchedAt: latestAutocompleteAt,
      now,
      reason: 'Autocomplete predictions are older than the configured freshness window.',
      reasons,
      rule: autocompleteRule,
    });
  }

  if (hasBaselineEvidence) {
    appendSourceAgeReason({
      emptyReason: 'No SERP evidence is stored for this idea.',
      now,
      reason: 'SERP evidence is older than the configured freshness window.',
      reasons,
      rule: requiredRule(rules, 'serp_result'),
      snapshot,
    });
    appendCompetitorAgeReason({
      now,
      reasons,
      rule: requiredRule(rules, 'competitor_pricing'),
      snapshot,
    });
    appendSourceAgeReason({
      emptyReason: 'No review, forum, Reddit, or YouTube complaint evidence is stored for this idea.',
      now,
      reason: 'Review and complaint evidence is older than the configured freshness window.',
      reasons,
      rule: requiredRule(rules, 'reviews_complaints'),
      snapshot,
    });
  }

  appendScoreStalenessReason({ now, reasons, rule: requiredRule(rules, 'score_snapshot'), snapshot });
  appendReportStalenessReason({ now, reasons, rule: requiredRule(rules, 'report_snapshot'), snapshot });
  appendDerivedRefreshReasons({ now, reasons, rules, snapshot });

  return {
    ideaId: snapshot.idea.id,
    stale: reasons.length > 0,
    reasons,
    confidenceImpact: classifyConfidenceImpact(reasons),
  };
}

function appendDerivedRefreshReasons(args: {
  now: Date;
  reasons: StalenessReason[];
  rules: StalenessRule[];
  snapshot: IdeaEvidenceSnapshot;
}): void {
  const hasEvidenceRefresh = args.reasons.some((reason) =>
    ['refresh_autocomplete', 'refresh_serp', 'refresh_competitors', 'refresh_reviews'].includes(reason.recommendedTask),
  );
  if (!hasEvidenceRefresh) {
    return;
  }

  const scoreRule = requiredRule(args.rules, 'score_snapshot');
  const reportRule = requiredRule(args.rules, 'report_snapshot');
  if (!args.reasons.some((reason) => reason.type === 'score_snapshot')) {
    const latestScoreAt = latestTimestamp(args.snapshot.scores.map((score) => score.created_at));
    args.reasons.push({
      type: 'score_snapshot',
      lastFetchedAt: latestScoreAt,
      staleAfterDays: null,
      recommendedTask: scoreRule.taskType,
      reason: 'Evidence refresh tasks are queued, so the score should be recomputed after refresh.',
      ageDays: latestScoreAt ? ageInDays(latestScoreAt, args.now) : undefined,
    });
  }

  if (!args.reasons.some((reason) => reason.type === 'report_snapshot')) {
    const latestReportAt = latestTimestamp(args.snapshot.reports.map((report) => report.created_at));
    args.reasons.push({
      type: 'report_snapshot',
      lastFetchedAt: latestReportAt,
      staleAfterDays: null,
      recommendedTask: reportRule.taskType,
      reason: 'Evidence refresh tasks are queued, so a new report should be generated after refresh.',
      ageDays: latestReportAt ? ageInDays(latestReportAt, args.now) : undefined,
    });
  }
}

function appendAgeReason(args: {
  lastFetchedAt: string;
  now: Date;
  reason: string;
  reasons: StalenessReason[];
  rule: StalenessRule;
}): void {
  if (args.rule.staleAfterDays == null) {
    return;
  }

  const ageDays = ageInDays(args.lastFetchedAt, args.now);
  if (ageDays < args.rule.staleAfterDays) {
    return;
  }

  args.reasons.push({
    type: args.rule.evidenceType,
    lastFetchedAt: args.lastFetchedAt,
    staleAfterDays: args.rule.staleAfterDays,
    recommendedTask: args.rule.taskType,
    reason: args.reason,
    ageDays,
  });
}

function appendSourceAgeReason(args: {
  emptyReason: string;
  now: Date;
  reason: string;
  reasons: StalenessReason[];
  rule: StalenessRule;
  snapshot: IdeaEvidenceSnapshot;
}): void {
  const sourceTypes = new Set(args.rule.sourceTypes ?? []);
  const latestFetchedAt = latestTimestamp(
    args.snapshot.sources
      .filter((source) => sourceTypes.has(source.source_type))
      .map((source) => source.fetched_at),
  );

  if (!latestFetchedAt) {
    args.reasons.push({
      type: args.rule.evidenceType,
      lastFetchedAt: null,
      staleAfterDays: args.rule.staleAfterDays,
      recommendedTask: args.rule.taskType,
      reason: args.emptyReason,
    });
    return;
  }

  appendAgeReason({
    lastFetchedAt: latestFetchedAt,
    now: args.now,
    reason: args.reason,
    reasons: args.reasons,
    rule: args.rule,
  });
}

function appendCompetitorAgeReason(args: {
  now: Date;
  reasons: StalenessReason[];
  rule: StalenessRule;
  snapshot: IdeaEvidenceSnapshot;
}): void {
  const sourceTypes = new Set(args.rule.sourceTypes ?? []);
  const latestFetchedAt = latestTimestamp([
    ...args.snapshot.sources
      .filter((source) => sourceTypes.has(source.source_type))
      .map((source) => source.fetched_at),
    ...args.snapshot.competitors.map((competitor) => competitor.created_at),
  ]);

  if (!latestFetchedAt) {
    args.reasons.push({
      type: args.rule.evidenceType,
      lastFetchedAt: null,
      staleAfterDays: args.rule.staleAfterDays,
      recommendedTask: args.rule.taskType,
      reason: 'No competitor pricing or positioning evidence is stored for this idea.',
    });
    return;
  }

  appendAgeReason({
    lastFetchedAt: latestFetchedAt,
    now: args.now,
    reason: 'Competitor pricing or positioning evidence is older than the configured freshness window.',
    reasons: args.reasons,
    rule: args.rule,
  });
}

function appendScoreStalenessReason(args: {
  now: Date;
  reasons: StalenessReason[];
  rule: StalenessRule;
  snapshot: IdeaEvidenceSnapshot;
}): void {
  const latestEvidenceAt = latestEvidenceTimestamp(args.snapshot);
  if (!latestEvidenceAt) {
    return;
  }

  const latestScoreAt = latestTimestamp(args.snapshot.scores.map((score) => score.created_at));
  if (!latestScoreAt) {
    args.reasons.push({
      type: 'score_snapshot',
      lastFetchedAt: null,
      staleAfterDays: null,
      recommendedTask: args.rule.taskType,
      reason: 'No score snapshot exists for the stored evidence.',
    });
    return;
  }

  if (isAfter(latestEvidenceAt, latestScoreAt)) {
    args.reasons.push({
      type: 'score_snapshot',
      lastFetchedAt: latestScoreAt,
      staleAfterDays: null,
      recommendedTask: args.rule.taskType,
      reason: 'Newer evidence exists after the latest score snapshot.',
      ageDays: ageInDays(latestScoreAt, args.now),
    });
  }
}

function appendReportStalenessReason(args: {
  now: Date;
  reasons: StalenessReason[];
  rule: StalenessRule;
  snapshot: IdeaEvidenceSnapshot;
}): void {
  const latestScoreAt = latestTimestamp(args.snapshot.scores.map((score) => score.created_at));
  const latestEvidenceAt = latestEvidenceTimestamp(args.snapshot);
  const newestInputAt = latestTimestamp([latestScoreAt, latestEvidenceAt].filter(Boolean) as string[]);

  if (!newestInputAt) {
    return;
  }

  const latestReportAt = latestTimestamp(args.snapshot.reports.map((report) => report.created_at));
  if (!latestReportAt) {
    args.reasons.push({
      type: 'report_snapshot',
      lastFetchedAt: null,
      staleAfterDays: null,
      recommendedTask: args.rule.taskType,
      reason: 'No report snapshot exists for the stored evidence.',
    });
    return;
  }

  if (isAfter(newestInputAt, latestReportAt)) {
    args.reasons.push({
      type: 'report_snapshot',
      lastFetchedAt: latestReportAt,
      staleAfterDays: null,
      recommendedTask: args.rule.taskType,
      reason: 'Newer evidence or scoring exists after the latest report snapshot.',
      ageDays: ageInDays(latestReportAt, args.now),
    });
  }
}

function latestEvidenceTimestamp(snapshot: IdeaEvidenceSnapshot): string | null {
  return latestTimestamp([
    ...snapshot.autocompletePredictions.map((prediction) => prediction.created_at),
    ...snapshot.sources.map((source) => source.fetched_at),
    ...snapshot.evidence.map((evidence) => evidence.created_at),
    ...snapshot.competitors.map((competitor) => competitor.created_at),
  ]);
}

function hasAnyStoredEvidence(snapshot: IdeaEvidenceSnapshot): boolean {
  return (
    snapshot.autocompletePredictions.length > 0 ||
    snapshot.sources.length > 0 ||
    snapshot.evidence.length > 0 ||
    snapshot.competitors.length > 0 ||
    snapshot.scores.length > 0 ||
    snapshot.reports.length > 0
  );
}

function latestTimestamp(values: string[]): string | null {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp <= latestTime) {
      continue;
    }

    latest = value;
    latestTime = timestamp;
  }

  return latest;
}

function ageInDays(timestamp: string, now: Date): number {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - parsed) / DAY_MS));
}

function isAfter(left: string, right: string): boolean {
  return Date.parse(left) > Date.parse(right);
}

function requiredRule(rules: StalenessRule[], evidenceType: StalenessRule['evidenceType']): StalenessRule {
  const rule = rules.find((candidate) => candidate.evidenceType === evidenceType);
  if (!rule) {
    throw new Error(`Missing revalidation staleness rule for ${evidenceType}.`);
  }

  return rule;
}

function classifyConfidenceImpact(reasons: StalenessReason[]): StalenessResult['confidenceImpact'] {
  if (reasons.length === 0) {
    return 'none';
  }

  const fastMovingStaleReasons = reasons.filter((reason) => reason.staleAfterDays === 30);
  if (
    reasons.length >= 4 ||
    fastMovingStaleReasons.some((reason) => reason.ageDays != null && reason.ageDays >= 60)
  ) {
    return 'high';
  }

  if (fastMovingStaleReasons.length > 0 || reasons.length >= 2) {
    return 'medium';
  }

  return 'low';
}
