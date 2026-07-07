import type { AutocompletePredictionRow, EvidenceRow } from '../db/schema.js';
import type { DecisionLoopInput, PivotOption } from './types.js';

export function generatePivotOptions(input: DecisionLoopInput): PivotOption[] {
  if (!hasPivotSupport(input)) {
    return [];
  }

  const customer = exactCustomer(input);
  const pain = exactPain(input);
  const problemPrediction = selectProblemPrediction(input.predictions ?? []);
  const evidence = selectPainEvidence(input.evidence ?? []);
  const options: PivotOption[] = [
    {
      exactCustomer: customer,
      exactPain: pain,
      missingEvidence: `Proof that ${customer} will click or pay for this narrower promise.`,
      nextExperiment: `Launch a landing page for ${customer} focused only on "${pain}".`,
      type: 'narrower_customer',
      whyOriginalEvidencePointsThere: evidence
        ? `Stored evidence says "${truncate(evidence.quote, 120)}".`
        : `Search language points to "${problemPrediction?.prediction ?? input.idea.title}".`,
    },
  ];

  if (problemPrediction) {
    options.push({
      exactCustomer: customer,
      exactPain: problemPrediction.prediction,
      missingEvidence: 'Behavioral proof that this exact query converts into a payment-intent action.',
      nextExperiment: `Create one landing page matching the query "${problemPrediction.prediction}".`,
      type: 'narrower_use_case',
      whyOriginalEvidencePointsThere: `Autocomplete stored "${problemPrediction.prediction}" as ${problemPrediction.intent}.`,
    });
  }

  const metrics = input.measurementMetrics;
  if (metrics && metrics.funnel.ctaClick > 0 && metrics.funnel.paymentClick === 0) {
    options.push({
      exactCustomer: customer,
      exactPain: pain,
      missingEvidence: 'Proof that users continue from the promise into payment intent after seeing a concrete preview.',
      nextExperiment: `Move the payment ask after a preview for "${pain}".`,
      type: 'different_payment_moment',
      whyOriginalEvidencePointsThere: `${metrics.funnel.ctaClick} CTA clicks but ${metrics.funnel.paymentClick} payment clicks suggest interest before commitment.`,
    });
  }

  const sourceBacked = evidence?.trigger ?? evidence?.workaround ?? evidence?.complaint;
  if (sourceBacked) {
    options.push({
      exactCustomer: customer,
      exactPain: pain,
      missingEvidence: 'Proof that the same pain converts when reached through the source where the complaint appears.',
      nextExperiment: `Test one distribution post around "${truncate(sourceBacked, 90)}".`,
      type: 'different_distribution_channel',
      whyOriginalEvidencePointsThere: `Stored external evidence names "${truncate(sourceBacked, 120)}".`,
    });
  }

  return dedupeByType(options).slice(0, 3);
}

export function hasPivotSupport(input: DecisionLoopInput): boolean {
  const evidence = input.evidence ?? [];
  const predictions = input.predictions ?? [];
  return evidence.some(hasPainSignal)
    || predictions.some((prediction) => prediction.intent === 'problem intent' || prediction.intent === 'comparison intent');
}

function exactCustomer(input: DecisionLoopInput): string {
  return firstNonEmpty([
    input.idea.target_market,
    parseNormalizedField(input.idea.normalized_json, 'targetMarket'),
    parseNormalizedField(input.idea.normalized_json, 'target_market'),
    input.evidence?.find((row) => row.trigger)?.trigger,
  ]) ?? `people searching for ${input.idea.title}`;
}

function exactPain(input: DecisionLoopInput): string {
  const evidence = selectPainEvidence(input.evidence ?? []);
  return firstNonEmpty([
    evidence?.complaint,
    evidence?.trigger,
    evidence?.pain_type,
    selectProblemPrediction(input.predictions ?? [])?.prediction,
    input.idea.raw_description,
  ]) ?? input.idea.title;
}

function selectPainEvidence(evidence: EvidenceRow[]): EvidenceRow | undefined {
  return evidence.find((row) => row.complaint || row.trigger || row.workaround || row.urgency === 'high')
    ?? evidence[0];
}

function selectProblemPrediction(predictions: AutocompletePredictionRow[]): AutocompletePredictionRow | undefined {
  return predictions.find((prediction) => prediction.intent === 'problem intent')
    ?? predictions.find((prediction) => prediction.intent === 'comparison intent')
    ?? predictions.find((prediction) => prediction.intent === 'high purchase intent');
}

function hasPainSignal(row: EvidenceRow): boolean {
  return Boolean(row.complaint || row.trigger || row.workaround || row.payment_signal);
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function parseNormalizedField(value: string | null, field: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const candidate = parsed[field];
    return typeof candidate === 'string' ? candidate : null;
  } catch {
    return null;
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function dedupeByType(options: PivotOption[]): PivotOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.type)) {
      return false;
    }

    seen.add(option.type);
    return true;
  });
}
