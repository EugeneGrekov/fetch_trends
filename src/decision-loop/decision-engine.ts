import type { MeasurementMetrics, MeasurementRecommendation, ThresholdEvaluationResult } from '../measurement/types.js';
import { buildLearningHistory } from './learning-history.js';
import { generateNextAction } from './next-experiment.js';
import { generatePivotOptions, hasPivotSupport } from './pivot-generator.js';
import type {
  DecisionConfidence,
  DecisionEvidenceItem,
  DecisionLoopDecision,
  DecisionLoopInput,
  DecisionLoopOutput,
} from './types.js';

export function evaluateDecisionLoop(input: DecisionLoopInput): DecisionLoopOutput {
  const preliminary = chooseDecision(input);
  const pivotOptions = preliminary.decision === 'pivot' ? generatePivotOptions(input) : [];
  const outputWithoutAction = {
    ...preliminary,
    evidence: buildEvidenceBasis(input),
    learningHistory: buildLearningHistory(input),
    missingProof: buildMissingProof(input),
    pivotOptions,
    whatWouldChangeDecision: whatWouldChangeDecision(preliminary.decision),
  };

  return {
    ...outputWithoutAction,
    nextAction: generateNextAction({
      decision: preliminary.decision,
      input,
      pivotOptions,
    }),
  };
}

function chooseDecision(input: DecisionLoopInput): {
  confidence: DecisionConfidence;
  decision: DecisionLoopDecision;
  reason: string;
} {
  const metrics = input.measurementMetrics ?? null;
  const thresholdResults = input.thresholdResults ?? [];
  const recommendation = input.measurementRecommendation ?? null;

  if (!input.experiment) {
    return {
      confidence: 'low',
      decision: 'inconclusive',
      reason: 'No experiment is linked to this idea yet, so there is no behavior evidence for a pivot/persevere decision.',
    };
  }

  if (!metrics || metrics.totalEvents === 0) {
    return {
      confidence: 'low',
      decision: 'inconclusive',
      reason: 'No behavior events have been recorded for the selected experiment.',
    };
  }

  if (thresholdResults.length === 0) {
    return {
      confidence: 'low',
      decision: 'inconclusive',
      reason: 'No threshold comparison is available for the selected experiment.',
    };
  }

  const visitorFloor = minimumVisitorFloor(thresholdResults);
  if (visitorFloor != null && metrics.visitors < visitorFloor) {
    return {
      confidence: 'low',
      decision: 'inconclusive',
      reason: `Only ${metrics.visitors} visitors are recorded; the lowest stored visitor threshold is ${visitorFloor}.`,
    };
  }

  if (hasKillSignal(recommendation, thresholdResults)) {
    return {
      confidence: 'high',
      decision: 'kill',
      reason: 'Recorded behavior met a stored kill threshold after the minimum sample requirement was satisfied.',
    };
  }

  if (hasStrongSignal(recommendation, thresholdResults)) {
    return {
      confidence: 'high',
      decision: 'build_mvp',
      reason: 'Recorded behavior met a stored strong-signal threshold after the minimum sample requirement was satisfied.',
    };
  }

  if (shouldPivot(input, metrics, thresholdResults)) {
    return {
      confidence: 'medium',
      decision: 'pivot',
      reason: 'The experiment has engagement but no payment-intent or reply behavior, while stored validation evidence points to a narrower segment or use case.',
    };
  }

  if (shouldPersevere(input, metrics, thresholdResults, recommendation)) {
    return {
      confidence: 'medium',
      decision: 'persevere',
      reason: 'The experiment has engagement and has passed the first sample floor, but it has not yet reached the strongest decision threshold.',
    };
  }

  if (shouldValidateDeeper(metrics, thresholdResults, recommendation)) {
    return {
      confidence: 'medium',
      decision: 'validate_deeper',
      reason: 'Recorded behavior is weak but non-empty, so the next decision needs more qualitative proof before building or killing.',
    };
  }

  return {
    confidence: 'low',
    decision: 'inconclusive',
    reason: 'Behavior is not strong enough to build, does not clearly support a pivot, and does not meet a kill threshold.',
  };
}

function shouldPivot(
  input: DecisionLoopInput,
  metrics: MeasurementMetrics,
  thresholdResults: ThresholdEvaluationResult[],
): boolean {
  const killFloor = thresholdResults.find((result) => result.signal === 'kill')?.requirements.visitorFloor;
  const enoughForKillRead = killFloor == null || metrics.visitors >= killFloor;
  const hasEngagement = metrics.funnel.ctaClick > 0 || metrics.funnel.pricingView > 0 || metrics.funnel.previewStart > 0;
  const noCommitment = metrics.funnel.paymentClick === 0
    && metrics.funnel.replyReceived === 0
    && metrics.funnel.checkoutStart === 0;

  return enoughForKillRead && hasEngagement && noCommitment && hasPivotSupport(input);
}

function shouldPersevere(
  input: DecisionLoopInput,
  metrics: MeasurementMetrics,
  thresholdResults: ThresholdEvaluationResult[],
  recommendation: MeasurementRecommendation | null,
): boolean {
  const highestFloor = maximumVisitorFloor(thresholdResults);
  const hasEngagement = metrics.funnel.ctaClick > 0
    || metrics.funnel.emailSubmit > 0
    || metrics.funnel.paymentClick > 0
    || metrics.funnel.replyReceived > 0;

  return hasEngagement
    && (
      recommendation?.decision === 'continue_test'
      || (highestFloor != null && metrics.visitors < highestFloor)
      || (input.experiment?.status === 'running' && metrics.funnel.paymentClick > 0)
    );
}

