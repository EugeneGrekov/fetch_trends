import { createReport } from '../db/repositories/reports.js';
import type { ReportRow } from '../db/schema.js';
import type { PortfolioComparisonFilters, PortfolioComparisonInput, PortfolioComparisonReport, PortfolioIdeaRanking } from './types.js';
import { partitionPortfolioIdeas } from './portfolio-ranker.js';

export function buildPortfolioComparisonReport(input: PortfolioComparisonInput): PortfolioComparisonReport {
  const partitions = partitionPortfolioIdeas(input.rankedIdeas);
  const bucketCounts = {
    kill: partitions.kill.length,
    park: partitions.park.length,
    test_next: partitions.test_next.length,
    validate_deeper: partitions.validate_deeper.length,
    watch: partitions.watch.length,
  };
  const sharedMissingProof = buildSharedMissingProof(input.rankedIdeas);
  const crossIdeaRisks = buildCrossIdeaRisks(input.rankedIdeas, bucketCounts, sharedMissingProof);
  const topNextAction = input.rankedIdeas[0]?.bestNextAction ?? 'No ideas matched the current filter.';
  const recommendedNextValidationCycle = buildRecommendedNextCycle(input.rankedIdeas, sharedMissingProof);

  return {
    json: {
      bucketCounts,
      crossIdeaRisks,
      filters: input.filters,
      generatedAt: input.generatedAt,
      ideaIds: input.ideaIds,
      primaryIdeaId: input.rankedIdeas[0]?.ideaId ?? 0,
      rankedIdeas: input.rankedIdeas,
      recommendedNextValidationCycle,
      report: {
        createdAt: input.generatedAt,
        id: 0,
        ideaId: input.rankedIdeas[0]?.ideaId ?? 0,
        reportType: 'portfolio_comparison',
      },
      sharedMissingProof,
      summary: {
        ideaCount: input.rankedIdeas.length,
        topNextAction,
      },
      topIdeasToTestNext: partitions.test_next.slice(0, 3),
      ideasToValidateDeeper: partitions.validate_deeper.slice(0, 3),
      ideasToWatch: partitions.watch.slice(0, 3),
      ideasToPark: partitions.park.slice(0, 3),
      ideasToKill: partitions.kill.slice(0, 3),
    },
    markdown: renderPortfolioMarkdown({
      bucketCounts,
      crossIdeaRisks,
      filters: input.filters,
      generatedAt: input.generatedAt,
      rankedIdeas: input.rankedIdeas,
      recommendedNextValidationCycle,
      sharedMissingProof,
    }),
  };
}

export function createPortfolioReportRow(
  db: Parameters<typeof createReport>[0],
  input: {
    createdAt: string;
    ideaId: number;
    json: PortfolioComparisonReport['json'];
    markdown: string;
  },
): ReportRow {
  return createReport(db, {
    createdAt: input.createdAt,
    ideaId: input.ideaId,
    json: JSON.stringify(input.json, null, 2),
    markdown: input.markdown,
    reportType: 'portfolio_comparison',
  });
}

function renderPortfolioMarkdown(input: {
  bucketCounts: Record<'test_next' | 'validate_deeper' | 'watch' | 'park' | 'kill', number>;
  crossIdeaRisks: string[];
  filters: PortfolioComparisonFilters;
  generatedAt: string;
  rankedIdeas: PortfolioIdeaRanking[];
  recommendedNextValidationCycle: string;
  sharedMissingProof: string[];
}): string {
  const partitions = partitionPortfolioIdeas(input.rankedIdeas);

  return [
    '# Portfolio Comparison Report',
    '',
    'This report ranks ideas by evidence quality, risk, test cost, and next-action clarity. It is deliberately not a market-sizing summary.',
    '',
    '## Filters',
    '',
    `- Limit: ${input.filters.limit}`,
    `- Status filter: ${input.filters.status ?? 'none'}`,
    `- Include killed ideas: ${input.filters.includeKilled ? 'yes' : 'no'}`,
    `- Generated at: ${input.generatedAt}`,
    '',
    '## Top Ideas To Test Next',
    '',
    ...renderRankedIdeaSection(partitions.test_next.slice(0, 3), 'No ideas currently clear the test-next bar.'),
    '',
    '## Ideas To Validate Deeper',
    '',
    ...renderRankedIdeaSection(partitions.validate_deeper.slice(0, 3), 'No ideas currently need a deeper validation pass.'),
    '',
    '## Ideas To Watch',
    '',
    ...renderRankedIdeaSection(partitions.watch.slice(0, 3), 'No ideas currently sit in the watch bucket.'),
    '',
    '## Ideas To Park',
    '',
    ...renderRankedIdeaSection(partitions.park.slice(0, 3), 'No ideas currently belong in the park bucket.'),
    '',
    '## Ideas To Kill',
    '',
    ...renderRankedIdeaSection(partitions.kill.slice(0, 3), 'No ideas currently have kill rules or a kill bucket.'),
    '',
    '## Cross-Idea Risks',
    '',
    ...renderBulletList(input.crossIdeaRisks, 'No portfolio-level risk stood out.'),
    '',
    '## Shared Missing Proof',
    '',
    ...renderBulletList(input.sharedMissingProof, 'No shared missing-proof pattern stood out.'),
    '',
    '## Bucket Counts',
    '',
    `- Test next: ${input.bucketCounts.test_next}`,
    `- Validate deeper: ${input.bucketCounts.validate_deeper}`,
    `- Watch: ${input.bucketCounts.watch}`,
    `- Park: ${input.bucketCounts.park}`,
    `- Kill: ${input.bucketCounts.kill}`,
    '',
    '## Recommended Next Validation Cycle',
    '',
    input.recommendedNextValidationCycle,
    '',
  ].join('\n');
}

