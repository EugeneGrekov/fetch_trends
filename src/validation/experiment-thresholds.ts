import type { PaymentTestDecision } from './payment-test-generator.js';

export type AnalyticsEventName =
  | 'page_view'
  | 'pricing_view'
  | 'cta_click'
  | 'preview_start'
  | 'preview_complete'
  | 'checkout_start'
  | 'payment_click'
  | 'email_submit'
  | 'reply_received'
  | 'refund_requested'
  | 'support_contact';

export interface AnalyticsEventSpec {
  name: AnalyticsEventName;
  trigger: string;
  payloadFields: string[];
  whyItMatters: string;
  strongSignal: string;
  weakSignal: string;
  killSignal: string;
}

export interface ExperimentThreshold {
  signal: 'strong' | 'weak' | 'kill';
  condition: string;
  rationale: string;
}

export interface ExperimentThresholdPlan {
  assumptionWarning: string;
  thresholds: ExperimentThreshold[];
}

const ASSUMPTION_WARNING = 'Exact conversion benchmarks are assumptions until real traffic exists.';

const EVENT_DEFINITIONS: Record<AnalyticsEventName, Omit<AnalyticsEventSpec, 'name'>> = {
  page_view: {
    trigger: 'A targeted visitor loads the draft landing page.',
    payloadFields: ['idea_id', 'source', 'campaign', 'page_variant'],
    whyItMatters: 'Shows whether the evidence-backed traffic source can deliver qualified visitors.',
    strongSignal: 'Targeted visitors stay long enough to inspect the offer.',
    weakSignal: 'Traffic arrives but does not continue to pricing or CTA events.',
    killSignal: 'Traffic is untargeted or bounces before reading the offer.',
  },
  pricing_view: {
    trigger: 'A visitor scrolls to or opens the pricing block.',
    payloadFields: ['idea_id', 'price_variant', 'page_variant'],
    whyItMatters: 'Separates curiosity from price inspection.',
    strongSignal: 'Pricing views occur before CTA or payment clicks.',
    weakSignal: 'Pricing is viewed but no one clicks the CTA.',
    killSignal: 'Pricing causes immediate drop-off across targeted traffic.',
  },
  cta_click: {
    trigger: 'A visitor clicks the primary or secondary CTA.',
    payloadFields: ['idea_id', 'cta_text', 'cta_position', 'price_variant', 'page_variant'],
    whyItMatters: 'Measures offer interest before asking for payment behavior.',
    strongSignal: 'CTA clicks come from targeted visitors after pricing is visible.',
    weakSignal: 'CTA clicks happen only on free or vague CTAs.',
    killSignal: 'Qualified visitors do not click any CTA.',
  },
  preview_start: {
    trigger: 'A visitor starts a preview, upload, checklist, or concierge intake.',
    payloadFields: ['idea_id', 'preview_type', 'source', 'page_variant'],
    whyItMatters: 'Shows willingness to spend effort on the painful task.',
    strongSignal: 'Visitors submit enough context to receive a useful preview.',
    weakSignal: 'Visitors start but abandon before giving task context.',
    killSignal: 'CTA clicks do not convert into any preview attempt.',
  },
  preview_complete: {
    trigger: 'A visitor reaches the end of the preview or intake flow.',
    payloadFields: ['idea_id', 'preview_type', 'completion_time_seconds', 'page_variant'],
    whyItMatters: 'Indicates the workflow is credible enough to finish before payment.',
    strongSignal: 'Completed previews precede checkout starts or direct replies.',
    weakSignal: 'Preview completion happens without price or payment interest.',
    killSignal: 'Most qualified preview attempts fail or stall.',
  },
  checkout_start: {
    trigger: 'A visitor reaches the mocked checkout, payment-intent, or preorder step.',
    payloadFields: ['idea_id', 'price_variant', 'test_type', 'page_variant'],
    whyItMatters: 'Separates CTA interest from payment-friction intent.',
    strongSignal: 'Checkout starts occur after visitors understand the price and workflow.',
    weakSignal: 'Checkout starts are rare and do not produce payment clicks or replies.',
    killSignal: 'No checkout starts occur after meaningful targeted traffic.',
  },
  payment_click: {
    trigger: 'A visitor clicks the payment or preorder button before the unavailable-product notice.',
    payloadFields: ['idea_id', 'price_variant', 'test_type', 'page_variant'],
    whyItMatters: 'This is the closest fake-door proxy for willingness to pay without processing money.',
    strongSignal: 'Multiple targeted visitors click payment after seeing the price.',
    weakSignal: 'Visitors click payment only at very low price variants.',
    killSignal: 'No payment clicks after enough targeted checkout starts.',
  },
  email_submit: {
    trigger: 'A visitor submits an email for access, a reply, or a concierge follow-up.',
    payloadFields: ['idea_id', 'source', 'test_type', 'page_variant'],
    whyItMatters: 'Captures a follow-up path after fake-door or concierge disclosure.',
    strongSignal: 'Submissions include task details or explicit purchase intent.',
    weakSignal: 'Submissions are generic waitlist curiosity.',
    killSignal: 'Visitors refuse follow-up after learning the product is not ready.',
  },
  reply_received: {
    trigger: 'A visitor replies to follow-up with task details, urgency, or buying context.',
    payloadFields: ['idea_id', 'reply_category', 'price_variant', 'test_type'],
    whyItMatters: 'Adds qualitative proof behind quantitative clicks.',
    strongSignal: 'Replies mention urgent task context or ask when they can pay.',
    weakSignal: 'Replies are polite but non-committal.',
    killSignal: 'No replies from visitors who submitted contact details.',
  },
  refund_requested: {
    trigger: 'A participant asks for a refund or reverses a preorder during a manual test.',
    payloadFields: ['idea_id', 'price_variant', 'reason', 'test_type'],
    whyItMatters: 'Tracks trust and fulfillment risk if a manual paid test is later used.',
    strongSignal: 'Refund requests are rare and reasons are operationally fixable.',
    weakSignal: 'Refunds cluster around unclear expectations.',
    killSignal: 'Refund reasons show the core offer is not valuable.',
  },
  support_contact: {
    trigger: 'A visitor contacts support or asks a pre-purchase question.',
    payloadFields: ['idea_id', 'question_category', 'price_variant', 'test_type'],
    whyItMatters: 'Surfaces objections that landing copy and workflow must answer.',
    strongSignal: 'Questions are about timing, fit, security, or how to buy.',
    weakSignal: 'Questions show confusion about the basic offer.',
    killSignal: 'Questions reveal the workflow is not trusted or not painful enough.',
  },
};

