import type { AutocompletePredictionRow, CompetitorRow, EvidenceRow, IdeaRow, ReportRow, ScoreRow, SourceRow } from '../db/schema.js';
import { buildAnalyticsEventPlan, buildExperimentThresholdPlan } from './experiment-thresholds.js';
import type { AnalyticsEventSpec, ExperimentThreshold, ExperimentThresholdPlan } from './experiment-thresholds.js';

export type PaymentTestDecision = 'not_justified' | 'fake_door' | 'preorder' | 'concierge' | 'paid_preview';

export interface FaqItem {
  question: string;
  answer: string;
}

export interface LandingPageDraft {
  h1: string;
  subheadline: string;
  problemSection: string;
  beforeAfter: string;
  threeStepWorkflow: string[];
  previewBeforePay: string;
  trustPrivacy: string;
  pricingBlock: string;
  faq: FaqItem[];
  ctaVariants: string[];
}

export interface EvidenceReference {
  label: string;
  source: string;
  text: string;
}

export interface PaymentTestSpec {
  analyticsEvents: AnalyticsEventSpec[];
  cta: string;
  ctaVariants: string[];
  decision: PaymentTestDecision;
  decisionThresholds: ExperimentThreshold[];
  exactPainfulTask: string;
  exactTargetUser: string;
  evidenceReferences: EvidenceReference[];
  faq: FaqItem[];
  headline: string;
  ideaId: number;
  landingPageDraft: LandingPageDraft | null;
  notJustifiedReasons: string[];
  offer: string;
  priceHypothesis: string;
  reportId: number;
  requiredEvidence: string[];
  risks: string[];
  testType: PaymentTestDecision;
  thresholdAssumptionWarning: string;
  trustClaims: string[];
  verdict: string;
  warning: string;
}

export interface PaymentTestGeneration {
  markdown: string;
  spec: PaymentTestSpec;
}

export interface PaymentTestGeneratorInput {
  competitors: CompetitorRow[];
  evidence: EvidenceRow[];
  idea: IdeaRow;
  predictions: AutocompletePredictionRow[];
  report: ReportRow;
  score: ScoreRow | null;
  sources: SourceRow[];
}

const WARNING = 'This is a payment-intent test, not proof that the business is validated.';

export function generatePaymentTest(input: PaymentTestGeneratorInput): PaymentTestGeneration {
  const evidenceStrength = assessPaymentEvidenceStrength(input);
  const decision = choosePaymentDecision(input, evidenceStrength);
  const targetUser = input.idea.target_market ?? 'the narrow user segment described by the stored validation evidence';
  const exactTask = choosePainfulTask(input);
  const priceHypothesis = buildPriceHypothesis(input);
  const evidenceReferences = buildEvidenceReferences(input);
  const requiredEvidence = buildRequiredEvidence(input, decision);
  const notJustifiedReasons = decision === 'not_justified' ? buildNotJustifiedReasons(input) : [];
  const analyticsEvents = buildAnalyticsEventPlan(decision);
  const thresholdPlan = buildExperimentThresholdPlan({
    evidenceStrength,
    score: input.score?.total_score ?? null,
    testType: decision,
  });
  const ctaVariants = decision === 'not_justified'
    ? []
    : [
        'See the paid preview',
        'Check if this solves my task',
        'Reserve one-time access',
      ];
  const cta = ctaVariants[0] ?? 'Do not launch a CTA yet';
  const headline = decision === 'not_justified'
    ? `Payment test not justified for ${exactTask}`
    : buildHeadline(exactTask);
  const offer = decision === 'not_justified'
    ? 'No payment offer should be published until stronger evidence exists.'
    : `A one-time paid workflow that helps ${targetUser} complete: ${exactTask}.`;
  const faq = buildFaq(decision, priceHypothesis);
  const trustClaims = buildTrustClaims(input, decision);
  const risks = buildRisks(input, decision);
  const landingPageDraft = decision === 'not_justified'
    ? null
    : buildLandingPageDraft({
        ctaVariants,
        exactTask,
        faq,
        offer,
        priceHypothesis,
        targetUser,
        trustClaims,
      });

  const spec: PaymentTestSpec = {
    analyticsEvents,
    cta,
    ctaVariants,
    decision,
    decisionThresholds: thresholdPlan.thresholds,
    exactPainfulTask: exactTask,
    exactTargetUser: targetUser,
    evidenceReferences,
    faq,
    headline,
    ideaId: input.idea.id,
    landingPageDraft,
    notJustifiedReasons,
    offer,
    priceHypothesis,
    reportId: input.report.id,
    requiredEvidence,
    risks,
    testType: decision,
    thresholdAssumptionWarning: thresholdPlan.assumptionWarning,
    trustClaims,
    verdict: input.score?.decision ?? 'no stored score',
    warning: WARNING,
  };

  return {
    markdown: renderPaymentTestMarkdown(spec, thresholdPlan),
    spec,
  };
}

