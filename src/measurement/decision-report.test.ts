import { describe, expect, it } from 'vitest';
import type { ExperimentRow } from '../db/schema.js';
import { buildMeasurementReport } from './decision-report.js';
import { aggregateMeasurementEvents } from './metrics-aggregator.js';

describe('measurement decision report', () => {
  it('renders markdown and structured JSON for an inconclusive experiment', () => {
    const metrics = aggregateMeasurementEvents([]);
    const report = buildMeasurementReport({
      createdAt: '2026-07-07T10:00:00.000Z',
      events: [],
      experiment: experiment(),
      metrics,
      recommendation: {
        decision: 'inconclusive',
        killSignals: [],
        missingData: metrics.missingData,
        reason: 'No behavior events have been recorded.',
        strongSignals: [],
        weakSignals: [],
      },
      thresholdResults: [],
    });

    expect(report.markdown).toContain('# Measurement Report');
    expect(report.markdown).toContain('- Decision: inconclusive');
    expect(report.markdown).toContain('No experiment events have been recorded.');
    expect(report.json.decision).toBe('inconclusive');
    expect(report.json.metrics.totalEvents).toBe(0);
  });
});

function experiment(): ExperimentRow {
  return {
    completed_at: null,
    created_at: '2026-07-07T09:00:00.000Z',
    experiment_type: 'fake_door',
    id: 1,
    idea_id: 2,
    launched_at: null,
    report_id: 3,
    status: 'launched',
    threshold_json: '{"thresholds":[]}',
    title: 'Invoice fake-door test',
  };
}
