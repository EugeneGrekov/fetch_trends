import type { PortfolioIdeaRanking, PortfolioIdeaSnapshot, PortfolioDimensionScores, PortfolioBucket, PortfolioConfidence } from './types.js';

const KILL_STATEMENTS = ['kill', 'stop', 'halt', 'not worth', 'no longer', 'dead'];
const TRUST_BURDEN_KEYWORDS = [
  'privacy',
  'location',
  'gps',
  'security',
  'health',
  'medical',
  'legal',
  'money',
  'payment',
  'password',
  'support',
  'refund',
  'permissions',
];
const COMPLEXITY_KEYWORDS = [
  'integration',
  'sync',
  'offline',
  'real-time',
  'bluetooth',
  'car',
  'invoice',
  'accounting',
  'workflow',
  'multi-user',
  'hardware',
];

export function evaluatePortfolioIdea(snapshot: PortfolioIdeaSnapshot, generatedAt: string): PortfolioIdeaRanking {
  const dimensions = scoreDimensions(snapshot, generatedAt);
  const killRules = buildKillRules(snapshot, dimensions);
  const bucket = chooseBucket(snapshot, dimensions, killRules);
  const confidence = chooseConfidence(bucket, dimensions, killRules);
  const blockingMissingProof = buildBlockingMissingProof(snapshot, dimensions, bucket, killRules);
  const bestNextAction = chooseBestNextAction(bucket, blockingMissingProof);
  const portfolioScore = computePortfolioScore(dimensions);

  return {
    bestNextAction,
    blockingMissingProof,
    bucket,
    confidence,
    costToTestEstimate: estimateCostToTest(bucket),
    decisionClarity: dimensions.decisionClarity,
    dimensions,
    ideaId: snapshot.idea.id,
    killRules,
    latestDecision: snapshot.latestDecision?.decision ?? null,
    latestEvidenceAt: snapshot.latestEvidenceAt,
    latestExperimentDecision: snapshot.latestExperimentDecision?.decision ?? null,
    latestReportAt: snapshot.latestReportAt,
    portfolioScore,
    reason: buildReason(bucket, dimensions, killRules, blockingMissingProof),
    title: snapshot.idea.title,
  };
}

function scoreDimensions(snapshot: PortfolioIdeaSnapshot, generatedAt: string): PortfolioDimensionScores {
  const recency = clamp(scoreRecency(snapshot.latestEvidenceAt, generatedAt), 0, 100);
  const evidenceStrength = clamp(
    (snapshot.latestValidationReport ? 18 : 0)
      + (snapshot.latestScore ? 12 : 0)
      + (snapshot.latestMeasurementReport ? 16 : 0)
      + (snapshot.latestPaymentTestReport ? 14 : 0)
      + (snapshot.latestSeoPlanReport ? 8 : 0)
      + (snapshot.latestDecision ? 12 : 0)
      + Math.min(snapshot.predictions.length, 8) * 4
      + Math.min(snapshot.queries.length, 5) * 4
      + Math.min(snapshot.evidence.length, 5) * 6
      + Math.min(snapshot.sources.length, 5) * 4
      + Math.min(snapshot.competitors.length, 3) * 6,
    0,
    100,
  );

  const searchIntentStrength = clamp(
    scoreIntentLanguage(snapshot) + averagePredictionConfidence(snapshot) * 0.35,
    0,
    100,
  );

  const paymentSignalStrength = clamp(
    scorePaymentSignals(snapshot),
    0,
    100,
  );

  const technicalSimplicity = clamp(
    scoreTechnicalSimplicity(snapshot),
    0,
    100,
  );

  const trustSupportSimplicity = clamp(
    scoreTrustSupportSimplicity(snapshot),
    0,
    100,
  );

  const decisionClarity = clamp(
    24
      + (snapshot.latestDecision ? 20 : 0)
      + (snapshot.latestExperimentDecision ? 15 : 0)
      + (snapshot.latestMeasurementSnapshot ? 12 : 0)
      + (snapshot.latestScore ? 10 : 0)
      + (snapshot.latestValidationReport ? 8 : 0)
      + (recency >= 60 ? 8 : 0)
      + (evidenceStrength >= 45 ? 8 : 0),
    0,
    100,
  );

  const testCostEase = clamp(
    scoreTestCostEase(snapshot, evidenceStrength, paymentSignalStrength, trustSupportSimplicity, recency),
    0,
    100,
  );

  return {
    decisionClarity,
    evidenceStrength,
    paymentSignalStrength,
    recency,
    searchIntentStrength,
    technicalSimplicity,
    testCostEase,
    trustSupportSimplicity,
  };
}

