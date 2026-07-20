import { includesAny, normalizeQuery, startsWithAny } from './normalize.js';
import type { Intent, PredictionRecord, SourceMode, UniquePrediction } from './types.js';

const WEBSITE_TERMS = ['website', 'site', 'domain', 'company', 'business', 'owner'];
const CONTACT_TERMS = ['email', 'contact', 'address', 'mail', 'message'];
const ACTION_TOOL_TERMS = ['find', 'finder', 'search', 'chrome extension', 'extension', 'tool', 'gmail', 'open', 'send'];

const HOW_TO_STARTS = ['how to', 'can i', 'where', 'why', 'what is', 'how do', 'does'];
const WORKFLOW_TERMS = ['gmail', 'open', 'send', 'message', 'copy', 'export', 'crm'];
const TOOL_SEEKING_TERMS = ['finder', 'tool', 'chrome extension', 'extension', 'software', 'api'];
const COMMERCIAL_TERMS = ['pricing', 'price', 'alternative', 'review', 'best', 'hunter', 'apollo'];
const NAVIGATIONAL_TERMS = ['login', 'sign in', 'homepage', 'support', 'contact us'];

const NOISE_PATTERNS = [
  /\bemail email\b/,
  /\bgmail extension chrome\b/,
  /\bchrome extensions management\b/,
  /\bgmail extension development\b/,
];

export function classifyIntent(query: string): Intent {
  const normalized = normalizeQuery(query);
  const relevance = analyzeRelevance(normalized);

  if (relevance.status === 'rejected') {
    return 'irrelevant';
  }

  if (startsWithAny(normalized, HOW_TO_STARTS)) {
    return 'informational';
  }

  if (includesAny(normalized, WORKFLOW_TERMS)) {
    return 'workflow';
  }

  if (includesAny(normalized, COMMERCIAL_TERMS)) {
    return 'commercial';
  }

  if (includesAny(normalized, TOOL_SEEKING_TERMS)) {
    return 'tool-seeking';
  }

  if (includesAny(normalized, NAVIGATIONAL_TERMS)) {
    return 'navigational';
  }

  return 'informational';
}

export function detectPlatform(_query: string): 'unknown' {
  return 'unknown';
}

export function nextValidationStep(intent: Intent): string {
  switch (intent) {
    case 'tool-seeking':
      return 'check SERP competitors and extension marketplaces';
    case 'commercial':
      return 'check pricing pages and paid competitor positioning';
    case 'workflow':
      return 'test the workflow manually and look for friction';
    case 'informational':
      return 'check how-to pages and recurring questions';
    case 'navigational':
      return 'verify whether this is brand or destination-specific';
    case 'irrelevant':
      return 'reject as noise unless it reveals useful wording';
    default:
      return 'review manually';
  }
}

export function scoreConfidence(query: string, sourceSeedCount: number, sourcePrefixCount: number): number {
  const intent = classifyIntent(query);
  if (intent === 'irrelevant') {
    return 0;
  }

  return Math.min(100, 20 + sourceSeedCount * 15 + sourcePrefixCount * 10);
}

