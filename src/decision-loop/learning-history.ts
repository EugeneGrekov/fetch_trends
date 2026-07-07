import type { DecisionLoopInput, LearningHistoryItem } from './types.js';

export function buildLearningHistory(input: DecisionLoopInput): LearningHistoryItem[] {
  const items: LearningHistoryItem[] = [
    {
      detail: input.idea.raw_description,
      occurredAt: input.idea.created_at,
      referenceId: input.idea.id,
      referenceType: 'idea',
      title: 'Idea created',
    },
  ];

  const predictions = input.predictions ?? [];
  if (predictions.length > 0) {
    items.push({
      detail: `${predictions.length} autocomplete predictions stored.`,
      occurredAt: earliest(predictions.map((prediction) => prediction.created_at)),
      referenceType: 'autocomplete_predictions',
      title: 'Autocomplete evidence stored',
    });
  }

  const evidence = input.evidence ?? [];
  if (evidence.length > 0) {
    items.push({
      detail: `${evidence.length} quote-backed evidence rows stored.`,
      occurredAt: earliest(evidence.map((row) => row.created_at)),
      referenceType: 'evidence',
      title: 'External evidence stored',
    });
  }

  if (input.latestScore) {
    items.push({
      detail: `Score ${input.latestScore.total_score}/100 with decision "${input.latestScore.decision}".`,
      occurredAt: input.latestScore.created_at,
      referenceId: input.latestScore.id,
      referenceType: 'score',
      title: 'Validation score recorded',
    });
  }

  for (const report of input.reports ?? []) {
    items.push({
      detail: report.report_type,
      occurredAt: report.created_at,
      referenceId: report.id,
      referenceType: 'report',
      title: reportTitle(report.report_type),
    });
  }

  if (input.experiment) {
    items.push({
      detail: `${input.experiment.experiment_type}: ${input.experiment.title}`,
      occurredAt: input.experiment.created_at,
      referenceId: input.experiment.id,
      referenceType: 'experiment',
      title: 'Experiment created',
    });

    if (input.experiment.launched_at) {
      items.push({
        detail: input.experiment.title,
        occurredAt: input.experiment.launched_at,
        referenceId: input.experiment.id,
        referenceType: 'experiment',
        title: 'Experiment launched',
      });
    }
  }

  if (input.measurementMetrics && input.measurementMetrics.totalEvents > 0) {
    items.push({
      detail: `${input.measurementMetrics.totalEvents} behavior events recorded across ${input.measurementMetrics.visitors} visitors.`,
      occurredAt: input.measurementMetrics.lastEventAt ?? input.measurementMetrics.firstEventAt ?? input.idea.updated_at,
      referenceId: input.experiment?.id,
      referenceType: 'experiment_events',
      title: 'Events recorded',
    });
  }

  if (input.measurementSnapshot) {
    items.push({
      detail: 'Measurement metrics and threshold results stored.',
      occurredAt: input.measurementSnapshot.created_at,
      referenceId: input.measurementSnapshot.id,
      referenceType: 'measurement_snapshot',
      title: 'Measurement snapshot stored',
    });
  }

  for (const decision of input.priorDecisions ?? []) {
    items.push({
      detail: `${decision.decision}: ${decision.reason}`,
      occurredAt: decision.created_at,
      referenceId: decision.id,
      referenceType: 'idea_decision',
      title: 'Decision recorded',
    });
  }

  return items.sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt) || left.title.localeCompare(right.title),
  );
}

function reportTitle(reportType: string): string {
  if (reportType === 'search-language-validation') {
    return 'Validation report stored';
  }

  if (reportType === 'payment_test_spec') {
    return 'Payment-test spec stored';
  }

  if (reportType === 'seo_plan') {
    return 'SEO plan stored';
  }

  if (reportType === 'measurement_report') {
    return 'Measurement report stored';
  }

  if (reportType === 'decision_memo') {
    return 'Decision memo stored';
  }

  return 'Report stored';
}

function earliest(values: string[]): string {
  return [...values].sort()[0] ?? new Date(0).toISOString();
}
