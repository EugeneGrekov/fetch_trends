import { describe, expect, it } from 'vitest';
import { buildPortfolioComparisonReport } from './comparison-report.js';
import { rankPortfolioIdeas } from './portfolio-ranker.js';
import { snapshotFixture } from './test-fixtures.js';

describe('portfolio comparison report', () => {
  it('renders markdown and structured JSON for ranked ideas', () => {
    const generatedAt = '2026-07-08T12:00:00.000Z';
    const rankedIdeas = rankPortfolioIdeas(
      [snapshotFixture('strong'), snapshotFixture('validate'), snapshotFixture('park')],
      generatedAt,
    );

    const report = buildPortfolioComparisonReport({
      filters: {
        includeKilled: false,
        limit: 10,
        status: 'active',
      },
      generatedAt,
      ideaIds: rankedIdeas.map((idea) => idea.ideaId),
      rankedIdeas,
    });

    expect(report.markdown).toContain('# Portfolio Comparison Report');
    expect(report.markdown).toContain('## Top Ideas To Test Next');
    expect(report.markdown).toContain('## Recommended Next Validation Cycle');
    expect(report.json.summary.ideaCount).toBe(3);
    expect(report.json.rankedIdeas[0]?.bucket).toBe('test_next');
    expect(report.json.bucketCounts.test_next).toBe(1);
  });
});
