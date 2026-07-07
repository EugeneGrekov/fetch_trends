import type { Intent, UniquePrediction } from '../utilities/autocomplete/types.js';
import type { ValidationScore } from './types.js';

export function buildSearchLanguageScore(predictions: UniquePrediction[]): ValidationScore {
  const intentCounts: Record<Intent, number> = {
    'high purchase intent': 0,
    'how-to intent': 0,
    'comparison intent': 0,
    'problem intent': 0,
    'low intent': 0,
  };

  let confidenceTotal = 0;

  for (const prediction of predictions) {
    intentCounts[prediction.intent] += 1;
    confidenceTotal += prediction.confidenceScore;
  }

  const uniquePredictionCount = predictions.length;
  const averageConfidence = uniquePredictionCount === 0 ? 0 : Math.round(confidenceTotal / uniquePredictionCount);
  const highIntentCount = intentCounts['high purchase intent'] + intentCounts['comparison intent'];
  const highIntentShare = uniquePredictionCount === 0
    ? 0
    : Number((highIntentCount / uniquePredictionCount).toFixed(2));

  const totalScore = clampScore(
    Math.round(
      averageConfidence * 0.6 +
      intentCounts['high purchase intent'] * 12 +
      intentCounts['comparison intent'] * 8 +
      intentCounts['problem intent'] * 9 +
      Math.min(uniquePredictionCount, 20) * 1.5 -
      intentCounts['low intent'] * 4,
    ),
  );

  return {
    totalScore,
    decision: chooseDecision(totalScore, highIntentCount, intentCounts['problem intent']),
    breakdown: {
      uniquePredictionCount,
      averageConfidence,
      intentCounts,
      highIntentShare,
      strongestQueries: predictions
        .slice()
        .sort((a, b) => b.confidenceScore - a.confidenceScore || a.normalizedQuery.localeCompare(b.normalizedQuery))
        .slice(0, 5)
        .map((prediction) => ({
          query: prediction.query,
          intent: prediction.intent,
          confidenceScore: prediction.confidenceScore,
        })),
    },
  };
}

function chooseDecision(totalScore: number, highIntentCount: number, problemIntentCount: number): string {
  if (totalScore >= 70 && highIntentCount >= 3) {
    return 'validate deeper';
  }

  if (totalScore >= 45 || (highIntentCount >= 1 && problemIntentCount >= 1)) {
    return 'promising but incomplete';
  }

  return 'weak search-language signal';
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}
