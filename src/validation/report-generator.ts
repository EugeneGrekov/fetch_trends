import type { EvidenceSummaryOutput } from '../ai/types.js';
import type { IdeaRow, QueryRow } from '../db/schema.js';
import type { UniquePrediction } from '../utilities/autocomplete/types.js';
import type { ExternalEvidenceSummary } from './external-types.js';
import type { ValidationScore } from './types.js';

export function buildValidationMarkdownReport(args: {
  evidenceSummary: EvidenceSummaryOutput;
  external?: ExternalEvidenceSummary;
  idea: IdeaRow;
  nextAction?: string;
  queries: QueryRow[];
  predictions: UniquePrediction[];
  score: ValidationScore;
  verdict?: string;
}): string {
  const { evidenceSummary, external, idea, nextAction, queries, predictions, score, verdict } = args;
  const topPredictions = predictions.slice(0, 10);
  const strongPredictions = predictions.filter((prediction) =>
    prediction.intent === 'high purchase intent' || prediction.intent === 'comparison intent',
  );
  const problemPredictions = predictions.filter((prediction) => prediction.intent === 'problem intent');
  const weakPredictions = predictions.filter((prediction) => prediction.intent === 'low intent');
  const painEvidence = external?.evidence.slice(0, 8) ?? [];
  const competitorRows = external?.competitors.slice(0, 8) ?? [];
  const paymentEvidence = painEvidence.filter((item) => item.payment_signal && item.payment_signal !== 'none');
  const workaroundEvidence = painEvidence.filter((item) => item.workaround);
  const sourceRows = external?.sources.slice(0, 8) ?? [];

  return [
    '# Validation Report',
    '',
    'This report validates search language only. It does not prove demand size or willingness to pay.',
    '',
    '## Idea',
    '',
    `- Title: ${idea.title}`,
    `- Target market: ${idea.target_market ?? 'Unknown'}`,
    `- Platform: ${idea.platform ?? 'Unknown'}`,
    `- Business model: ${idea.business_model ?? 'Unknown'}`,
    '',
    '## Query Seeds',
    '',
    ...queries.map((query) => `- ${query.query}`),
    '',
    '## Top Autocomplete Predictions',
    '',
    ...(topPredictions.length > 0
      ? topPredictions.map((prediction) =>
        `- ${prediction.query} | ${prediction.intent} | confidence ${prediction.confidenceScore}`,
      )
      : ['- No autocomplete predictions were collected.']),
    '',
    '## Intent Breakdown',
    '',
    `- High purchase intent: ${score.breakdown.intentCounts['high purchase intent']}`,
    `- Comparison intent: ${score.breakdown.intentCounts['comparison intent']}`,
    `- Problem intent: ${score.breakdown.intentCounts['problem intent']}`,
    `- How-to intent: ${score.breakdown.intentCounts['how-to intent']}`,
    `- Low intent: ${score.breakdown.intentCounts['low intent']}`,
    '',
    '## Strongest High-Intent Queries',
    '',
    ...(strongPredictions.length > 0
      ? strongPredictions.slice(0, 8).map((prediction) =>
        `- ${prediction.query} | confidence ${prediction.confidenceScore}`,
      )
      : ['- No high-intent queries found yet.']),
    '',
    '## Problem-Intent Queries',
    '',
    ...(problemPredictions.length > 0
      ? problemPredictions.slice(0, 6).map((prediction) =>
        `- ${prediction.query} | confidence ${prediction.confidenceScore}`,
      )
      : ['- No clear problem-intent queries found yet.']),
    '',
    '## Weak Or Low-Intent Queries',
    '',
    ...(weakPredictions.length > 0
      ? weakPredictions.slice(0, 6).map((prediction) =>
        `- ${prediction.query} | confidence ${prediction.confidenceScore}`,
      )
      : ['- No weak queries surfaced in the current evidence set.']),
    '',
    '## Initial Score',
    '',
    `- Total score: ${score.totalScore}/100`,
    `- Decision: ${verdict ?? score.decision}`,
    `- Average confidence: ${score.breakdown.averageConfidence}`,
    `- Unique predictions: ${score.breakdown.uniquePredictionCount}`,
    '',
    '## Facts',
    '',
    ...renderList(evidenceSummary.facts, 'No direct autocomplete facts were extracted.'),
    '',
    '## Inferences',
    '',
    ...renderList(evidenceSummary.inferences, 'No evidence-backed inferences were extracted.'),
    '',
    '## Assumptions',
    '',
    ...renderList(evidenceSummary.assumptions, 'No explicit assumptions were recorded.'),
    '',
    '## Missing Proof',
    '',
    ...renderList(
      evidenceSummary.missingProof,
      'No demand-size estimate, competitor SERP analysis, community pain evidence, or pricing proof yet.',
    ),
    '',
    '## Red Flags',
    '',
    ...renderList(evidenceSummary.redFlags, 'No major red flags were extracted from the current evidence set.'),
    '',
    '## External Sources',
    '',
    ...(sourceRows.length > 0
      ? sourceRows.map((source) => `- [${source.source_type}] ${source.title ?? source.url} | ${source.url}`)
      : ['- No external sources were stored for this run.']),
    '',
    '## Pain Evidence',
    '',
    ...(painEvidence.length > 0
      ? painEvidence.map((item) => `- ${item.quote} | complaint ${item.complaint ?? 'unspecified'} | urgency ${item.urgency ?? 'unknown'}`)
      : ['- No quote-backed pain evidence was extracted yet.']),
    '',
    '## Workaround Evidence',
    '',
    ...(workaroundEvidence.length > 0
      ? workaroundEvidence.map((item) => `- ${item.workaround} | ${item.quote}`)
      : ['- No workaround evidence was extracted yet.']),
    '',
    '## Competitors',
    '',
    ...(competitorRows.length > 0
      ? competitorRows.map((item) => `- ${item.name} | ${item.product_type ?? 'unknown'} | ${item.price_text ?? 'price unknown'}`)
      : ['- No competitor records were stored yet.']),
    '',
    '## Payment Signals',
    '',
    ...(paymentEvidence.length > 0
      ? paymentEvidence.map((item) => `- ${item.quote} | payment signal ${item.payment_signal}`)
      : ['- No payment-proxy evidence was extracted yet.']),
    '',
    '## Evidence Gaps',
    '',
    ...renderList(buildExternalEvidenceGaps(external), 'No major external evidence gaps were recorded.'),
    '',
    '## Next Action',
    '',
    nextAction ?? defaultNextAction(score),
    '',
  ].join('\n');
}

