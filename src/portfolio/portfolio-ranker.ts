import type { PortfolioIdeaRanking, PortfolioIdeaSnapshot } from './types.js';
import { evaluatePortfolioIdea } from './portfolio-scorer.js';

const BUCKET_ORDER: Record<PortfolioIdeaRanking['bucket'], number> = {
  test_next: 0,
  validate_deeper: 1,
  watch: 2,
  park: 3,
  kill: 4,
};

export function rankPortfolioIdeas(
  snapshots: PortfolioIdeaSnapshot[],
  generatedAt: string,
): PortfolioIdeaRanking[] {
  return snapshots
    .map((snapshot) => evaluatePortfolioIdea(snapshot, generatedAt))
    .sort(comparePortfolioIdeas);
}

export function comparePortfolioIdeas(left: PortfolioIdeaRanking, right: PortfolioIdeaRanking): number {
  const bucketDiff = BUCKET_ORDER[left.bucket] - BUCKET_ORDER[right.bucket];
  if (bucketDiff !== 0) {
    return bucketDiff;
  }

  const scoreDiff = right.portfolioScore - left.portfolioScore;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const recencyDiff = right.dimensions.recency - left.dimensions.recency;
  if (recencyDiff !== 0) {
    return recencyDiff;
  }

  return left.title.localeCompare(right.title);
}

export function partitionPortfolioIdeas(rankings: PortfolioIdeaRanking[]): Record<PortfolioIdeaRanking['bucket'], PortfolioIdeaRanking[]> {
  return {
    kill: rankings.filter((ranking) => ranking.bucket === 'kill'),
    park: rankings.filter((ranking) => ranking.bucket === 'park'),
    test_next: rankings.filter((ranking) => ranking.bucket === 'test_next'),
    validate_deeper: rankings.filter((ranking) => ranking.bucket === 'validate_deeper'),
    watch: rankings.filter((ranking) => ranking.bucket === 'watch'),
  };
}