function chooseBucket(
  snapshot: PortfolioIdeaSnapshot,
  dimensions: PortfolioDimensionScores,
  killRules: string[],
): PortfolioBucket {
  if (killRules.length > 0) {
    return 'kill';
  }

  const enoughEvidence = dimensions.evidenceStrength >= 45;
  const clearNextStep = dimensions.decisionClarity >= 55;
  const strongIntent = dimensions.searchIntentStrength >= 45;
  const strongPayment = dimensions.paymentSignalStrength >= 45;
  const cheapEnough = dimensions.testCostEase >= 45;
  const recentEnough = dimensions.recency >= 35;

  if (enoughEvidence && clearNextStep && strongIntent && strongPayment && cheapEnough && recentEnough) {
    return 'test_next';
  }

  if (dimensions.evidenceStrength >= 35 && (strongIntent || dimensions.paymentSignalStrength >= 20 || snapshot.latestDecision?.decision === 'persevere')) {
    return 'validate_deeper';
  }

  if (dimensions.evidenceStrength >= 20 || strongIntent || dimensions.paymentSignalStrength >= 10) {
    return 'watch';
  }

  return 'park';
}

function chooseConfidence(
  bucket: PortfolioBucket,
  dimensions: PortfolioDimensionScores,
  killRules: string[],
): PortfolioConfidence {
  if (bucket === 'kill' && killRules.length > 0) {
    return dimensions.recency >= 40 ? 'high' : 'medium';
  }

  if (dimensions.evidenceStrength >= 70 && dimensions.decisionClarity >= 60 && dimensions.recency >= 40) {
    return 'high';
  }

  if (dimensions.evidenceStrength >= 40 || dimensions.paymentSignalStrength >= 40 || bucket === 'test_next') {
    return 'medium';
  }

  return 'low';
}

