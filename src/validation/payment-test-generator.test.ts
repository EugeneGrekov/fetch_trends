import { describe, expect, it } from 'vitest';
import type { AutocompletePredictionRow, CompetitorRow, EvidenceRow, IdeaRow, ReportRow, ScoreRow, SourceRow } from '../db/schema.js';
import { generatePaymentTest } from './payment-test-generator.js';

describe('payment test generator', () => {
  it('generates a payment-intent spec from strong stored evidence', () => {
    const result = generatePaymentTest(strongInput());

    expect(result.spec.decision).toBe('preorder');
    expect(result.spec.landingPageDraft).toEqual(expect.objectContaining({
      h1: 'calculate late fees for overdue freelance invoices',
    }));
    expect(result.spec.analyticsEvents.map((event) => event.name)).toContain('payment_click');
    expect(result.spec.decisionThresholds).toEqual([
      expect.objectContaining({ signal: 'strong' }),
      expect.objectContaining({ signal: 'weak' }),
      expect.objectContaining({ signal: 'kill' }),
    ]);
    expect(result.markdown).toContain('This is a payment-intent test, not proof that the business is validated.');
    expect(result.markdown).toContain('Exact conversion benchmarks are assumptions until real traffic exists.');
  });

  it('refuses optimistic landing page copy for weak ideas', () => {
    const result = generatePaymentTest({
      ...strongInput(),
      competitors: [],
      evidence: [],
      idea: { ...idea(), expected_price: null },
      predictions: [
        prediction({
          confidence_score: 25,
          id: 1,
          intent: 'low intent',
          prediction: 'invoice template',
        }),
      ],
      score: {
        ...score(),
        decision: 'weak search-language signal',
        total_score: 28,
      },
      sources: [],
    });

    expect(result.spec.decision).toBe('not_justified');
    expect(result.spec.landingPageDraft).toBeNull();
    expect(result.spec.ctaVariants).toEqual([]);
    expect(result.markdown).toContain('No optimistic landing page copy is generated for this idea.');
    expect(result.markdown).not.toContain('Reserve one-time access');
  });
});

function strongInput(): Parameters<typeof generatePaymentTest>[0] {
  return {
    competitors: [
      competitor({
        name: 'Invoice Fee Tool',
        price_text: '$29 one-time',
      }),
    ],
    evidence: [
      evidence({
        complaint: 'I never know what late fee is legal to add.',
        payment_signal: 'direct',
        quote: 'I would pay once if it generated the fee wording for an overdue invoice.',
        trigger: 'calculate late fees for overdue freelance invoices',
      }),
      evidence({
        complaint: 'Clients ignore overdue reminders.',
        id: 2,
        quote: 'I keep rewriting overdue reminders and guessing the late fee.',
      }),
    ],
    idea: idea(),
    predictions: [
      prediction({
        id: 1,
        intent: 'high purchase intent',
        prediction: 'invoice late fee calculator for freelancers',
      }),
      prediction({
        id: 2,
        intent: 'comparison intent',
        prediction: 'best invoice late fee calculator',
      }),
      prediction({
        id: 3,
        intent: 'problem intent',
        prediction: 'how much late fee can i charge on invoice',
      }),
    ],
    report: report(),
    score: score(),
    sources: [
      {
        fetched_at: '2026-07-07T10:00:00.000Z',
        id: 1,
        idea_id: 1,
        snippet: 'Freelancers discuss overdue invoice fee wording.',
        source_type: 'reddit_thread',
        title: 'Overdue invoice fees',
        url: 'https://example.test/thread',
      },
    ],
  };
}

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

function report(): ReportRow {
  return {
    created_at: '2026-07-07T10:00:00.000Z',
    id: 10,
    idea_id: 1,
    job_id: 5,
    json: '{"decision":"validate deeper"}',
    markdown: '# Validation Report',
    report_type: 'search-language-validation',
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

function evidence(overrides: Partial<EvidenceRow>): EvidenceRow {
  return {
    complaint: null,
    confidence_score: 82,
    created_at: '2026-07-07T10:00:00.000Z',
    id: 1,
    idea_id: 1,
    pain_type: 'pricing uncertainty',
    payment_signal: null,
    quote: 'I need help.',
    source_id: 1,
    trigger: null,
    urgency: 'high',
    workaround: null,
    ...overrides,
  };
}

function competitor(overrides: Partial<CompetitorRow>): CompetitorRow {
  return {
    created_at: '2026-07-07T10:00:00.000Z',
    id: 1,
    idea_id: 1,
    name: 'Competitor',
    price_text: null,
    pricing_model: null,
    product_type: 'direct_competitor',
    review_summary: null,
    strengths_json: null,
    url: 'https://example.test',
    weaknesses_json: null,
    ...overrides,
  };
}

function prediction(overrides: Partial<AutocompletePredictionRow>): AutocompletePredictionRow {
  return {
    confidence_score: 88,
    country: 'US',
    created_at: '2026-07-07T10:00:00.000Z',
    id: 1,
    idea_id: 1,
    intent: 'high purchase intent',
    language: 'en',
    normalized_prediction: overrides.prediction?.toLowerCase() ?? 'invoice late fee calculator',
    prediction: 'invoice late fee calculator',
    query_id: null,
    source_prefix: 'invoice late fee',
    source_seed: 'invoice late fee',
    ...overrides,
  };
}
