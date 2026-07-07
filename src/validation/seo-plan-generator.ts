import type { AutocompletePredictionRow, CompetitorRow, EvidenceRow, IdeaRow, QueryRow, ScoreRow, SourceRow } from '../db/schema.js';

export type SeoDecision = 'build_now' | 'build_after_more_evidence' | 'do_not_build_seo_too_weak';

export type SeoPageType =
  | 'money_page'
  | 'how_to_guide'
  | 'comparison_page'
  | 'problem_troubleshooting_page'
  | 'faq_trust_page';

export interface KeywordCluster {
  cluster: string;
  queries: string[];
  evidenceSource: string;
  intent: string;
}

export interface SeoPagePlan {
  cta: string;
  evidenceSource: string;
  h1: string;
  pageType: SeoPageType;
  priority: 'build_first' | 'build_second' | 'build_third' | 'build_later' | 'defer';
  proposedTitle: string;
  rationale: string;
  recommendation: 'build' | 'defer';
  targetQuery: string;
  userIntent: string;
}

export interface KeywordToPageMap {
  pageType: SeoPageType;
  primaryKeyword: string;
  secondaryKeywords: string[];
}

export interface SeoPlan {
  decision: SeoDecision;
  evidenceSummary: string[];
  ideaId: number;
  internalLinkingPlan: string[];
  keywordClusters: KeywordCluster[];
  keywordToPageMap: KeywordToPageMap[];
  pages: SeoPagePlan[];
  prioritizedBuildOrder: SeoPageType[];
  warnings: string[];
}

export interface SeoPlanGeneration {
  markdown: string;
  plan: SeoPlan;
}

export interface SeoPlanGeneratorInput {
  competitors: CompetitorRow[];
  evidence: EvidenceRow[];
  idea: IdeaRow;
  predictions: AutocompletePredictionRow[];
  queries: QueryRow[];
  score: ScoreRow | null;
  sources: SourceRow[];
}

interface QueryCandidate {
  confidence: number;
  evidenceSource: string;
  intent: string;
  query: string;
}

const REQUIRED_PAGE_TYPES: SeoPageType[] = [
  'money_page',
  'how_to_guide',
  'comparison_page',
  'problem_troubleshooting_page',
  'faq_trust_page',
];

export function generateSeoPlan(input: SeoPlanGeneratorInput): SeoPlanGeneration {
  const candidates = buildQueryCandidates(input);
  const decision = chooseSeoDecision(input, candidates);
  const recommendation = decision === 'do_not_build_seo_too_weak' ? 'defer' : 'build';
  const keywordClusters = buildKeywordClusters(input, candidates);
  const pages = buildPagePlans(input, candidates, decision);
  const keywordToPageMap = pages.map((page) => ({
    pageType: page.pageType,
    primaryKeyword: page.targetQuery,
    secondaryKeywords: candidates
      .filter((candidate) => candidate.intent === page.userIntent && candidate.query !== page.targetQuery)
      .slice(0, 4)
      .map((candidate) => candidate.query),
  }));
  const prioritizedBuildOrder = buildOrder(decision, pages);
  const plan: SeoPlan = {
    decision,
    evidenceSummary: buildEvidenceSummary(input, candidates),
    ideaId: input.idea.id,
    internalLinkingPlan: buildInternalLinkingPlan(recommendation),
    keywordClusters,
    keywordToPageMap,
    pages,
    prioritizedBuildOrder,
    warnings: [
      'This SEO plan is generated only from stored query and evidence data.',
      'Do not publish broad generic blog posts unless future stored evidence shows demand.',
      'SEO opportunity is not proof of willingness to pay.',
    ],
  };

  return {
    markdown: renderSeoPlanMarkdown(plan),
    plan,
  };
}

function chooseSeoDecision(input: SeoPlanGeneratorInput, candidates: QueryCandidate[]): SeoDecision {
  const score = input.score?.total_score ?? 0;
  const highIntentCount = countCandidates(candidates, 'high purchase intent') + countCandidates(candidates, 'comparison intent');
  const usefulIntentCount = candidates.filter((candidate) => candidate.intent !== 'low intent').length;

  if (score >= 65 && highIntentCount >= 2 && usefulIntentCount >= 4) {
    return 'build_now';
  }

  if (score >= 45 || usefulIntentCount >= 3 || input.evidence.length > 0) {
    return 'build_after_more_evidence';
  }

  return 'do_not_build_seo_too_weak';
}

