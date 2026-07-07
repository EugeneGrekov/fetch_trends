import type {
  MeasurementMetrics,
  MeasurementRecommendation,
  MeasurementThreshold,
  MeasurementThresholdPlan,
  ParsedThresholdRequirements,
  ThresholdEvaluationResult,
} from './types.js';

const DEFAULT_THRESHOLDS: MeasurementThreshold[] = [
  {
    signal: 'strong',
    condition: '100 targeted visitors, 8+ CTA clicks, 2+ payment clicks, and 1+ direct reply asking for access or timing.',
    rationale: 'Fallback threshold used when a stored experiment has no parseable threshold list.',
  },
  {
    signal: 'weak',
    condition: '100 targeted visitors with 2-7 CTA clicks, fewer than 3 payment clicks, or only generic waitlist emails.',
    rationale: 'Fallback weak threshold used only for conservative local evaluation.',
  },
  {
    signal: 'kill',
    condition: '200 targeted visitors, under 1% CTA click rate, no payment clicks, and no replies with urgent task context.',
    rationale: 'Fallback kill threshold used only for conservative local evaluation.',
  },
];

export function parseMeasurementThresholdPlan(thresholdJson: string): MeasurementThresholdPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(thresholdJson);
  } catch {
    throw new Error('Experiment threshold_json must be valid JSON.');
  }

  const thresholdContainer = extractThresholdContainer(parsed);
  const thresholds = normalizeThresholds(thresholdContainer.thresholds);

  return {
    assumptionWarning: thresholdContainer.assumptionWarning,
    thresholds: thresholds.length > 0 ? thresholds : DEFAULT_THRESHOLDS,
  };
}

export function evaluateThresholdPlan(
  plan: MeasurementThresholdPlan,
  metrics: MeasurementMetrics,
): ThresholdEvaluationResult[] {
  const thresholds = plan.thresholds.length > 0 ? plan.thresholds : DEFAULT_THRESHOLDS;
  return thresholds.map((threshold) => evaluateThreshold(threshold, metrics));
}

export function buildMeasurementRecommendation(
  metrics: MeasurementMetrics,
  thresholdResults: ThresholdEvaluationResult[],
): MeasurementRecommendation {
  const strongSignals = thresholdResults
    .filter((result) => result.classification === 'strong_signal')
    .flatMap((result) => result.evidence);
  const weakSignals = thresholdResults
    .filter((result) => result.classification === 'weak_signal')
    .flatMap((result) => result.evidence);
  const killSignals = thresholdResults
    .filter((result) => result.classification === 'kill_signal')
    .flatMap((result) => result.evidence);
  const missingData = unique([
    ...metrics.missingData,
    ...thresholdResults.flatMap((result) => result.missingData),
  ]);

  if (metrics.totalEvents === 0) {
    return {
      decision: 'inconclusive',
      killSignals,
      missingData,
      reason: 'No behavior events have been recorded, so the experiment cannot support a decision.',
      strongSignals,
      weakSignals,
    };
  }

  if (killSignals.length > 0) {
    return {
      decision: 'kill',
      killSignals,
      missingData,
      reason: 'Observed behavior met the stored kill threshold.',
      strongSignals,
      weakSignals,
    };
  }

  if (strongSignals.length > 0) {
    return {
      decision: 'build_mvp',
      killSignals,
      missingData,
      reason: 'Observed behavior met the stored strong-signal threshold. Treat this as permission to build a minimal MVP, not proof of a business.',
      strongSignals,
      weakSignals,
    };
  }

  const visitorFloor = minimumVisitorFloor(thresholdResults);
  if (visitorFloor != null && metrics.visitors < visitorFloor) {
    return {
      decision: 'inconclusive',
      killSignals,
      missingData,
      reason: `Only ${metrics.visitors} visitors are recorded; the lowest stored visitor threshold is ${visitorFloor}.`,
      strongSignals,
      weakSignals,
    };
  }

  if (weakSignals.length > 0 && hasFollowUpSignal(metrics)) {
    return {
      decision: 'validate_deeper',
      killSignals,
      missingData,
      reason: 'Observed behavior produced weak but non-empty follow-up signals. Keep validating before building.',
      strongSignals,
      weakSignals,
    };
  }

  const killFloor = thresholdResults.find((result) => result.signal === 'kill')?.requirements.visitorFloor ?? null;
  if (
    killFloor != null
    && metrics.visitors >= killFloor
    && metrics.funnel.paymentClick === 0
    && metrics.funnel.replyReceived === 0
    && metrics.funnel.ctaClick > 0
  ) {
    return {
      decision: 'pivot',
      killSignals,
      missingData,
      reason: 'The experiment has enough visitors and some CTA interest, but no payment-intent or reply behavior.',
      strongSignals,
      weakSignals,
    };
  }

  return {
    decision: 'inconclusive',
    killSignals,
    missingData,
    reason: 'Behavior is not strong enough for a build decision and does not cleanly meet the kill threshold.',
    strongSignals,
    weakSignals,
  };
}