function choosePaymentDecision(input: PaymentTestGeneratorInput, evidenceStrength: 'weak' | 'medium' | 'strong'): PaymentTestDecision {
  const score = input.score?.total_score ?? 0;
  const highIntentCount = countPredictions(input.predictions, ['high purchase intent', 'comparison intent']);

  if (score < 65 || highIntentCount < 2 || evidenceStrength === 'weak') {
    return 'not_justified';
  }

  if (hasPaymentSignal(input.evidence) && hasAnyPriceSignal(input)) {
    return 'preorder';
  }

  if (hasCompetitorPricing(input.competitors) && score >= 75) {
    return 'paid_preview';
  }

  if (input.evidence.length >= 2) {
    return 'concierge';
  }

  return 'fake_door';
}

function assessPaymentEvidenceStrength(input: PaymentTestGeneratorInput): 'weak' | 'medium' | 'strong' {
  const score = input.score?.total_score ?? 0;
  const highIntentCount = countPredictions(input.predictions, ['high purchase intent', 'comparison intent']);
  const problemIntentCount = countPredictions(input.predictions, ['problem intent']);
  const directEvidenceCount = input.evidence.filter((item) => (item.confidence_score ?? 0) >= 60).length;
  const priceSignals = hasAnyPriceSignal(input) ? 1 : 0;
  const total = highIntentCount * 2 + problemIntentCount + directEvidenceCount * 2 + priceSignals * 2 + Math.floor(score / 20);

  if (score >= 70 && total >= 10) {
    return 'strong';
  }

  if (score >= 45 && total >= 5) {
    return 'medium';
  }

  return 'weak';
}

function buildHeadline(exactTask: string): string {
  return `Finish ${lowercaseFirst(exactTask)} without rebuilding the workflow yourself`;
}

function choosePainfulTask(input: PaymentTestGeneratorInput): string {
  const evidenceTask = input.evidence.find((item) => item.trigger || item.complaint || item.workaround);
  if (evidenceTask?.trigger) {
    return evidenceTask.trigger;
  }

  const highIntent = input.predictions.find((prediction) =>
    prediction.intent === 'high purchase intent' || prediction.intent === 'comparison intent' || prediction.intent === 'problem intent',
  );
  if (highIntent) {
    return highIntent.prediction;
  }

  return input.idea.title;
}

function buildPriceHypothesis(input: PaymentTestGeneratorInput): string {
  if (input.idea.expected_price) {
    return `${input.idea.expected_price} one-time, tested as an assumption rather than a proven price.`;
  }

  const pricedCompetitor = input.competitors.find((competitor) => competitor.price_text);
  if (pricedCompetitor?.price_text) {
    return `Anchor around ${pricedCompetitor.price_text} because ${pricedCompetitor.name} has stored pricing evidence; test a narrower one-time price.`;
  }

  return '$19-$49 one-time, explicitly marked as an unproven price hypothesis.';
}

function buildRequiredEvidence(input: PaymentTestGeneratorInput, decision: PaymentTestDecision): string[] {
  const missing = [
    !hasPaymentSignal(input.evidence) ? 'Direct willingness-to-pay evidence from replies, payment clicks, or manual sales calls.' : null,
    !hasCompetitorPricing(input.competitors) ? 'Competitor or alternative pricing proof for this exact task.' : null,
    input.evidence.length === 0 ? 'Quoted pain evidence from reviews, communities, support forums, or interviews.' : null,
    countPredictions(input.predictions, ['high purchase intent', 'comparison intent']) < 3
      ? 'More high-intent or comparison search language for this exact task.'
      : null,
  ].filter((item): item is string => item != null);

  if (decision === 'not_justified' && missing.length === 0) {
    return ['A clearer segment-specific reason why now is the right time to run a payment-intent test.'];
  }

  return missing.length > 0 ? missing : ['Real payment behavior from targeted visitors.'];
}