function buildQueryCandidates(input: SeoPlanGeneratorInput): QueryCandidate[] {
  const byQuery = new Map<string, QueryCandidate>();

  for (const prediction of input.predictions) {
    const existing = byQuery.get(prediction.normalized_prediction);
    const candidate = {
      confidence: prediction.confidence_score,
      evidenceSource: `autocomplete_prediction:${prediction.id}`,
      intent: prediction.intent,
      query: prediction.prediction,
    };

    if (!existing || candidate.confidence > existing.confidence) {
      byQuery.set(prediction.normalized_prediction, candidate);
    }
  }

  for (const query of input.queries) {
    if (byQuery.has(query.normalized_query)) {
      continue;
    }

    byQuery.set(query.normalized_query, {
      confidence: query.priority_score ?? 50,
      evidenceSource: `query:${query.id}`,
      intent: query.intent_type ?? 'unknown intent',
      query: query.query,
    });
  }

  return [...byQuery.values()].sort((left, right) => right.confidence - left.confidence || left.query.localeCompare(right.query));
}

function buildKeywordClusters(input: SeoPlanGeneratorInput, candidates: QueryCandidate[]): KeywordCluster[] {
  const clusters: KeywordCluster[] = [
    buildCluster('High-intent money queries', candidates, ['high purchase intent'], input),
    buildCluster('How-to queries', candidates, ['how-to intent'], input),
    buildCluster('Comparison queries', candidates, ['comparison intent'], input),
    buildCluster('Problem and troubleshooting queries', candidates, ['problem intent'], input),
  ].filter((cluster) => cluster.queries.length > 0);

  if (input.evidence.length > 0) {
    clusters.push({
      cluster: 'FAQ and trust objections',
      evidenceSource: `evidence:${input.evidence[0]?.id}`,
      intent: 'trust and objection handling',
      queries: input.evidence.slice(0, 5).map((item) => item.complaint || item.quote),
    });
  }

  return clusters;
}

function buildCluster(
  cluster: string,
  candidates: QueryCandidate[],
  intents: string[],
  input: SeoPlanGeneratorInput,
): KeywordCluster {
  const matching = candidates.filter((candidate) => intents.includes(candidate.intent)).slice(0, 8);
  return {
    cluster,
    evidenceSource: matching[0]?.evidenceSource ?? fallbackEvidenceSource(input),
    intent: intents.join(', '),
    queries: matching.map((candidate) => candidate.query),
  };
}

function buildPagePlans(input: SeoPlanGeneratorInput, candidates: QueryCandidate[], decision: SeoDecision): SeoPagePlan[] {
  const defer = decision === 'do_not_build_seo_too_weak';
  const pageFactories: Record<SeoPageType, () => SeoPagePlan> = {
    money_page: () => buildPagePlan({
      cta: 'Start the payment-intent test draft',
      decision,
      fallbackQuery: input.idea.title,
      input,
      pageType: 'money_page',
      priority: defer ? 'defer' : 'build_first',
      query: chooseCandidate(candidates, ['high purchase intent']) ?? chooseCandidate(candidates, ['comparison intent']),
      titlePrefix: 'One-time solution for',
      userIntent: 'high purchase intent',
    }),
    how_to_guide: () => buildPagePlan({
      cta: 'See if the paid workflow saves this step',
      decision,
      fallbackQuery: `how to ${input.idea.title}`,
      input,
      pageType: 'how_to_guide',
      priority: defer ? 'defer' : 'build_later',
      query: chooseCandidate(candidates, ['how-to intent']),
      titlePrefix: 'How to handle',
      userIntent: 'how-to intent',
    }),
    comparison_page: () => buildPagePlan({
      cta: 'Compare the paid preview',
      decision,
      fallbackQuery: buildComparisonFallback(input),
      input,
      pageType: 'comparison_page',
      priority: defer ? 'defer' : 'build_third',
      query: chooseCandidate(candidates, ['comparison intent']),
      titlePrefix: 'Compare options for',
      userIntent: 'comparison intent',
    }),
    problem_troubleshooting_page: () => buildPagePlan({
      cta: 'Try the focused workflow',
      decision,
      fallbackQuery: `fix ${input.idea.title}`,
      input,
      pageType: 'problem_troubleshooting_page',
      priority: defer ? 'defer' : 'build_second',
      query: chooseCandidate(candidates, ['problem intent']),
      titlePrefix: 'Troubleshoot',
      userIntent: 'problem intent',
    }),
    faq_trust_page: () => buildPagePlan({
      cta: 'Review the early-access terms',
      decision,
      fallbackQuery: `${input.idea.title} pricing and privacy`,
      input,
      pageType: 'faq_trust_page',
      priority: defer ? 'defer' : 'build_later',
      query: chooseTrustCandidate(input, candidates),
      titlePrefix: 'Pricing, privacy, and FAQ for',
      userIntent: 'trust and objection handling',
    }),
  };

  return REQUIRED_PAGE_TYPES.map((pageType) => pageFactories[pageType]());
}

