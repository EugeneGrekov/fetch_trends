import type { DecisionLoopInput, DecisionLoopOutput, DecisionMemo, LearningHistoryItem, PivotOption } from './types.js';

export function buildDecisionMemo(input: DecisionLoopInput, output: DecisionLoopOutput): DecisionMemo {
  return {
    json: {
      confidence: output.confidence,
      decision: output.decision,
      evidence: output.evidence,
      experimentId: input.experiment?.id ?? null,
      ideaId: input.idea.id,
      learningHistory: output.learningHistory,
      missingProof: output.missingProof,
      nextAction: output.nextAction,
      pivotOptions: output.pivotOptions,
      priorDecisions: (input.priorDecisions ?? []).map((decision) => ({
        createdAt: decision.created_at,
        decision: decision.decision,
        id: decision.id,
        reason: decision.reason,
      })),
      reason: output.reason,
      whatWouldChangeDecision: output.whatWouldChangeDecision,
    },
    markdown: renderDecisionMemo(input, output),
  };
}

function renderDecisionMemo(input: DecisionLoopInput, output: DecisionLoopOutput): string {
  const metrics = input.measurementMetrics;

  return [
    '# Decision Memo',
    '',
    'This memo turns stored validation and measurement evidence into one conservative next action.',
    '',
    '## Current Idea',
    '',
    `- Idea ID: ${input.idea.id}`,
    `- Title: ${input.idea.title}`,
    `- Target market: ${input.idea.target_market ?? 'Unknown'}`,
    `- Platform: ${input.idea.platform ?? 'Unknown'}`,
    `- Business model: ${input.idea.business_model ?? 'Unknown'}`,
    `- Experiment ID: ${input.experiment?.id ?? 'None'}`,
    '',
    '## Evidence Summary',
    '',
    ...(output.evidence.length > 0
      ? output.evidence.map((item) => `- ${item.source}: ${item.detail}`)
      : ['- No evidence basis was available.']),
    '',
    '## Measurement Summary',
    '',
    ...(metrics
      ? [
          `- Visitors: ${metrics.visitors}`,
          `- Total events: ${metrics.totalEvents}`,
          `- CTA clicks: ${metrics.funnel.ctaClick}`,
          `- Payment clicks: ${metrics.funnel.paymentClick}`,
          `- Email submissions: ${metrics.funnel.emailSubmit}`,
          `- Replies: ${metrics.funnel.replyReceived}`,
        ]
      : ['- No measurement metrics are available.']),
    '',
    '## Decision',
    '',
    `- Decision: ${output.decision}`,
    `- Confidence: ${output.confidence}`,
    `- Reason: ${output.reason}`,
    '',
    '## Prior Decisions',
    '',
    ...(input.priorDecisions && input.priorDecisions.length > 0
      ? input.priorDecisions.map((decision) =>
        `- ${decision.created_at}: ${decision.decision} (${decision.confidence}) - ${decision.reason}`,
      )
      : ['- No prior decisions recorded for this idea.']),
    '',
    '## Pivot Options',
    '',
    ...renderPivotOptions(output.pivotOptions),
    '',
    '## Single Next Action',
    '',
    `- ${output.nextAction}`,
    '',
    '## What Would Change The Decision',
    '',
    ...renderList(output.whatWouldChangeDecision, 'A complete measurement window with explicit thresholds.'),
    '',
    '## Missing Proof',
    '',
    ...renderList(output.missingProof, 'No major missing proof was recorded.'),
    '',
    '## Learning History',
    '',
    ...renderLearningHistory(output.learningHistory),
    '',
  ].join('\n');
}

function renderPivotOptions(options: PivotOption[]): string[] {
  if (options.length === 0) {
    return ['- No pivot options generated for this decision.'];
  }

  return options.flatMap((option) => [
    `- ${option.type}: ${option.exactCustomer} needs "${option.exactPain}".`,
    `  Evidence: ${option.whyOriginalEvidencePointsThere}`,
    `  Missing: ${option.missingEvidence}`,
    `  Experiment: ${option.nextExperiment}`,
  ]);
}

function renderLearningHistory(items: LearningHistoryItem[]): string[] {
  if (items.length === 0) {
    return ['- No learning history is available.'];
  }

  return items.map((item) => `- ${item.occurredAt}: ${item.title} - ${item.detail}`);
}

function renderList(items: string[], emptyState: string): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${emptyState}`];
}
