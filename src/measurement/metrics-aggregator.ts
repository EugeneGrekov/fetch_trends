import type { DatabaseSync } from 'node:sqlite';
import { listExperimentEvents } from '../db/repositories/experiments.js';
import type { ExperimentEventRow } from '../db/schema.js';
import { MEASUREMENT_EVENT_NAMES } from './types.js';
import type { MeasurementEventName, MeasurementMetrics } from './types.js';

export function aggregateExperimentMetrics(db: DatabaseSync, experimentId: number): MeasurementMetrics {
  return aggregateMeasurementEvents(listExperimentEvents(db, experimentId));
}

export function aggregateMeasurementEvents(events: ExperimentEventRow[]): MeasurementMetrics {
  const eventTotals = Object.fromEntries(
    MEASUREMENT_EVENT_NAMES.map((eventName) => [eventName, 0]),
  ) as Record<MeasurementEventName, number>;

  const sessionIds = new Set<string>();
  for (const event of events) {
    if (MEASUREMENT_EVENT_NAMES.includes(event.event_name as MeasurementEventName)) {
      eventTotals[event.event_name as MeasurementEventName] += 1;
    }

    if (event.session_id) {
      sessionIds.add(event.session_id);
    }
  }

  const visitors = countVisitors(eventTotals, sessionIds);
  const funnel = {
    pageView: eventTotals.page_view,
    pricingView: eventTotals.pricing_view,
    ctaClick: eventTotals.cta_click,
    previewStart: eventTotals.preview_start,
    previewComplete: eventTotals.preview_complete,
    checkoutStart: eventTotals.checkout_start,
    paymentClick: eventTotals.payment_click,
    emailSubmit: eventTotals.email_submit,
    replyReceived: eventTotals.reply_received,
    refundRequested: eventTotals.refund_requested,
    supportContact: eventTotals.support_contact,
  };
  const occurredAtValues = events.map((event) => event.occurred_at).sort();

  return {
    eventTotals,
    firstEventAt: occurredAtValues[0] ?? null,
    funnel,
    lastEventAt: occurredAtValues.at(-1) ?? null,
    missingData: buildMissingData(events, eventTotals, visitors),
    rates: {
      ctaClickRate: rate(eventTotals.cta_click, visitors),
      previewStartRate: rate(eventTotals.preview_start, visitors),
      previewCompleteRate: rate(eventTotals.preview_complete, Math.max(eventTotals.preview_start, 0)),
      checkoutStartRate: rate(eventTotals.checkout_start, visitors),
      paymentClickRate: rate(eventTotals.payment_click, visitors),
      emailSubmitRate: rate(eventTotals.email_submit, visitors),
      replyRate: rate(eventTotals.reply_received, Math.max(eventTotals.email_submit, 0)),
      refundRate: rate(eventTotals.refund_requested, Math.max(eventTotals.payment_click, 0)),
      supportContactRate: rate(eventTotals.support_contact, visitors),
    },
    totalEvents: events.length,
    visitors,
  };
}

function countVisitors(eventTotals: Record<MeasurementEventName, number>, sessionIds: Set<string>): number {
  if (sessionIds.size > 0) {
    return sessionIds.size;
  }

  if (eventTotals.page_view > 0) {
    return eventTotals.page_view;
  }

  return 0;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(4));
}

function buildMissingData(
  events: ExperimentEventRow[],
  eventTotals: Record<MeasurementEventName, number>,
  visitors: number,
): string[] {
  const missing: string[] = [];

  if (events.length === 0) {
    missing.push('No experiment events have been recorded.');
  }

  if (visitors === 0) {
    missing.push('No visitor baseline is available from session IDs or page_view events.');
  }

  if (eventTotals.cta_click === 0) {
    missing.push('No CTA clicks have been recorded.');
  }

  if (eventTotals.payment_click === 0) {
    missing.push('No payment-intent clicks have been recorded.');
  }

  if (eventTotals.reply_received === 0) {
    missing.push('No direct replies have been recorded.');
  }

  return missing;
}