function buildPagePlan(args: {
  cta: string;
  decision: SeoDecision;
  fallbackQuery: string;
  input: SeoPlanGeneratorInput;
  pageType: SeoPageType;
  priority: SeoPagePlan['priority'];
  query: QueryCandidate | null;
  titlePrefix: string;
  userIntent: string;
}): SeoPagePlan {
  const targetQuery = args.query?.query ?? args.fallbackQuery;
  const recommendation = args.decision === 'do_not_build_seo_too_weak' ? 'defer' : 'build';
  return {
    cta: args.cta,
    evidenceSource: args.query?.evidenceSource ?? fallbackEvidenceSource(args.input),
    h1: targetQuery,
    pageType: args.pageType,
    priority: args.priority,
    proposedTitle: `${args.titlePrefix} ${targetQuery}`,
    rationale: recommendation === 'build'
      ? `Build because stored evidence includes ${args.userIntent} language for a narrow task.`
      : 'Do not build this page yet because stored query evidence is too weak for SEO investment.',
    recommendation,
    targetQuery,
    userIntent: args.userIntent,
  };
}

function buildEvidenceSummary(input: SeoPlanGeneratorInput, candidates: QueryCandidate[]): string[] {
  const serpCount = input.sources.filter((source) => source.source_type.toLowerCase().includes('serp')).length;
  return [
    `Stored query candidates: ${candidates.length}.`,
    `Stored autocomplete predictions: ${input.predictions.length}.`,
    `Stored SERP sources: ${serpCount}.`,
    `Stored evidence quotes: ${input.evidence.length}.`,
    `Stored competitors: ${input.competitors.length}.`,
    input.score ? `Latest validation score: ${input.score.total_score}/100 (${input.score.decision}).` : 'No stored validation score was available.',
  ];
}

function buildInternalLinkingPlan(recommendation: 'build' | 'defer'): string[] {
  if (recommendation === 'defer') {
    return ['Do not create internal links yet. Revisit after stronger query and pain evidence is stored.'];
  }

  return [
    'Money page links to FAQ/trust page near pricing and disclosure sections.',
    'Problem/troubleshooting page links to the money page after the painful task is explained.',
    'How-to guide links to the problem page first, then to the money page only after the manual workaround is clear.',
    'Comparison page links to the money page and FAQ/trust page for objections and pricing.',
    'FAQ/trust page links back to the money page CTA and states the validation-test status plainly.',
  ];
}

function buildOrder(decision: SeoDecision, pages: SeoPagePlan[]): SeoPageType[] {
  if (decision === 'do_not_build_seo_too_weak') {
    return [];
  }

  return pages
    .slice()
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority))
    .map((page) => page.pageType);
}