function buildNotJustifiedReasons(input: PaymentTestGeneratorInput): string[] {
  const reasons: string[] = [];
  const score = input.score?.total_score ?? 0;
  const highIntentCount = countPredictions(input.predictions, ['high purchase intent', 'comparison intent']);

  if (!input.score) {
    reasons.push('No stored validation score was found.');
  } else if (score < 65) {
    reasons.push(`Stored validation score is ${score}/100, below the payment-test threshold of 65/100.`);
  }

  if (highIntentCount < 2) {
    reasons.push(`Only ${highIntentCount} high-intent or comparison autocomplete predictions were found.`);
  }

  if (input.evidence.length === 0) {
    reasons.push('No stored pain quotes or complaint evidence support the offer.');
  }

  if (!hasAnyPriceSignal(input)) {
    reasons.push('No expected price or competitor pricing evidence supports a paid test.');
  }

  return reasons.length > 0 ? reasons : ['Stored evidence does not yet justify a public payment-intent test.'];
}

function buildFaq(decision: PaymentTestDecision, priceHypothesis: string): FaqItem[] {
  if (decision === 'not_justified') {
    return [
      {
        question: 'Should this landing page be launched now?',
        answer: 'No. The stored evidence is too weak for payment-test copy, so collect stronger query, pain, and pricing evidence first.',
      },
    ];
  }

  return [
    {
      question: 'Is this product already available?',
      answer: 'This is a validation draft. Be explicit that the visitor may be joining a manual or early-access test.',
    },
    {
      question: 'What is the price?',
      answer: priceHypothesis,
    },
    {
      question: 'What happens before payment?',
      answer: 'Show a preview, intake summary, checklist, or sample output before asking for payment intent whenever the workflow allows it.',
    },
    {
      question: 'What proves this is worth building?',
      answer: 'Targeted visitors must click through pricing, show payment intent, and reply with real task urgency.',
    },
  ];
}

function buildTrustClaims(input: PaymentTestGeneratorInput, decision: PaymentTestDecision): string[] {
  if (decision === 'not_justified') {
    return ['Do not make trust or outcome claims until stronger evidence exists.'];
  }

  const claims = [
    'Use the exact stored task language rather than broad productivity claims.',
    'State clearly that this is an early validation test or manual preview.',
    'Do not frame the offer as a subscription unless recurring-use evidence is stored.',
  ];

  if (input.idea.platform) {
    claims.push(`Keep platform claims limited to ${input.idea.platform}.`);
  }

  return claims;
}

function buildRisks(input: PaymentTestGeneratorInput, decision: PaymentTestDecision): string[] {
  const risks = [
    'Fake-door clicks can overstate willingness to pay.',
    'Targeted traffic quality may dominate conversion results.',
    'Visitors may treat a draft as a launched product unless disclosure is clear.',
  ];

  if (decision === 'not_justified') {
    return [
      'Publishing optimistic copy from weak evidence can create false validation.',
      ...risks,
    ];
  }

  if (!hasPaymentSignal(input.evidence)) {
    risks.push('Stored evidence lacks direct willingness-to-pay quotes.');
  }

  return risks;
}

function buildLandingPageDraft(args: {
  ctaVariants: string[];
  exactTask: string;
  faq: FaqItem[];
  offer: string;
  priceHypothesis: string;
  targetUser: string;
  trustClaims: string[];
}): LandingPageDraft {
  return {
    h1: args.exactTask,
    subheadline: `A focused one-time workflow for ${args.targetUser}, drafted only from stored validation evidence.`,
    problemSection: `You are trying to complete "${args.exactTask}" and current workarounds cost time, attention, or confidence.`,
    beforeAfter: 'Before: manual workaround, unclear next step, or repeated checking. After: a focused preview that shows whether the paid workflow solves the exact task.',
    threeStepWorkflow: [
      'Describe the specific task and constraints.',
      'Review a preview, checklist, or concierge response before payment intent.',
      'Click the paid CTA only if the preview matches the job to be done.',
    ],
    previewBeforePay: 'Show the smallest useful preview before asking for payment intent. If no preview is possible, label the flow as fake-door early access.',
    trustPrivacy: args.trustClaims.join(' '),
    pricingBlock: args.priceHypothesis,
    faq: args.faq,
    ctaVariants: args.ctaVariants,
  };
}

function buildEvidenceReferences(input: PaymentTestGeneratorInput): EvidenceReference[] {
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const evidenceReferences = input.evidence.slice(0, 5).map((item) => {
    const source = sourceById.get(item.source_id);
    return {
      label: `evidence:${item.id}`,
      source: source?.url ?? source?.title ?? 'stored evidence row',
      text: item.quote,
    };
  });

  const predictionReferences = input.predictions
    .filter((prediction) => prediction.intent === 'high purchase intent' || prediction.intent === 'comparison intent')
    .slice(0, 5)
    .map((prediction) => ({
      label: `autocomplete_prediction:${prediction.id}`,
      source: prediction.source_seed,
      text: prediction.prediction,
    }));

  return [...evidenceReferences, ...predictionReferences];
}

