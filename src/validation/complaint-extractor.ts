import type { CreateEvidenceInput, SourceRow } from '../db/schema.js';

const PAIN_PATTERNS: Array<{ complaint: string; painType: string; pattern: RegExp; urgency: string }> = [
  { complaint: 'reliability', painType: 'reliability', pattern: /\b(?:not working|stops working|fails|broken|loses)\b/i, urgency: 'high' },
  { complaint: 'manual_workflow', painType: 'workflow', pattern: /\b(?:manual|manually|have to|must open|copy paste)\b/i, urgency: 'medium' },
  { complaint: 'support_gap', painType: 'support', pattern: /\b(?:confusing|hard to|difficult|unclear)\b/i, urgency: 'medium' },
  { complaint: 'cost', painType: 'cost', pattern: /\b(?:refund|too expensive|subscription|paid)\b/i, urgency: 'medium' },
];

const PAYMENT_PATTERN = /\b(?:\$ ?\d|one-time|subscription|paid|refund|pricing)\b/i;
const WORKAROUND_PATTERN = /\b(?:manual(?:ly)?|open it first|copy paste|export by hand|workaround)\b[^.?!]*/i;

export function extractEvidenceFromSource(args: {
  createdAt: string;
  ideaId: number;
  source: Pick<SourceRow, 'id' | 'source_type' | 'title' | 'snippet'>;
}): CreateEvidenceInput[] {
  const text = [args.source.title, args.source.snippet].filter(Boolean).join('. ').trim();
  if (!text) {
    return [];
  }

  const evidence: CreateEvidenceInput[] = [];
  const complaintSentence = findSentence(text, PAIN_PATTERNS.map((item) => item.pattern));
  if (complaintSentence) {
    const pain = PAIN_PATTERNS.find((item) => item.pattern.test(complaintSentence));
    const workaround = extractWorkaround(complaintSentence);
    evidence.push({
      ideaId: args.ideaId,
      sourceId: args.source.id,
      quote: complaintSentence,
      painType: pain?.painType ?? null,
      trigger: inferTrigger(args.source.source_type, complaintSentence),
      workaround,
      complaint: pain?.complaint ?? null,
      urgency: pain?.urgency ?? 'low',
      paymentSignal: PAYMENT_PATTERN.test(complaintSentence) ? inferPaymentSignal(complaintSentence) : 'none',
      confidenceScore: 72,
      createdAt: args.createdAt,
    });
  }

  const paymentSentence = findSentence(text, [PAYMENT_PATTERN]);
  if (paymentSentence && paymentSentence !== complaintSentence) {
    evidence.push({
      ideaId: args.ideaId,
      sourceId: args.source.id,
      quote: paymentSentence,
      painType: 'pricing',
      trigger: inferTrigger(args.source.source_type, paymentSentence),
      workaround: extractWorkaround(paymentSentence),
      complaint: PAYMENT_PATTERN.test(paymentSentence) ? 'pricing_signal' : null,
      urgency: 'low',
      paymentSignal: inferPaymentSignal(paymentSentence),
      confidenceScore: 64,
      createdAt: args.createdAt,
    });
  }

  return evidence;
}

function findSentence(text: string, patterns: RegExp[]): string | null {
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  for (const sentence of sentences) {
    if (patterns.some((pattern) => pattern.test(sentence))) {
      return sentence;
    }
  }

  return null;
}

function inferTrigger(sourceType: string, quote: string): string {
  if (sourceType === 'review_page') {
    return 'review_surface';
  }

  if (sourceType === 'youtube_video') {
    return 'tutorial_gap';
  }

  if (/not working|fails|broken/i.test(quote)) {
    return 'failure_state';
  }

  return 'user_report';
}

function extractWorkaround(text: string): string | null {
  const match = text.match(WORKAROUND_PATTERN);
  return match?.[0]?.trim() ?? null;
}

function inferPaymentSignal(quote: string): string {
  if (/\$ ?\d|one-time|subscription|paid/i.test(quote)) {
    return 'strong';
  }

  if (/refund|pricing/i.test(quote)) {
    return 'weak';
  }

  return 'none';
}