export function buildUniquePredictions(records: PredictionRecord[]): UniquePrediction[] {
  const groups = new Map<
    string,
    {
      query: string;
      normalizedQuery: string;
      timestamps: string[];
      sourceSeeds: Set<string>;
      sourcePrefixes: Set<string>;
      sourceModes: Set<SourceMode>;
      modifierValues: Set<string>;
      ranks: number[];
      country: string;
      language: string;
    }
  >();

  for (const record of records) {
    const exactPrediction = record.exactPrediction ?? record.prediction;
    const normalized = normalizeQuery(exactPrediction);
    if (!normalized) {
      continue;
    }

    const existing = groups.get(normalized);
    if (existing) {
      existing.timestamps.push(record.timestamp);
      existing.sourceSeeds.add(record.originalSeed);
      existing.sourcePrefixes.add(record.prefixSent ?? record.sourcePrefix);
      existing.sourceModes.add(record.sourceMode ?? 'organic');
      existing.ranks.push(record.predictionRank ?? 999);
      if (record.modifierUsed) {
        existing.modifierValues.add(record.modifierUsed);
      }
      continue;
    }

    groups.set(normalized, {
      query: exactPrediction,
      normalizedQuery: normalized,
      timestamps: [record.timestamp],
      sourceSeeds: new Set([record.originalSeed]),
      sourcePrefixes: new Set([record.prefixSent ?? record.sourcePrefix]),
      sourceModes: new Set([record.sourceMode ?? 'organic']),
      modifierValues: new Set(record.modifierUsed ? [record.modifierUsed] : []),
      ranks: [record.predictionRank ?? 999],
      country: record.country,
      language: record.language,
    });
  }

  return Array.from(groups.values())
    .map((group) => {
      const sourceSeeds = Array.from(group.sourceSeeds).sort((a, b) => a.localeCompare(b));
      const sourcePrefixes = Array.from(group.sourcePrefixes).sort((a, b) => a.localeCompare(b));
      const sourceModes = Array.from(group.sourceModes).sort((a, b) => a.localeCompare(b));
      const modifierUsedValues = Array.from(group.modifierValues).sort((a, b) => a.localeCompare(b));
      const sourceSeedCount = sourceSeeds.length;
      const sourcePrefixCount = sourcePrefixes.length;
      const averageRank = average(group.ranks);
      const relevance = analyzeRelevance(group.normalizedQuery);
      const intent = relevance.status === 'rejected' ? 'irrelevant' : classifyIntent(group.query);
      const evidenceScore = calculateEvidenceScore({
        sourceSeedCount,
        sourcePrefixCount,
        averageRank,
        sourceModes,
        relevanceStatus: relevance.status,
      });

      return {
        query: group.query,
        exactPrediction: group.query,
        normalizedQuery: group.normalizedQuery,
        intent,
        intentClassification: intent,
        confidenceScore: evidenceScore,
        evidenceScore,
        averageRank,
        sourceMode: sourceModes.length === 1 ? sourceModes[0] ?? 'organic' : 'mixed' as const,
        sourceModes,
        modifierUsed: modifierUsedValues[0],
        modifierUsedValues,
        relevanceStatus: relevance.status,
        relevanceGroups: relevance.groups,
        rejectionReasons: relevance.reasons,
        platform: 'unknown' as const,
        sourceSeeds,
        sourceSeedCount,
        sourcePrefixes,
        sourcePrefixCount,
        country: group.country,
        language: group.language,
        timestamp: group.timestamps.sort()[0] ?? new Date().toISOString(),
        nextValidationStep: nextValidationStep(intent),
      };
    })
    .sort((a, b) => {
      if (a.relevanceStatus !== b.relevanceStatus) {
        return a.relevanceStatus === 'relevant' ? -1 : 1;
      }

      if (b.evidenceScore !== a.evidenceScore) {
        return b.evidenceScore - a.evidenceScore;
      }

      return a.normalizedQuery.localeCompare(b.normalizedQuery);
    });
}

export function analyzeRelevance(normalizedQuery: string): {
  status: 'relevant' | 'rejected';
  groups: string[];
  reasons: string[];
} {
  const groups = [
    conceptGroup(normalizedQuery, 'website', WEBSITE_TERMS),
    conceptGroup(normalizedQuery, 'contact', CONTACT_TERMS),
    conceptGroup(normalizedQuery, 'action_tool', ACTION_TOOL_TERMS),
  ].filter((group): group is string => Boolean(group));
  const reasons: string[] = [];

  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      reasons.push('awkward_generated_or_off_topic_phrase');
      break;
    }
  }

  if (groups.length < 2) {
    reasons.push('fewer_than_two_relevant_concept_groups');
  }

  return {
    status: reasons.length === 0 ? 'relevant' : 'rejected',
    groups,
    reasons,
  };
}

function conceptGroup(normalizedQuery: string, group: string, terms: string[]): string | undefined {
  return includesAny(normalizedQuery, terms) ? group : undefined;
}

function calculateEvidenceScore(args: {
  sourceSeedCount: number;
  sourcePrefixCount: number;
  averageRank: number;
  sourceModes: SourceMode[];
  relevanceStatus: 'relevant' | 'rejected';
}): number {
  if (args.relevanceStatus === 'rejected') {
    return 0;
  }

  const seedScore = Math.min(30, args.sourceSeedCount * 12);
  const prefixScore = Math.min(25, args.sourcePrefixCount * 8);
  const rankScore = Math.max(0, 25 - Math.max(0, args.averageRank - 1) * 3);
  const organicScore = args.sourceModes.includes('organic') ? 15 : 5;
  const mixedSourceScore = args.sourceModes.length > 1 ? 5 : 0;

  return Math.min(100, Math.round(seedScore + prefixScore + rankScore + organicScore + mixedSourceScore));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 999;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}