function shouldValidateDeeper(
  metrics: MeasurementMetrics,
  thresholdResults: ThresholdEvaluationResult[],
  recommendation: MeasurementRecommendation | null,
): boolean {
  const weakSignal = recommendation?.decision === 'validate_deeper'
    || thresholdResults.some((result) => result.classification === 'weak_signal');
  const hasFollowUp = metrics.funnel.paymentClick > 0
    || metrics.funnel.emailSubmit > 0
    || metrics.funnel.replyReceived > 0;

  return weakSignal && hasFollowUp;
}

function hasKillSignal(
  recommendation: MeasurementRecommendation | null,
  thresholdResults: ThresholdEvaluationResult[],
): boolean {
  return recommendation?.decision === 'kill'
    || thresholdResults.some((result) => result.classification === 'kill_signal');
}

function hasStrongSignal(
  recommendation: MeasurementRecommendation | null,
  thresholdResults: ThresholdEvaluationResult[],
): boolean {
  return recommendation?.decision === 'build_mvp'
    || thresholdResults.some((result) => result.classification === 'strong_signal');
}

function buildEvidenceBasis(input: DecisionLoopInput): DecisionEvidenceItem[] {
  const items: DecisionEvidenceItem[] = [];
  const metrics = input.measurementMetrics;

  if (metrics) {
    items.push({
      detail: `${metrics.visitors} visitors, ${metrics.funnel.ctaClick} CTA clicks, ${metrics.funnel.paymentClick} payment clicks, ${metrics.funnel.replyReceived} replies.`,
      referenceId: input.experiment?.id,
      referenceType: 'experiment',
      source: 'measurement',
    });
  }

  for (const result of input.thresholdResults ?? []) {
    if (result.classification !== 'inconclusive') {
      items.push({
        detail: `${result.signal} threshold classified as ${result.classification}: ${result.evidence.join('; ')}.`,
        referenceType: 'threshold',
        source: 'threshold_evaluator',
      });
    }
  }

  if (input.latestScore) {
    items.push({
      detail: `Latest validation score is ${input.latestScore.total_score}/100 with decision "${input.latestScore.decision}".`,
      referenceId: input.latestScore.id,
      referenceType: 'score',
      source: 'validation_score',
    });
  }

  for (const prediction of (input.predictions ?? []).slice(0, 3)) {
    items.push({
      detail: `${prediction.prediction} (${prediction.intent}, confidence ${prediction.confidence_score}).`,
      referenceId: prediction.id,
      referenceType: 'autocomplete_prediction',
      source: 'autocomplete',
    });
  }

  for (const row of (input.evidence ?? []).slice(0, 3)) {
    items.push({
      detail: row.quote,
      referenceId: row.id,
      referenceType: 'evidence',
      source: row.pain_type ?? 'external_evidence',
    });
  }

  return items;
}

function buildMissingProof(input: DecisionLoopInput): string[] {
  return unique([
    ...(input.measurementRecommendation?.missingData ?? []),
    ...(input.measurementMetrics ? [] : ['No measurement metrics are available.']),
    ...(input.measurementSnapshot ? [] : ['No stored measurement snapshot is attached to this decision.']),
    ...(input.latestValidationReport ? [] : ['No search-language validation report is available.']),
    ...(input.latestPaymentTestReport ? [] : ['No payment-test spec is available.']),
    ...(input.latestSeoPlanReport ? [] : ['No SEO plan is available.']),
    ...((input.evidence ?? []).length > 0 ? [] : ['No quote-backed external evidence is stored for this idea.']),
  ]);
}

function whatWouldChangeDecision(decision: DecisionLoopDecision): string[] {
  if (decision === 'build_mvp') {
    return ['Refunds, support burden, or failed payment completion would move the decision back to validate_deeper or pivot.'];
  }

  if (decision === 'persevere') {
    return ['Meeting the strong threshold would change this to build_mvp; meeting the kill threshold would change this to kill.'];
  }

  if (decision === 'pivot') {
    return ['Payment-intent clicks or urgent replies from the original segment would change this away from pivot.'];
  }

  if (decision === 'validate_deeper') {
    return ['Quote-backed willingness-to-pay evidence would move this toward persevere or build_mvp.'];
  }

  if (decision === 'kill') {
    return ['A new test with strong payment-intent behavior from a materially different segment would reopen the idea.'];
  }

  return ['A complete measurement window that satisfies stored sample thresholds would change this decision.'];
}

function minimumVisitorFloor(results: ThresholdEvaluationResult[]): number | null {
  const floors = visitorFloors(results);
  return floors.length > 0 ? Math.min(...floors) : null;
}

function maximumVisitorFloor(results: ThresholdEvaluationResult[]): number | null {
  const floors = visitorFloors(results);
  return floors.length > 0 ? Math.max(...floors) : null;
}

function visitorFloors(results: ThresholdEvaluationResult[]): number[] {
  return results
    .map((result) => result.requirements.visitorFloor)
    .filter((floor): floor is number => floor != null);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
