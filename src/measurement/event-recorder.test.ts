import { describe, expect, it } from 'vitest';
import { normalizeManualEvent, parseMeasurementEventCsv } from './event-recorder.js';

describe('measurement event recorder', () => {
  it('parses manual event CSV rows', () => {
    const events = parseMeasurementEventCsv([
      'event_name,occurred_at,source,session_id,metadata_json',
      'page_view,2026-07-07T10:00:00.000Z,manual,s1,{}',
      'cta_click,2026-07-07T10:01:00.000Z,manual,s1,"{""cta"":""primary, hero""}"',
    ].join('\n'));

    expect(events).toEqual([
      {
        eventName: 'page_view',
        occurredAt: '2026-07-07T10:00:00.000Z',
        source: 'manual',
        sessionId: 's1',
        metadataJson: '{}',
      },
      {
        eventName: 'cta_click',
        occurredAt: '2026-07-07T10:01:00.000Z',
        source: 'manual',
        sessionId: 's1',
        metadataJson: '{"cta":"primary, hero"}',
      },
    ]);
  });

  it('rejects unsupported events and invalid metadata', () => {
    expect(() => normalizeManualEvent({
      eventName: 'made_up_event' as never,
      occurredAt: '2026-07-07T10:00:00.000Z',
      source: 'manual',
    })).toThrow('Unsupported measurement event');

    expect(() => parseMeasurementEventCsv([
      'event_name,occurred_at,source,metadata_json',
      'page_view,2026-07-07T10:00:00.000Z,manual,{bad}',
    ].join('\n'))).toThrow('metadata_json must be valid JSON');
  });
});
