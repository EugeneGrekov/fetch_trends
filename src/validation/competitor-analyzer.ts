import type { CreateCompetitorInput, CreateSourceInput } from '../db/schema.js';
import type { CompetitorItem } from '../utilities/competitors/types.js';
import type { SerpResultItem } from '../utilities/serp/types.js';
import { isPotentialCompetitorUrl, toSourceInput } from './source-normalizer.js';

export function pickCompetitorCandidateUrls(items: SerpResultItem[], limit: number): string[] {
  const seen = new Set<string>();
  const candidateUrls: string[] = [];

  for (const item of items) {
    if (!isPotentialCompetitorUrl(item.url) || seen.has(item.url)) {
      continue;
    }

    seen.add(item.url);
    candidateUrls.push(item.url);
    if (candidateUrls.length >= limit) {
      break;
    }
  }

  return candidateUrls;
}

export function buildCompetitorSourceInputs(ideaId: number, items: CompetitorItem[], fetchedAt: string): CreateSourceInput[] {
  return items.map((item) =>
    toSourceInput({
      ideaId,
      url: item.url,
      sourceType: 'competitor_page',
      title: item.name,
      snippet: item.positioning ?? item.excerpt ?? null,
      fetchedAt,
    }),
  );
}

export function buildCompetitorInputs(ideaId: number, items: CompetitorItem[], createdAt: string): CreateCompetitorInput[] {
  return items.map((item) => ({
    ideaId,
    name: item.name,
    url: item.url,
    productType: item.productType,
    priceText: item.priceText,
    pricingModel: item.pricingModel,
    strengthsJson: JSON.stringify(item.strengths),
    weaknessesJson: JSON.stringify(item.weaknesses),
    reviewSummary: item.reviewSummary ?? item.positioning ?? null,
    createdAt,
  }));
}