export function buildAnalyticsEventPlan(decision: PaymentTestDecision): AnalyticsEventSpec[] {
  const eventNames: AnalyticsEventName[] = decision === 'fake_door' || decision === 'not_justified'
    ? ['page_view', 'pricing_view', 'cta_click', 'payment_click', 'email_submit']
    : [
        'page_view',
        'cta_click',
        'preview_start',
        'preview_complete',
        'checkout_start',
        'payment_click',
        'email_submit',
        'reply_received',
        'refund_requested',
        'support_contact',
      ];

  return eventNames.map((name) => ({ name, ...EVENT_DEFINITIONS[name] }));
}

export function buildExperimentThresholdPlan(args: {
  evidenceStrength: 'weak' | 'medium' | 'strong';
  score: number | null;
  testType: PaymentTestDecision;
}): ExperimentThresholdPlan {
  const visitorFloor = args.evidenceStrength === 'strong' ? 100 : 150;
  const killVisitorFloor = args.evidenceStrength === 'weak' ? 200 : 300;
  const paymentClickTarget = args.testType === 'fake_door' ? '2+ payment clicks' : '3+ payment clicks';
  const scoreContext = args.score == null ? 'No validation score was available.' : `Latest stored validation score is ${args.score}/100.`;

  return {
    assumptionWarning: ASSUMPTION_WARNING,
    thresholds: [
      {
        signal: 'strong',
        condition: `${visitorFloor} targeted visitors, 8+ CTA clicks, ${paymentClickTarget}, and 1+ direct reply asking for access or timing.`,
        rationale: `${scoreContext} Treat this as permission to continue manual validation, not proof of a validated business.`,
      },
      {
        signal: 'weak',
        condition: `${visitorFloor} targeted visitors with 2-7 CTA clicks, fewer than 3 payment clicks, or only generic waitlist emails.`,
        rationale: 'Keep the test open only if replies reveal sharper pain, a better segment, or clearer pricing language.',
      },
      {
        signal: 'kill',
        condition: `${killVisitorFloor} targeted visitors, under 1% CTA click rate, no payment clicks, and no replies with urgent task context.`,
        rationale: 'Stop the payment test and revisit positioning, target user, or the underlying idea before building.',
      },
    ],
  };
}