function buildKillRules(snapshot: PortfolioIdeaSnapshot, dimensions: PortfolioDimensionScores): string[] {
  const rules: string[] = [];
  const reasonText = [
    snapshot.latestDecision?.reason,
    snapshot.latestExperimentDecision?.reason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (snapshot.latestDecision?.decision === 'kill') {
    rules.push(`Latest idea decision says kill: ${snapshot.latestDecision.reason}`);
  }

  if (snapshot.latestExperimentDecision?.decision === 'kill') {
    rules.push(`Latest experiment decision says kill: ${snapshot.latestExperimentDecision.reason}`);
  }

  if (snapshot.latestScore?.decision === 'kill') {
    rules.push(`Latest validation score says kill with ${snapshot.latestScore.total_score}/100.`);
  }

  if (snapshot.latestMeasurementThresholdResults?.some((result) => result.classification === 'kill_signal')) {
    rules.push('Measurement snapshot hit a kill threshold.');
  }

  if (KILL_STATEMENTS.some((phrase) => reasonText.includes(phrase))) {
    rules.push('Stored decision reasoning contains an explicit kill statement.');
  }

  if (dimensions.paymentSignalStrength < 10 && snapshot.latestDecision?.decision === 'kill') {
    rules.push('No payment behavior evidence was recorded before the kill decision.');
  }

  return [...new Set(rules)];
}

function buildBlockingMissingProof(
  snapshot: PortfolioIdeaSnapshot,
  dimensions: PortfolioDimensionScores,
  bucket: PortfolioBucket,
  killRules: string[],
): string[] {
  const missingProof: string[] = [];

  if (!snapshot.latestValidationReport) {
    missingProof.push('No stored validation report yet.');
  }

  if (!snapshot.predictions.some((prediction) => prediction.intent === 'high purchase intent' || prediction.intent === 'comparison intent')) {
    missingProof.push('No high-intent or comparison-intent autocomplete evidence yet.');
  }

  if (dimensions.paymentSignalStrength < 35 && bucket !== 'kill') {
    missingProof.push('No direct payment-click or pricing evidence yet.');
  }

  if (snapshot.competitors.length === 0) {
    missingProof.push('No competitor review or pricing evidence yet.');
  }

  if (!snapshot.latestMeasurementSnapshot && bucket !== 'park' && bucket !== 'kill') {
    missingProof.push('No post-launch measurement snapshot yet.');
  }

  if (dimensions.recency < 40) {
    missingProof.push('The strongest evidence looks stale.');
  }

  if (killRules.length > 0) {
    missingProof.push('Kill rules are present and should stay visible in the comparison.');
  }

  return [...new Set(missingProof)].slice(0, 4);
}

function buildReason(
  bucket: PortfolioBucket,
  dimensions: PortfolioDimensionScores,
  killRules: string[],
  missingProof: string[],
): string {
  if (bucket === 'kill') {
    return killRules[0] ?? 'Stored kill evidence outweighs the rest of the portfolio signals.';
  }

  const strongest = [
    dimensions.searchIntentStrength >= 45 ? 'search-language evidence' : null,
    dimensions.paymentSignalStrength >= 45 ? 'payment behavior or pricing proof' : null,
    dimensions.recency >= 60 ? 'recent evidence' : null,
  ].filter(Boolean) as string[];
  const strongestText = strongest.length > 0 ? strongest.join(', ') : 'stored evidence';

  const weakest = missingProof[0] ?? 'missing proof is limited';

  if (bucket === 'test_next') {
    return `${strongestText} make this the strongest candidate for the next validation cycle, but ${weakest}.`;
  }

  if (bucket === 'validate_deeper') {
    return `${strongestText} are promising, but ${weakest}.`;
  }

  if (bucket === 'watch') {
    return `There is some signal, but ${weakest}, so this idea should wait for fresher evidence.`;
  }

  return `The current evidence is too thin and ${weakest}.`;
}

function chooseBestNextAction(bucket: PortfolioBucket, missingProof: string[]): string {
  switch (bucket) {
    case 'kill':
      return 'Stop spending validation time here and archive this idea unless new evidence appears.';
    case 'test_next':
      return 'Run the cheapest payment-intent test that can confirm willingness to pay.';
    case 'validate_deeper':
      if (missingProof.some((item) => item.includes('payment-click') || item.includes('pricing'))) {
        return 'Run one focused payment-intent test before building anything larger.';
      }
      if (missingProof.some((item) => item.includes('competitor'))) {
        return 'Collect one competitor review or pricing comparison before the next build decision.';
      }
      return 'Collect one more direct customer complaint source and re-check the decision.';
    case 'watch':
      return 'Hold this idea and wait for fresh evidence before spending another test cycle.';
    case 'park':
      return 'Park this idea and revisit it only if a new evidence signal appears.';
    default:
      return 'Review the stored evidence and decide the next validation step.';
  }
}

function estimateCostToTest(bucket: PortfolioBucket): string {
  switch (bucket) {
    case 'test_next':
      return 'low, about 1-2 days';
    case 'validate_deeper':
      return 'low-medium, about 1 day';
    case 'watch':
      return 'hold for now';
    case 'park':
      return 'none';
    case 'kill':
      return 'none';
    default:
      return 'unknown';
  }
}

function computePortfolioScore(dimensions: PortfolioDimensionScores): number {
  const weighted =
    dimensions.evidenceStrength * 0.24
    + dimensions.searchIntentStrength * 0.18
    + dimensions.paymentSignalStrength * 0.18
    + dimensions.technicalSimplicity * 0.10
    + dimensions.trustSupportSimplicity * 0.10
    + dimensions.testCostEase * 0.10
    + dimensions.decisionClarity * 0.05
    + dimensions.recency * 0.05;

  return Math.round(weighted);
}

function scoreIntentLanguage(snapshot: PortfolioIdeaSnapshot): number {
  const counts = {
    comparison: snapshot.predictions.filter((prediction) => prediction.intent === 'comparison intent').length,
    highPurchase: snapshot.predictions.filter((prediction) => prediction.intent === 'high purchase intent').length,
    howTo: snapshot.predictions.filter((prediction) => prediction.intent === 'how-to intent').length,
    low: snapshot.predictions.filter((prediction) => prediction.intent === 'low intent').length,
    problem: snapshot.predictions.filter((prediction) => prediction.intent === 'problem intent').length,
  };

  return (
    counts.highPurchase * 18
    + counts.comparison * 15
    + counts.problem * 12
    + counts.howTo * 6
    + counts.low * 2
  );
}

function averagePredictionConfidence(snapshot: PortfolioIdeaSnapshot): number {
  if (snapshot.predictions.length === 0) {
    return 0;
  }

  const total = snapshot.predictions.reduce((sum, prediction) => sum + prediction.confidence_score, 0);
  return total / snapshot.predictions.length;
}

function scorePaymentSignals(snapshot: PortfolioIdeaSnapshot): number {
  const directPaymentEvidence = snapshot.evidence.filter((item) => item.payment_signal && item.payment_signal !== 'none');
  const paymentClicks = snapshot.latestMeasurementMetrics?.funnel.paymentClick ?? 0;
  const competitorPricing = snapshot.competitors.filter((item) => Boolean(item.price_text)).length;
  const scoreDecision = snapshot.latestScore?.decision ?? '';
  const experimentDecision = snapshot.latestExperimentDecision?.decision ?? '';

  return (
    directPaymentEvidence.reduce((sum, item) => sum + (item.payment_signal === 'direct' ? 18 : 10), 0)
    + Math.min(paymentClicks, 3) * 12
    + competitorPricing * 8
    + (scoreDecision === 'build_mvp' ? 18 : scoreDecision === 'validate deeper' ? 6 : 0)
    + (experimentDecision === 'build_mvp' ? 16 : experimentDecision === 'kill' ? -10 : 0)
  );
}

function scoreTechnicalSimplicity(snapshot: PortfolioIdeaSnapshot): number {
  const text = `${snapshot.idea.title} ${snapshot.idea.raw_description} ${snapshot.idea.platform ?? ''}`.toLowerCase();
  const penalty = COMPLEXITY_KEYWORDS.reduce((sum, keyword) => sum + (text.includes(keyword) ? 8 : 0), 0);
  const platformBonus = snapshot.idea.platform ? 5 : 0;

  return 72 + platformBonus - penalty;
}

function scoreTrustSupportSimplicity(snapshot: PortfolioIdeaSnapshot): number {
  const text = `${snapshot.idea.title} ${snapshot.idea.raw_description} ${snapshot.idea.business_model ?? ''}`.toLowerCase();
  const penalty = TRUST_BURDEN_KEYWORDS.reduce((sum, keyword) => sum + (text.includes(keyword) ? 7 : 0), 0);
  return 78 - penalty;
}

function scoreTestCostEase(
  snapshot: PortfolioIdeaSnapshot,
  evidenceStrength: number,
  paymentSignalStrength: number,
  trustSupportSimplicity: number,
  recency: number,
): number {
  let score = 35;

  if (snapshot.latestValidationReport) {
    score += 10;
  }

  if (snapshot.latestPaymentTestReport) {
    score += 18;
  }

  if (snapshot.latestMeasurementSnapshot) {
    score += 10;
  }

  if (paymentSignalStrength >= 40) {
    score += 12;
  }

  if (evidenceStrength >= 65) {
    score += 8;
  }

  if (trustSupportSimplicity < 45) {
    score -= 10;
  }

  if (recency < 40) {
    score -= 5;
  }

  return score;
}

function scoreRecency(latestEvidenceAt: string | null, generatedAt: string): number {
  if (!latestEvidenceAt) {
    return 15;
  }

  const ageDays = Math.max(0, (Date.parse(generatedAt) - Date.parse(latestEvidenceAt)) / 86_400_000);

  if (ageDays <= 7) {
    return 100;
  }

  if (ageDays <= 30) {
    return 82;
  }

  if (ageDays <= 90) {
    return 60;
  }

  if (ageDays <= 180) {
    return 35;
  }

  return 15;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