function renderSeoPlanMarkdown(plan: SeoPlan): string {
  return [
    '# SEO Plan',
    '',
    'This plan is based on stored query and evidence data only. It is not a generic content calendar.',
    '',
    '## Decision',
    '',
    `- Decision: ${plan.decision}`,
    `- Idea ID: ${plan.ideaId}`,
    '',
    '## Evidence Summary',
    '',
    ...renderList(plan.evidenceSummary),
    '',
    '## Keyword Clusters',
    '',
    ...(plan.keywordClusters.length > 0
      ? plan.keywordClusters.flatMap((cluster) => [
          `### ${cluster.cluster}`,
          '',
          `- Intent: ${cluster.intent}`,
          `- Evidence source: ${cluster.evidenceSource}`,
          ...cluster.queries.map((query) => `- Query: ${query}`),
          '',
        ])
      : ['- No useful keyword clusters are available from stored evidence.', '']),
    '## Page Plans',
    '',
    ...plan.pages.flatMap((page) => [
      `### ${formatPageType(page.pageType)}`,
      '',
      `- Target query: ${page.targetQuery}`,
      `- User intent: ${page.userIntent}`,
      `- Proposed title: ${page.proposedTitle}`,
      `- H1: ${page.h1}`,
      `- CTA: ${page.cta}`,
      `- Evidence source: ${page.evidenceSource}`,
      `- Priority: ${page.priority}`,
      `- Recommendation: ${page.recommendation}`,
      `- Why this page should or should not be built: ${page.rationale}`,
      '',
    ]),
    '## Keyword-To-Page Map',
    '',
    ...plan.keywordToPageMap.map((item) =>
      `- ${formatPageType(item.pageType)}: ${item.primaryKeyword} (secondary: ${item.secondaryKeywords.join(', ') || 'none'})`,
    ),
    '',
    '## Internal Linking Plan',
    '',
    ...renderList(plan.internalLinkingPlan),
    '',
    '## Prioritized Build Order',
    '',
    ...(plan.prioritizedBuildOrder.length > 0
      ? plan.prioritizedBuildOrder.map((pageType, index) => `${index + 1}. ${formatPageType(pageType)}`)
      : ['- Do not build SEO pages yet.']),
    '',
    '## Warnings',
    '',
    ...renderList(plan.warnings),
    '',
  ].join('\n');
}

function chooseCandidate(candidates: QueryCandidate[], intents: string[]): QueryCandidate | null {
  return candidates.find((candidate) => intents.includes(candidate.intent)) ?? null;
}

function chooseTrustCandidate(input: SeoPlanGeneratorInput, candidates: QueryCandidate[]): QueryCandidate | null {
  const trustCandidate = candidates.find((candidate) =>
    /\b(price|pricing|privacy|safe|refund|review|reviews|trust)\b/i.test(candidate.query),
  );

  if (trustCandidate) {
    return trustCandidate;
  }

  if (input.evidence.length > 0) {
    const item = input.evidence[0];
    return {
      confidence: item?.confidence_score ?? 50,
      evidenceSource: `evidence:${item?.id ?? 'unknown'}`,
      intent: 'trust and objection handling',
      query: item?.complaint ?? item?.quote ?? input.idea.title,
    };
  }

  return null;
}

function buildComparisonFallback(input: SeoPlanGeneratorInput): string {
  const competitor = input.competitors[0];
  if (competitor) {
    return `${input.idea.title} vs ${competitor.name}`;
  }

  return `${input.idea.title} alternatives`;
}

function fallbackEvidenceSource(input: SeoPlanGeneratorInput): string {
  if (input.predictions[0]) {
    return `autocomplete_prediction:${input.predictions[0].id}`;
  }

  if (input.queries[0]) {
    return `query:${input.queries[0].id}`;
  }

  if (input.evidence[0]) {
    return `evidence:${input.evidence[0].id}`;
  }

  return 'no stored query evidence';
}

function countCandidates(candidates: QueryCandidate[], intent: string): number {
  return candidates.filter((candidate) => candidate.intent === intent).length;
}

function priorityRank(priority: SeoPagePlan['priority']): number {
  if (priority === 'build_first') {
    return 1;
  }

  if (priority === 'build_second') {
    return 2;
  }

  if (priority === 'build_third') {
    return 3;
  }

  if (priority === 'build_later') {
    return 4;
  }

  return 5;
}

function renderList(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ['- None recorded.'];
}

function formatPageType(pageType: SeoPageType): string {
  return pageType.replaceAll('_', ' ');
}