export function parseThresholdRequirements(condition: string): ParsedThresholdRequirements {
  const visitorFloor = firstNumber(condition, /(\d+)\s+targeted visitors/i);
  const ctaMinimum = firstNumber(condition, /(\d+)\+\s+CTA clicks/i);
  const ctaRange = condition.match(/(\d+)\s*-\s*(\d+)\s+CTA clicks/i);
  const ctaRateUnderRaw = firstDecimal(condition, /under\s+(\d+(?:\.\d+)?)%\s+CTA click rate/i);
  const paymentMinimum = firstNumber(condition, /(\d+)\+\s+payment clicks/i);
  const paymentMaximumExclusive = firstNumber(condition, /fewer than\s+(\d+)\s+payment clicks/i);
  const replyMinimum = firstNumber(condition, /(\d+)\+\s+(?:direct\s+)?repl(?:y|ies)/i);

  return {
    ctaClickMaximum: ctaRange?.[2] ? Number(ctaRange[2]) : null,
    ctaClickMinimum: ctaRange?.[1] ? Number(ctaRange[1]) : ctaMinimum,
    ctaRateUnder: ctaRateUnderRaw == null ? null : ctaRateUnderRaw / 100,
    paymentClickMaximumExclusive: paymentMaximumExclusive,
    paymentClickMinimum: paymentMinimum,
    replyMinimum,
    requiresNoPaymentClicks: /no payment clicks/i.test(condition),
    requiresNoReplies: /no replies/i.test(condition),
    visitorFloor,
  };
}

function evaluateThreshold(
  threshold: MeasurementThreshold,
  metrics: MeasurementMetrics,
): ThresholdEvaluationResult {
  const requirements = parseThresholdRequirements(threshold.condition);
  const evidence = buildEvidence(metrics);
  const missingData = buildThresholdMissingData(requirements, metrics);
  const enoughVisitors = requirements.visitorFloor == null || metrics.visitors >= requirements.visitorFloor;
  let classification: ThresholdEvaluationResult['classification'] = 'inconclusive';

  if (metrics.totalEvents > 0 && enoughVisitors) {
    if (threshold.signal === 'strong' && meetsStrongRequirements(requirements, metrics)) {
      classification = 'strong_signal';
    } else if (threshold.signal === 'weak' && meetsWeakRequirements(requirements, metrics)) {
      classification = 'weak_signal';
    } else if (threshold.signal === 'kill' && meetsKillRequirements(requirements, metrics)) {
      classification = 'kill_signal';
    }
  }

  return {
    classification,
    condition: threshold.condition,
    evidence,
    missingData,
    rationale: threshold.rationale ?? null,
    requirements,
    signal: threshold.signal,
  };
}

function meetsStrongRequirements(requirements: ParsedThresholdRequirements, metrics: MeasurementMetrics): boolean {
  return (
    meetsMinimum(metrics.funnel.ctaClick, requirements.ctaClickMinimum)
    && meetsMinimum(metrics.funnel.paymentClick, requirements.paymentClickMinimum)
    && meetsMinimum(metrics.funnel.replyReceived, requirements.replyMinimum)
  );
}

function meetsWeakRequirements(requirements: ParsedThresholdRequirements, metrics: MeasurementMetrics): boolean {
  const ctaInRange = requirements.ctaClickMinimum != null
    && metrics.funnel.ctaClick >= requirements.ctaClickMinimum
    && (requirements.ctaClickMaximum == null || metrics.funnel.ctaClick <= requirements.ctaClickMaximum);
  const belowPaymentMaximum = requirements.paymentClickMaximumExclusive != null
    && metrics.funnel.paymentClick < requirements.paymentClickMaximumExclusive
    && hasEngagementSignal(metrics);

  return ctaInRange || belowPaymentMaximum;
}

function meetsKillRequirements(requirements: ParsedThresholdRequirements, metrics: MeasurementMetrics): boolean {
  const ctaRate = metrics.rates.ctaClickRate;
  const rateMatches = requirements.ctaRateUnder == null || (ctaRate != null && ctaRate < requirements.ctaRateUnder);
  const paymentMatches = !requirements.requiresNoPaymentClicks || metrics.funnel.paymentClick === 0;
  const replyMatches = !requirements.requiresNoReplies || metrics.funnel.replyReceived === 0;

  return rateMatches && paymentMatches && replyMatches;
}

