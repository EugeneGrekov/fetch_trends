import type { EvidenceSummaryOutput } from '../ai/types.js';
import type { IdeaRow, QueryRow } from '../db/schema.js';
import type { UniquePrediction } from '../utilities/autocomplete/types.js';
import type { ValidationScore } from './types.js';

export function buildValidationMarkdownReport(args: {
  evidenceSummary: EvidenceSummaryOutput;
  idea: IdeaRow;
  nextAction?: string;
  queries: QueryRow[];
  predictions: UniquePrediction[];
  score: ValidationScore;
  verdict?: string;
}): string {
  const { evidenceSummary, idea, nextAction, queries, predictions, score, verdict } = args;
  const topPredictions = predictions.slice(0, 10);
  const strongPredictions = predictions.filter((prediction) =>
    prediction.intent === 'high purchase intent' || prediction.intent === 'comparison intent',
  );
  const problemPredictions = predictions.filter((prediction) => prediction.intent === 'problem intent');
  const weakPredictions = predictions.filter((prediction) => prediction.intent === 'low intent');

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
    '## Next Action',
    '',
    nextAction ?? defaultNextAction(score),
    '',
  ].join('\n');
}

export function buildDeterministicEvidenceSummary(args: {
  predictions: UniquePrediction[];
  queries: QueryRow[];
  score: ValidationScore;
}): EvidenceSummaryOutput {
  const { predictions, queries, score } = args;
  const highIntent = predictions.filter((prediction) =>
    prediction.intent === 'high purchase intent' || prediction.intent === 'comparison intent',
  );
  const problemIntent = predictions.filter((prediction) => prediction.intent === 'problem intent');
  const lowIntentCount = predictions.filter((prediction) => prediction.intent === 'low intent').length;

  return {
    facts: [
      `Stored ${queries.length} seed queries for this validation job.`,
      `Collected ${predictions.length} unique autocomplete predictions.`,
      `Detected ${highIntent.length} high-intent or comparison-intent predictions.`,
      `Deterministic score is ${score.totalScore}/100 with decision "${score.decision}".`,
    ],
    inferences: [
      highIntent.length > 0
        ? 'Autocomplete language includes at least some solution-seeking or comparison language.'
        : 'Autocomplete language is not yet showing strong buying or comparison intent.',
      problemIntent.length > 0
        ? 'Some users appear to describe the problem directly rather than only naming a product.'
        : 'Problem-language evidence is still thin in the current autocomplete sample.',
    ],
    assumptions: [
      'Autocomplete reflects visible phrasing, not demand size or conversion intent.',
      'The current evidence set is limited to Google Autocomplete in the configured market and language.',
    ],
    missingProof: [
      'No demand-size estimate yet.',
      'No competitor page-one SERP analysis yet.',
      'No Reddit, review, or support-channel problem evidence yet.',
      'No willingness-to-pay or pricing evidence yet.',
    ],
    redFlags: lowIntentCount > Math.max(3, Math.floor(predictions.length * 0.4))
      ? ['A large share of predictions still look low intent or navigational.']
      : [],
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