function renderRankedIdeaSection(ideas: PortfolioIdeaRanking[], emptyState: string): string[] {
  if (ideas.length === 0) {
    return [`- ${emptyState}`];
  }

  return ideas.flatMap((idea) => [
    `- ${idea.title}`,
    `  - Bucket: ${idea.bucket}`,
    `  - Score: ${idea.portfolioScore}/100`,
    `  - Confidence: ${idea.confidence}`,
    `  - Reason: ${idea.reason}`,
    `  - Next action: ${idea.bestNextAction}`,
    `  - Missing proof: ${idea.blockingMissingProof.length > 0 ? idea.blockingMissingProof.join('; ') : 'none'}`,
  ]);
}

function renderBulletList(items: string[], emptyState: string): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${emptyState}`];
}

function buildSharedMissingProof(rankings: PortfolioIdeaRanking[]): string[] {
  const counts = new Map<string, number>();
  for (const ranking of rankings) {
    for (const item of ranking.blockingMissingProof) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([item, count]) => `${item} (${count} ideas)`)
    .slice(0, 5);
}

function buildCrossIdeaRisks(
  rankings: PortfolioIdeaRanking[],
  bucketCounts: Record<'test_next' | 'validate_deeper' | 'watch' | 'park' | 'kill', number>,
  sharedMissingProof: string[],
): string[] {
  const risks: string[] = [];
  const staleCount = rankings.filter((ranking) => ranking.dimensions.recency < 40).length;
  const weakPaymentCount = rankings.filter((ranking) => ranking.dimensions.paymentSignalStrength < 35).length;

  if (bucketCounts.test_next === 0) {
    risks.push('No idea currently has enough clarity to spend the next validation cycle with confidence.');
  }

  if (staleCount >= 2) {
    risks.push(`${staleCount} ideas rely on stale evidence.`);
  }

  if (weakPaymentCount >= Math.max(2, Math.ceil(rankings.length / 2))) {
    risks.push('Payment evidence is weak across most of the portfolio.');
  }

  if (sharedMissingProof.some((item) => item.includes('competitor review'))) {
    risks.push('Competitor proof is thin across the active set.');
  }

  if (bucketCounts.kill > 0 && bucketCounts.test_next === 0) {
    risks.push('Kill rules are present, but no obvious replacement candidate is ready yet.');
  }

  return risks;
}

function buildRecommendedNextCycle(
  rankings: PortfolioIdeaRanking[],
  sharedMissingProof: string[],
): string {
  const next = rankings.find((ranking) => ranking.bucket === 'test_next')
    ?? rankings.find((ranking) => ranking.bucket === 'validate_deeper')
    ?? rankings[0];

  if (!next) {
    return 'No ideas matched the current filters, so collect more evidence before comparing again.';
  }

  if (next.bucket === 'kill') {
    return `Kill ${next.title} and redirect time to the first non-kill idea once fresh evidence appears.`;
  }

  if (next.bucket === 'validate_deeper' && sharedMissingProof.some((item) => item.includes('payment-click'))) {
    return `Run one focused payment-intent pass for ${next.title}, then compare the result against the rest of the portfolio.`;
  }

  return `${next.bestNextAction} Then compare the result against the rest of the portfolio again.`;
}