function meetsMinimum(actual: number, minimum: number | null): boolean {
  return minimum == null || actual >= minimum;
}

function hasEngagementSignal(metrics: MeasurementMetrics): boolean {
  return metrics.funnel.ctaClick > 0
    || metrics.funnel.checkoutStart > 0
    || metrics.funnel.paymentClick > 0
    || metrics.funnel.emailSubmit > 0
    || metrics.funnel.replyReceived > 0;
}

function hasFollowUpSignal(metrics: MeasurementMetrics): boolean {
  return metrics.funnel.paymentClick > 0 || metrics.funnel.emailSubmit > 0 || metrics.funnel.replyReceived > 0;
}

function buildThresholdMissingData(
  requirements: ParsedThresholdRequirements,
  metrics: MeasurementMetrics,
): string[] {
  const missing: string[] = [];

  if (requirements.visitorFloor != null && metrics.visitors < requirements.visitorFloor) {
    missing.push(`Needs ${requirements.visitorFloor} visitors; observed ${metrics.visitors}.`);
  }

  if (requirements.ctaClickMinimum != null && metrics.funnel.ctaClick < requirements.ctaClickMinimum) {
    missing.push(`Needs ${requirements.ctaClickMinimum} CTA clicks; observed ${metrics.funnel.ctaClick}.`);
  }

  if (requirements.paymentClickMinimum != null && metrics.funnel.paymentClick < requirements.paymentClickMinimum) {
    missing.push(`Needs ${requirements.paymentClickMinimum} payment clicks; observed ${metrics.funnel.paymentClick}.`);
  }

  if (requirements.replyMinimum != null && metrics.funnel.replyReceived < requirements.replyMinimum) {
    missing.push(`Needs ${requirements.replyMinimum} replies; observed ${metrics.funnel.replyReceived}.`);
  }

  return missing;
}

function buildEvidence(metrics: MeasurementMetrics): string[] {
  return [
    `${metrics.visitors} visitors`,
    `${metrics.funnel.ctaClick} CTA clicks`,
    `${metrics.funnel.paymentClick} payment clicks`,
    `${metrics.funnel.emailSubmit} email submissions`,
    `${metrics.funnel.replyReceived} replies`,
    `CTA click rate ${formatRate(metrics.rates.ctaClickRate)}`,
  ];
}

function formatRate(value: number | null): string {
  if (value == null) {
    return 'n/a';
  }

  return `${(value * 100).toFixed(2)}%`;
}

function firstNumber(value: string, pattern: RegExp): number | null {
  const match = value.match(pattern);
  return match?.[1] ? Number(match[1]) : null;
}

function firstDecimal(value: string, pattern: RegExp): number | null {
  const match = value.match(pattern);
  return match?.[1] ? Number(match[1]) : null;
}

function extractThresholdContainer(parsed: unknown): {
  assumptionWarning?: string;
  thresholds: unknown;
} {
  if (Array.isArray(parsed)) {
    return { thresholds: parsed };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { thresholds: [] };
  }

  const record = parsed as Record<string, unknown>;
  if (Array.isArray(record.thresholds)) {
    return {
      assumptionWarning: typeof record.assumptionWarning === 'string' ? record.assumptionWarning : undefined,
      thresholds: record.thresholds,
    };
  }

  const paymentTest = record.paymentTest;
  if (paymentTest && typeof paymentTest === 'object') {
    const paymentTestRecord = paymentTest as Record<string, unknown>;
    return {
      assumptionWarning: typeof paymentTestRecord.thresholdAssumptionWarning === 'string'
        ? paymentTestRecord.thresholdAssumptionWarning
        : undefined,
      thresholds: paymentTestRecord.decisionThresholds,
    };
  }

  return { thresholds: [] };
}

function normalizeThresholds(value: unknown): MeasurementThreshold[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const record = item as Record<string, unknown>;
    if (
      (record.signal === 'strong' || record.signal === 'weak' || record.signal === 'kill')
      && typeof record.condition === 'string'
    ) {
      return [{
        condition: record.condition,
        rationale: typeof record.rationale === 'string' ? record.rationale : undefined,
        signal: record.signal,
      }];
    }

    return [];
  });
}

function minimumVisitorFloor(results: ThresholdEvaluationResult[]): number | null {
  const floors = results
    .map((result) => result.requirements.visitorFloor)
    .filter((floor): floor is number => floor != null);

  return floors.length > 0 ? Math.min(...floors) : null;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
