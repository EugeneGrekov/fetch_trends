import type { DecisionLoopDecision, DecisionLoopInput, PivotOption } from './types.js';

export interface NextActionInput {
  decision: DecisionLoopDecision;
  input: DecisionLoopInput;
  pivotOptions: PivotOption[];
}

export function generateNextAction(args: NextActionInput): string {
  const { decision, input, pivotOptions } = args;

  if (decision === 'build_mvp') {
    return `Build a paid-preview MVP for "${input.idea.title}" that captures payment intent before fulfillment.`;
  }

  if (decision === 'persevere') {
    return `Continue "${input.experiment?.title ?? input.idea.title}" until ${targetVisitorCount(input)} targeted visitors are recorded.`;
  }

  if (decision === 'pivot') {
    const pivot = pivotOptions[0];
    if (pivot) {
      return `Create one landing-page test for ${pivot.exactCustomer} around "${pivot.exactPain}".`;
    }

    return `Create one narrower landing-page test for "${input.idea.title}".`;
  }

  if (decision === 'validate_deeper') {
    return `Collect five quote-backed complaints for the strongest use case of "${input.idea.title}".`;
  }

  if (decision === 'kill') {
    return `Archive "${input.idea.title}" with the recorded kill reason.`;
  }

  if (input.experiment) {
    return `Run "${input.experiment.title}" until ${targetVisitorCount(input)} targeted visitors are recorded.`;
  }

  return `Create one payment-intent experiment for "${input.idea.title}" with explicit strong, weak, and kill thresholds.`;
}

function targetVisitorCount(input: DecisionLoopInput): number {
  const floors = (input.thresholdResults ?? [])
    .map((result) => result.requirements.visitorFloor)
    .filter((floor): floor is number => floor != null);

  if (floors.length === 0) {
    return Math.max(input.measurementMetrics?.visitors ?? 0, 100);
  }

  return Math.max(...floors);
}