export function buildDeterministicEvidenceSummary(args: {
  external?: ExternalEvidenceSummary;
  predictions: UniquePrediction[];
  queries: QueryRow[];
  score: ValidationScore;
}): EvidenceSummaryOutput {
  const { external, predictions, queries, score } = args;
  const highIntent = predictions.filter((prediction) =>
    prediction.intent === 'high purchase intent' || prediction.intent === 'comparison intent',
  );
  const problemIntent = predictions.filter((prediction) => prediction.intent === 'problem intent');
  const lowIntentCount = predictions.filter((prediction) => prediction.intent === 'low intent').length;
  const paymentEvidenceCount = external?.evidence.filter((item) => item.payment_signal && item.payment_signal !== 'none').length ?? 0;
  const competitorCount = external?.competitors.length ?? 0;
  const externalSourceCount = external?.sources.length ?? 0;
  const externalEvidenceCount = external?.evidence.length ?? 0;

  return {
    facts: [
      `Stored ${queries.length} seed queries for this validation job.`,
      `Collected ${predictions.length} unique autocomplete predictions.`,
      `Detected ${highIntent.length} high-intent or comparison-intent predictions.`,
      `Deterministic score is ${score.totalScore}/100 with decision "${score.decision}".`,
      ...(externalSourceCount > 0 ? [`Stored ${externalSourceCount} external sources and ${externalEvidenceCount} extracted evidence rows.`] : []),
      ...(competitorCount > 0 ? [`Stored ${competitorCount} competitor records.`] : []),
    ],
    inferences: [
      highIntent.length > 0
        ? 'Autocomplete language includes at least some solution-seeking or comparison language.'
        : 'Autocomplete language is not yet showing strong buying or comparison intent.',
      problemIntent.length > 0
        ? 'Some users appear to describe the problem directly rather than only naming a product.'
        : 'Problem-language evidence is still thin in the current autocomplete sample.',
      ...(externalEvidenceCount > 0
        ? ['External sources now add real complaint or workaround evidence beyond autocomplete phrasing.']
        : []),
    ],
    assumptions: [
      'Autocomplete reflects visible phrasing, not demand size or conversion intent.',
      externalSourceCount > 0
        ? 'External sources are still snippet-level evidence unless a full page fetch or deeper extraction is stored.'
        : 'The current evidence set is limited to Google Autocomplete in the configured market and language.',
    ],
    missingProof: [
      'No demand-size estimate yet.',
      ...(competitorCount === 0 ? ['No competitor page-one SERP analysis yet.'] : []),
      ...(externalEvidenceCount === 0 ? ['No Reddit, review, or support-channel problem evidence yet.'] : []),
      ...(paymentEvidenceCount === 0 ? ['No willingness-to-pay or pricing evidence yet.'] : []),
      ...buildExternalEvidenceGaps(external),
    ],
    redFlags: lowIntentCount > Math.max(3, Math.floor(predictions.length * 0.4))
      ? [
          'A large share of predictions still look low intent or navigational.',
          ...((external?.collectorRuns ?? [])
            .filter((run) => run.status === 'blocked' || run.status === 'failed')
            .map((run) => `${run.collector} collector did not complete cleanly.`)),
        ]
      : (external?.collectorRuns ?? [])
        .filter((run) => run.status === 'blocked' || run.status === 'failed')
        .map((run) => `${run.collector} collector did not complete cleanly.`),
  };
}

function defaultNextAction(score: ValidationScore): string {
  if (score.decision === 'validate deeper') {
    return '- Run competitor and pricing validation next.';
  }

  if (score.decision === 'promising but incomplete') {
    return '- Collect broader evidence before making a build decision.';
  }

  return '- Rework the positioning or idea phrasing before deeper validation.';
}

function renderList(items: string[], emptyState: string): string[] {
  if (items.length === 0) {
    return [`- ${emptyState}`];
  }

  return items.map((item) => `- ${item}`);
}

function buildExternalEvidenceGaps(external?: ExternalEvidenceSummary): string[] {
  if (!external?.enabled) {
    return ['External collectors were not enabled for this run.'];
  }

  const gaps = (external.collectorRuns ?? [])
    .filter((run) => run.status === 'skipped' || run.status === 'blocked' || run.status === 'failed')
    .map((run) => run.warning ?? `${run.collector} collector did not produce usable evidence.`);

  if (external.enabled && external.sources.length === 0) {
    gaps.push('No external source records were stored.');
  }

  return gaps;
}
