import type {
  CreateAutocompletePredictionInput,
  CreateCompetitorInput,
  CreateEvidenceInput,
  CreateExperimentDecisionInput,
  CreateExperimentEventInput,
  CreateExperimentInput,
  CreateIdeaDecisionInput,
  CreateIdeaInput,
  CreateJobInput,
  CreateMeasurementSnapshotInput,
  CreateQueryInput,
  CreateReportInput,
  CreateRevalidationQueueInput,
  CreateRevalidationRunInput,
  CreateScoreInput,
  CreateSourceInput,
  CreateToolRunInput,
} from '../db/schema.js';

export const FIXTURE_NOW = '2026-07-07T10:00:00.000Z';
export const FIXTURE_LATER = '2026-07-07T10:05:00.000Z';

export function ideaFixture(overrides: Partial<CreateIdeaInput> = {}): CreateIdeaInput {
  return {
    title: 'Automatic parking location app',
    rawDescription: 'Automatic app that saves parking location when Bluetooth disconnects.',
    normalizedJson: JSON.stringify({
      cleanedIdea: 'Automatic app that saves parking location when Bluetooth disconnects.',
      source: 'fixture',
    }),
    targetMarket: 'drivers',
    platform: 'Android',
    expectedPrice: '$29 one-time',
    businessModel: 'one-time software',
    status: 'new',
    ...overrides,
  };
}

export function jobFixture(ideaId: number, overrides: Partial<CreateJobInput> = {}): CreateJobInput {
  return {
    ideaId,
    jobType: 'validate',
    status: 'running',
    startedAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function toolRunFixture(jobId: number, overrides: Partial<CreateToolRunInput> = {}): CreateToolRunInput {
  return {
    jobId,
    toolName: 'autocomplete',
    inputJson: JSON.stringify({ seeds: ['automatic parking location app'] }),
    metadataJson: JSON.stringify({ fixture: true }),
    status: 'running',
    startedAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function queryFixture(ideaId: number, overrides: Partial<CreateQueryInput> = {}): CreateQueryInput {
  return {
    ideaId,
    query: 'automatic parking location app',
    normalizedQuery: 'automatic parking location app',
    intentType: 'problem intent',
    source: 'fixture',
    priorityScore: 100,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function autocompletePredictionFixture(
  ideaId: number,
  overrides: Partial<CreateAutocompletePredictionInput> = {},
): CreateAutocompletePredictionInput {
  return {
    ideaId,
    queryId: null,
    prediction: 'automatic parking location app android',
    normalizedPrediction: 'automatic parking location app android',
    intent: 'problem intent',
    confidenceScore: 88,
    sourceSeed: 'automatic parking location app',
    sourcePrefix: 'automatic parking location app',
    country: 'US',
    language: 'en',
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function sourceFixture(ideaId: number, overrides: Partial<CreateSourceInput> = {}): CreateSourceInput {
  return {
    ideaId,
    url: 'https://www.reddit.com/r/androidapps/comments/example/',
    sourceType: 'reddit_thread',
    title: 'Parking app keeps losing location',
    snippet: 'The app loses my parked location unless I open it first.',
    fetchedAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function evidenceFixture(
  ideaId: number,
  sourceId: number,
  overrides: Partial<CreateEvidenceInput> = {},
): CreateEvidenceInput {
  return {
    ideaId,
    sourceId,
    quote: 'The app loses my parked location unless I open it first.',
    painType: 'reliability',
    trigger: 'Bluetooth disconnects',
    workaround: 'Open the app before leaving the car.',
    complaint: 'Location is lost.',
    urgency: 'medium',
    paymentSignal: 'weak',
    confidenceScore: 72,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function competitorFixture(ideaId: number, overrides: Partial<CreateCompetitorInput> = {}): CreateCompetitorInput {
  return {
    ideaId,
    name: 'Park Saver',
    url: 'https://parksaver.app',
    productType: 'direct_competitor',
    priceText: '$29 one-time',
    pricingModel: 'one-time',
    strengthsJson: JSON.stringify(['Clear positioning']),
    weaknessesJson: JSON.stringify(['Reliability complaints']),
    reviewSummary: 'Users want better reliability.',
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function scoreFixture(ideaId: number, overrides: Partial<CreateScoreInput> = {}): CreateScoreInput {
  return {
    ideaId,
    scoreType: 'search-language',
    scoreJson: JSON.stringify({ averageConfidence: 88, fixture: true }),
    totalScore: 72,
    decision: 'validate deeper',
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function reportFixture(ideaId: number, overrides: Partial<CreateReportInput> = {}): CreateReportInput {
  return {
    ideaId,
    jobId: null,
    reportType: 'search-language-validation',
    markdown: '# Validation Report\n\nFixture report.',
    json: JSON.stringify({ decision: 'validate deeper' }),
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function experimentFixture(ideaId: number, overrides: Partial<CreateExperimentInput> = {}): CreateExperimentInput {
  return {
    ideaId,
    reportId: null,
    experimentType: 'fake_door',
    title: 'Parking fake-door test',
    status: 'launched',
    thresholdJson: JSON.stringify({ thresholds: [] }),
    createdAt: FIXTURE_NOW,
    launchedAt: FIXTURE_LATER,
    completedAt: null,
    ...overrides,
  };
}

export function experimentEventFixture(
  experimentId: number,
  overrides: Partial<CreateExperimentEventInput> = {},
): CreateExperimentEventInput {
  return {
    experimentId,
    eventName: 'page_view',
    occurredAt: FIXTURE_LATER,
    source: 'fixture',
    sessionId: 'fixture-session',
    metadataJson: JSON.stringify({ fixture: true }),
    createdAt: FIXTURE_LATER,
    ...overrides,
  };
}

export function measurementSnapshotFixture(
  experimentId: number,
  overrides: Partial<CreateMeasurementSnapshotInput> = {},
): CreateMeasurementSnapshotInput {
  return {
    experimentId,
    metricsJson: JSON.stringify({ visitors: 1 }),
    thresholdResultsJson: JSON.stringify([]),
    createdAt: FIXTURE_LATER,
    ...overrides,
  };
}

export function experimentDecisionFixture(
  experimentId: number,
  overrides: Partial<CreateExperimentDecisionInput> = {},
): CreateExperimentDecisionInput {
  return {
    experimentId,
    decision: 'inconclusive',
    reason: 'Needs more visitors.',
    reportId: null,
    createdAt: FIXTURE_LATER,
    ...overrides,
  };
}

export function ideaDecisionFixture(ideaId: number, overrides: Partial<CreateIdeaDecisionInput> = {}): CreateIdeaDecisionInput {
  return {
    ideaId,
    experimentId: null,
    reportId: null,
    decision: 'persevere',
    confidence: 'medium',
    reason: 'Fixture evidence is promising but incomplete.',
    evidenceJson: JSON.stringify({ fixture: true }),
    nextAction: 'Run a payment test.',
    createdAt: FIXTURE_LATER,
    ...overrides,
  };
}

export function revalidationRunFixture(overrides: Partial<CreateRevalidationRunInput> = {}): CreateRevalidationRunInput {
  return {
    ideaId: null,
    mode: 'scan',
    status: 'running',
    startedAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function revalidationQueueFixture(
  ideaId: number,
  overrides: Partial<CreateRevalidationQueueInput> = {},
): CreateRevalidationQueueInput {
  return {
    ideaId,
    taskType: 'refresh_autocomplete',
    reason: 'Fixture evidence is stale.',
    staleReasonJson: JSON.stringify({ staleAfterDays: 90 }),
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}
