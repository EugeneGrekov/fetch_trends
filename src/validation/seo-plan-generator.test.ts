import { describe, expect, it } from 'vitest';
import type { AutocompletePredictionRow, CompetitorRow, EvidenceRow, IdeaRow, QueryRow, ScoreRow, SourceRow } from '../db/schema.js';
import { generateSeoPlan } from './seo-plan-generator.js';

describe('seo plan generator', () => {
  it('creates focused page plans from stored query fixtures', () => {
    const result = generateSeoPlan({
      competitors: [competitor()],
      evidence: [evidence()],
      idea: idea(),
      predictions: [
        prediction(1, 'high purchase intent', 'invoice late fee calculator for freelancers'),
        prediction(2, 'comparison intent', 'invoice late fee calculator alternatives'),
        prediction(3, 'how-to intent', 'how to charge late fee on invoice'),
        prediction(4, 'problem intent', 'client refuses to pay late invoice'),
      ],
      queries: [
        query(1, 'invoice late fee calculator', 'high purchase intent'),
        query(2, 'how to charge late fee on invoice', 'how-to intent'),
      ],
      score: score(),
      sources: [source()],
    });

    expect(result.plan.decision).toBe('build_now');
    expect(result.plan.pages.map((page) => page.pageType)).toEqual([
      'money_page',
      'how_to_guide',
      'comparison_page',
      'problem_troubleshooting_page',
      'faq_trust_page',
    ]);
    expect(result.plan.pages[0]).toEqual(expect.objectContaining({
      evidenceSource: 'autocomplete_prediction:1',
      targetQuery: 'invoice late fee calculator for freelancers',
    }));
    expect(result.markdown).toContain('This plan is based on stored query and evidence data only.');
    expect(result.markdown).toContain('Do not publish broad generic blog posts unless future stored evidence shows demand.');
  });
});

function idea(): IdeaRow {
  return {
    business_model: 'one-time payment',
    created_at: '2026-07-07T10:00:00.000Z',
    expected_price: '$29',
    id: 1,
    normalized_json: null,
    platform: 'web',
    raw_description: 'Generate late fee wording and amounts for overdue freelance invoices.',
    status: 'validated',
    target_market: 'freelance designers',
    title: 'Invoice late fee calculator',
    updated_at: '2026-07-07T10:00:00.000Z',
  };
}

function score(): ScoreRow {
  return {
    created_at: '2026-07-07T10:00:00.000Z',
    decision: 'validate deeper',
    id: 1,
    idea_id: 1,
    score_json: '{}',
    score_type: 'search-language',
    total_score: 82,
  };
}

function prediction(id: number, intent: string, value: string): AutocompletePredictionRow {
  return {
    confidence_score: 88 - id,
    country: 'US',
    created_at: '2026-07-07T10:00:00.000Z',
    id,
    idea_id: 1,
    intent,
    language: 'en',
    normalized_prediction: value,
    prediction: value,
    query_id: null,
    source_prefix: value,
    source_seed: value,
  };
}

function query(id: number, value: string, intent: string): QueryRow {
  return {
    created_at: '2026-07-07T10:00:00.000Z',
    id,
    idea_id: 1,
    intent_type: intent,
    normalized_query: value,
    priority_score: 80,
    query: value,
    source: 'fixture',
  };
}

function source(): SourceRow {
  return {
    fetched_at: '2026-07-07T10:00:00.000Z',
    id: 1,
    idea_id: 1,
    snippet: 'Search results include competitor and forum pages.',
    source_type: 'serp_result',
    title: 'SERP result',
    url: 'https://example.test/serp',
  };
}

function evidence(): EvidenceRow {
  return {
    complaint: 'Clients ignore overdue reminders.',
    confidence_score: 82,
    created_at: '2026-07-07T10:00:00.000Z',
    id: 1,
    idea_id: 1,
    pain_type: 'payment delay',
    payment_signal: 'direct',
    quote: 'I would pay once for the right late-fee wording.',
    source_id: 1,
    trigger: 'overdue freelance invoices',
    urgency: 'high',
    workaround: 'manual email templates',
  };
}

function competitor(): CompetitorRow {
  return {
    created_at: '2026-07-07T10:00:00.000Z',
    id: 1,
    idea_id: 1,
    name: 'Invoice Fee Tool',
    price_text: '$29 one-time',
    pricing_model: 'one-time',
    product_type: 'direct_competitor',
    review_summary: 'Users mention wording uncertainty.',
    strengths_json: null,
    url: 'https://example.test/tool',
    weaknesses_json: null,
  };
}