function renderPaymentTestMarkdown(spec: PaymentTestSpec, thresholdPlan: ExperimentThresholdPlan): string {
  const lines = [
    '# Payment Test Spec',
    '',
    spec.warning,
    '',
    '## Decision',
    '',
    `- Decision: ${spec.decision}`,
    `- Source validation report: ${spec.reportId}`,
    `- Stored verdict: ${spec.verdict}`,
    '',
    '## Target And Task',
    '',
    `- Exact target user: ${spec.exactTargetUser}`,
    `- Exact painful task: ${spec.exactPainfulTask}`,
    '',
  ];

  if (spec.decision === 'not_justified') {
    lines.push(
      '## Why Payment Test Is Not Justified',
      '',
      ...renderList(spec.notJustifiedReasons),
      '',
      '## Landing Page Draft',
      '',
      'No optimistic landing page copy is generated for this idea. Collect stronger evidence before drafting a public offer.',
      '',
    );
  } else if (spec.landingPageDraft) {
    lines.push(
      '## Offer',
      '',
      `- Test type: ${spec.testType}`,
      `- Headline: ${spec.headline}`,
      `- Offer: ${spec.offer}`,
      `- One-time price hypothesis: ${spec.priceHypothesis}`,
      `- CTA: ${spec.cta}`,
      '',
      '## Landing Page Draft',
      '',
      `### H1`,
      '',
      spec.landingPageDraft.h1,
      '',
      '### Subheadline',
      '',
      spec.landingPageDraft.subheadline,
      '',
      '### Problem',
      '',
      spec.landingPageDraft.problemSection,
      '',
      '### Before / After',
      '',
      spec.landingPageDraft.beforeAfter,
      '',
      '### 3-Step Workflow',
      '',
      ...renderList(spec.landingPageDraft.threeStepWorkflow),
      '',
      '### Preview Before Pay',
      '',
      spec.landingPageDraft.previewBeforePay,
      '',
      '### Trust / Privacy',
      '',
      spec.landingPageDraft.trustPrivacy,
      '',
      '### Pricing Block',
      '',
      spec.landingPageDraft.pricingBlock,
      '',
      '### CTA Variants',
      '',
      ...renderList(spec.ctaVariants),
      '',
    );
  }

  lines.push(
    '## FAQ',
    '',
    ...spec.faq.flatMap((item) => [`### ${item.question}`, '', item.answer, '']),
    '## Trust Claims',
    '',
    ...renderList(spec.trustClaims),
    '',
    '## Required Missing Proof',
    '',
    ...renderList(spec.requiredEvidence),
    '',
    '## Analytics Event Plan',
    '',
    ...spec.analyticsEvents.flatMap((event) => [
      `### ${event.name}`,
      '',
      `- Trigger: ${event.trigger}`,
      `- Payload fields: ${event.payloadFields.join(', ')}`,
      `- Why it matters: ${event.whyItMatters}`,
      `- Strong signal: ${event.strongSignal}`,
      `- Weak signal: ${event.weakSignal}`,
      `- Kill signal: ${event.killSignal}`,
      '',
    ]),
    '## Decision Thresholds',
    '',
    thresholdPlan.assumptionWarning,
    '',
    ...spec.decisionThresholds.flatMap((threshold) => [
      `- ${threshold.signal}: ${threshold.condition} ${threshold.rationale}`,
    ]),
    '',
    '## Evidence References',
    '',
    ...(spec.evidenceReferences.length > 0
      ? spec.evidenceReferences.map((reference) => `- ${reference.label}: ${reference.text} (${reference.source})`)
      : ['- No direct evidence references were available.']),
    '',
    '## Risks',
    '',
    ...renderList(spec.risks),
    '',
  );

  return lines.join('\n');
}

function countPredictions(predictions: AutocompletePredictionRow[], intents: string[]): number {
  return predictions.filter((prediction) => intents.includes(prediction.intent)).length;
}

function hasPaymentSignal(evidence: EvidenceRow[]): boolean {
  return evidence.some((item) => {
    const signal = item.payment_signal?.toLowerCase() ?? '';
    return signal.length > 0 && !['none', 'weak', 'unknown'].includes(signal);
  });
}

function hasCompetitorPricing(competitors: CompetitorRow[]): boolean {
  return competitors.some((competitor) => competitor.price_text || competitor.pricing_model);
}

function hasAnyPriceSignal(input: PaymentTestGeneratorInput): boolean {
  return Boolean(input.idea.expected_price) || hasCompetitorPricing(input.competitors);
}

function renderList(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ['- None recorded.'];
}

function lowercaseFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toLowerCase() ?? ''}${value.slice(1)}`;
}
