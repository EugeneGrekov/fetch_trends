import type { MeasurementReport, MeasurementReportInput } from './types.js';

export function buildMeasurementReport(input: MeasurementReportInput): MeasurementReport {
  const json: MeasurementReport['json'] = {
    createdAt: input.createdAt,
    decision: input.recommendation.decision,
    events: {
      firstEventAt: input.metrics.firstEventAt,
      imported: input.events.length,
      lastEventAt: input.metrics.lastEventAt,
    },
    experiment: {
      id: input.experiment.id,
      ideaId: input.experiment.idea_id,
      reportId: input.experiment.report_id,
      status: input.experiment.status,
      title: input.experiment.title,
      type: input.experiment.experiment_type,
    },
    metrics: input.metrics,
    recommendation: input.recommendation,
    thresholdResults: input.thresholdResults,
  };

  return {
    json,
    markdown: renderMeasurementMarkdown(input),
  };
}

function renderMeasurementMarkdown(input: MeasurementReportInput): string {
  const { experiment, metrics, recommendation, thresholdResults } = input;

  return [
    '# Measurement Report',
    '',
    'This report evaluates recorded behavior from a launched validation experiment. It does not prove demand size or guaranteed willingness to pay.',
    '',
    '## Experiment',
    '',
    `- Experiment ID: ${experiment.id}`,
    `- Idea ID: ${experiment.idea_id}`,
    `- Source report ID: ${experiment.report_id ?? 'none'}`,
    `- Type: ${experiment.experiment_type}`,
    `- Title: ${experiment.title}`,
    `- Status: ${experiment.status}`,
    `- Created: ${experiment.created_at}`,
    `- Launched: ${experiment.launched_at ?? 'not recorded'}`,
    `- Completed: ${experiment.completed_at ?? 'not recorded'}`,
    '',
    '## Recommendation',
    '',
    `- Decision: ${recommendation.decision}`,
    `- Reason: ${recommendation.reason}`,
    '',
    '## Event Totals',
    '',
    `- Total events: ${metrics.totalEvents}`,
    `- First event: ${metrics.firstEventAt ?? 'none'}`,
    `- Last event: ${metrics.lastEventAt ?? 'none'}`,
    `- Visitors: ${metrics.visitors}`,
    `- Page views: ${metrics.funnel.pageView}`,
    `- Pricing views: ${metrics.funnel.pricingView}`,
    `- CTA clicks: ${metrics.funnel.ctaClick}`,
    `- Preview starts: ${metrics.funnel.previewStart}`,
    `- Preview completions: ${metrics.funnel.previewComplete}`,
    `- Checkout starts: ${metrics.funnel.checkoutStart}`,
    `- Payment clicks: ${metrics.funnel.paymentClick}`,
    `- Email submissions: ${metrics.funnel.emailSubmit}`,
    `- Replies received: ${metrics.funnel.replyReceived}`,
    `- Refund requests: ${metrics.funnel.refundRequested}`,
    `- Support contacts: ${metrics.funnel.supportContact}`,
    '',
    '## Funnel Rates',
    '',
    `- CTA click rate: ${formatRate(metrics.rates.ctaClickRate)}`,
    `- Preview-start rate: ${formatRate(metrics.rates.previewStartRate)}`,
    `- Preview-complete rate: ${formatRate(metrics.rates.previewCompleteRate)}`,
    `- Checkout-start rate: ${formatRate(metrics.rates.checkoutStartRate)}`,
    `- Payment-click rate: ${formatRate(metrics.rates.paymentClickRate)}`,
    `- Email-submit rate: ${formatRate(metrics.rates.emailSubmitRate)}`,
    `- Reply rate: ${formatRate(metrics.rates.replyRate)}`,
    `- Refund rate: ${formatRate(metrics.rates.refundRate)}`,
    `- Support-contact rate: ${formatRate(metrics.rates.supportContactRate)}`,
    '',
    '## Threshold Comparison',
    '',
    ...thresholdResults.flatMap((result) => [
      `### ${result.signal}`,
      '',
      `- Classification: ${result.classification}`,
      `- Condition: ${result.condition}`,
      `- Rationale: ${result.rationale ?? 'None recorded.'}`,
      `- Evidence: ${result.evidence.join('; ')}`,
      ...(result.missingData.length > 0
        ? [`- Missing data: ${result.missingData.join('; ')}`]
        : ['- Missing data: none for this threshold.']),
      '',
    ]),
    '## Strong Signals',
    '',
    ...renderList(recommendation.strongSignals, 'No strong behavior signals met the stored thresholds.'),
    '',
    '## Weak Signals',
    '',
    ...renderList(recommendation.weakSignals, 'No weak behavior signals met the stored thresholds.'),
    '',
    '## Kill Signals',
    '',
    ...renderList(recommendation.killSignals, 'No kill threshold was met.'),
    '',
    '## Missing Data',
    '',
    ...renderList(recommendation.missingData, 'No missing data warnings were recorded.'),
    '',
  ].join('\n');
}

function renderList(items: string[], emptyState: string): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${emptyState}`];
}

function formatRate(value: number | null): string {
  if (value == null) {
    return 'n/a';
  }

  return `${(value * 100).toFixed(2)}%`;
}
