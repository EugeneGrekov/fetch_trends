import { buildUniquePredictions } from './analysis.js';
import { CaptchaDetectedError } from './collector.js';
import { ensureOutputDirectory, loadResumeState, saveResumeState, writeFinalReport } from './exporter.js';
import { generateDepth1Prefixes, generateDepth2Prefixes, prefixKey } from './expansion.js';
import { normalizeQuery } from './normalize.js';
import { uniqueNormalized } from './normalize.js';
import type {
  AutocompleteCollector,
  GeneratedPrefix,
  ProgressHandler,
  ResumeState,
  RunError,
  RunMetadata,
  RunOptions,
  RunReport,
  SeedSummary,
} from './types.js';

interface MutableRunState {
  runMetadata: RunMetadata;
  inputSeeds: string[];
  completedPrefixes: GeneratedPrefix[];
  generatedPrefixes: GeneratedPrefix[];
  collectedPredictions: RunReport['collectedPredictions'];
  perSeedSummaries: SeedSummary[];
  errors: RunError[];
  stopped: boolean;
}

export async function runAutocompleteResearch(
  options: RunOptions,
  collector: AutocompleteCollector,
  progress?: ProgressHandler,
): Promise<RunReport> {
  await ensureOutputDirectory(options.out);

  const state = await createInitialState(options);
  const completedPrefixKeys = new Set(state.completedPrefixes.map(prefixKey));

  try {
    for (let seedIndex = 0; seedIndex < options.seeds.length; seedIndex += 1) {
      const seed = options.seeds[seedIndex] ?? '';

      await processSeed({
        seed,
        seedIndex,
        options,
        state,
        collector,
        completedPrefixKeys,
        progress,
      });

      await saveState(state, options.out);

      if (state.stopped) {
        break;
      }
    }
  } finally {
    await collector.close();
  }

  state.runMetadata.completedAt = new Date().toISOString();
  const report = buildReport(state);
  await writeFinalReport(report, options.out);
  await saveState(state, options.out);

  return report;
}

async function createInitialState(options: RunOptions): Promise<MutableRunState> {
  const resumeState = options.resume ? await loadResumeState(options.out) : undefined;
  const resumed = resumeState && isCompatibleResume(resumeState, options)
    ? prepareResumeStateForRetry(resumeState)
    : undefined;
  const startedAt = resumed?.runMetadata.startedAt ?? new Date().toISOString();

  return {
    runMetadata: {
      startedAt,
      country: options.country,
      language: options.language,
      depth: options.depth,
      modifiers: options.modifiers,
      delayMs: options.delayMs,
      maxPrefixes: options.maxPrefixes,
      maxDepth2Prefixes: options.maxDepth2Prefixes,
      resume: options.resume,
      outputPath: options.out,
      completedAt: undefined,
    },
    inputSeeds: options.seeds,
    completedPrefixes: resumed?.completedPrefixes ?? [],
    generatedPrefixes: resumed?.generatedPrefixes ?? [],
    collectedPredictions: resumed?.collectedPredictions ?? [],
    perSeedSummaries: [],
    errors: resumed?.errors ?? [],
    stopped: false,
  };
}

function isCompatibleResume(state: ResumeState, options: RunOptions): boolean {
  const sameSeeds =
    state.inputSeeds.length === options.seeds.length &&
    state.inputSeeds.every((seed, index) => normalizeQuery(seed) === normalizeQuery(options.seeds[index] ?? ''));

  return (
    sameSeeds &&
    state.runMetadata.country === options.country &&
    state.runMetadata.language === options.language &&
    state.runMetadata.depth <= options.depth
  );
}

function prepareResumeStateForRetry(state: ResumeState): ResumeState {
  const retryablePrefixKeys = new Set(
    state.errors
      .map(errorToPrefixKey)
      .filter((key): key is string => Boolean(key)),
  );

  return {
    ...state,
    runMetadata: {
      ...state.runMetadata,
      completedAt: undefined,
      stoppedReason: undefined,
    },
    completedPrefixes: state.completedPrefixes.filter(
      (prefix) => !retryablePrefixKeys.has(prefixKey(prefix)),
    ),
    perSeedSummaries: [],
    errors: state.errors.filter((error) => !errorToPrefixKey(error)),
  };
}

function errorToPrefixKey(error: RunError): string | undefined {
  if (error.code !== 'PREFIX_FAILED' || !error.seed || !error.prefix || !error.depth) {
    return undefined;
  }

  return prefixKey({
    seed: error.seed,
    prefix: error.prefix,
    depth: error.depth,
  });
}

async function processSeed(args: {
  seed: string;
  seedIndex: number;
  options: RunOptions;
  state: MutableRunState;
  collector: AutocompleteCollector;
  completedPrefixKeys: Set<string>;
  progress?: ProgressHandler;
}): Promise<void> {
  const { seed, seedIndex, options, state, collector, completedPrefixKeys, progress } = args;
  const depth1Prefixes = generateDepth1Prefixes(seed, options.modifiers, options.maxPrefixes);
  registerGeneratedPrefixes(state, depth1Prefixes);

  const depth1Completed = await processPrefixes({
    seed,
    seedIndex,
    prefixes: depth1Prefixes,
    options,
    state,
    collector,
    completedPrefixKeys,
    progress,
  });

  if (state.stopped) {
    updateSeedSummary(seed, state, 'stopped');
    return;
  }

  if (options.depth === 2) {
    const depth2Prefixes = generateDepth2Prefixes(seed, state.collectedPredictions, options.maxDepth2Prefixes);
    registerGeneratedPrefixes(state, depth2Prefixes);

    const depth2Completed = await processPrefixes({
      seed,
      seedIndex,
      prefixes: depth2Prefixes,
      options,
      state,
      collector,
      completedPrefixKeys,
      progress,
    });

    updateSeedSummary(seed, state, depth1Completed && depth2Completed ? 'completed' : 'failed');
    return;
  }

  updateSeedSummary(seed, state, depth1Completed ? 'completed' : 'failed');
}

async function processPrefixes(args: {
  seed: string;
  seedIndex: number;
  prefixes: GeneratedPrefix[];
  options: RunOptions;
  state: MutableRunState;
  collector: AutocompleteCollector;
  completedPrefixKeys: Set<string>;
  progress?: ProgressHandler;
}): Promise<boolean> {
  const { seed, seedIndex, prefixes, options, state, collector, completedPrefixKeys, progress } = args;
  let hadPrefixFailure = false;

  for (const prefix of prefixes) {
    if (completedPrefixKeys.has(prefixKey(prefix))) {
      emitProgress(seed, seedIndex, prefixes, options, state, progress);
      continue;
    }

    try {
      const predictions = await collector.collect(prefix.prefix, {
        country: options.country,
        language: options.language,
      });
      const timestamp = new Date().toISOString();

      for (const prediction of uniqueNormalized(predictions)) {
        state.collectedPredictions.push({
          originalSeed: seed,
          sourcePrefix: prefix.prefix,
          prediction,
          timestamp,
          country: options.country,
          language: options.language,
          depth: prefix.depth,
        });
      }

      state.completedPrefixes.push(prefix);
      completedPrefixKeys.add(prefixKey(prefix));
      emitProgress(seed, seedIndex, prefixes, options, state, progress);
      await saveState(state, options.out);
      await randomDelay(options.delayMs);
    } catch (error) {
      if (error instanceof CaptchaDetectedError) {
        recordError(state, {
          seed,
          prefix: prefix.prefix,
          depth: prefix.depth,
          message: `${error.message} Stop collection and continue manually with --headless false or resume later.`,
          code: 'CAPTCHA_DETECTED',
        });
        state.runMetadata.stoppedReason = 'captcha_or_anti_bot_page_detected';
        state.stopped = true;
        await saveState(state, options.out);
        return false;
      }

      recordError(state, {
        seed,
        prefix: prefix.prefix,
        depth: prefix.depth,
        message: error instanceof Error ? error.message : String(error),
        code: 'PREFIX_FAILED',
      });
      hadPrefixFailure = true;
      emitProgress(seed, seedIndex, prefixes, options, state, progress);
      await saveState(state, options.out);
      await randomDelay(options.delayMs);
    }
  }

  return !hadPrefixFailure;
}

function registerGeneratedPrefixes(state: MutableRunState, prefixes: GeneratedPrefix[]): void {
  const existingKeys = new Set(state.generatedPrefixes.map(prefixKey));

  for (const prefix of prefixes) {
    const key = prefixKey(prefix);
    if (existingKeys.has(key)) {
      continue;
    }

    existingKeys.add(key);
    state.generatedPrefixes.push(prefix);
  }
}

function updateSeedSummary(seed: string, state: MutableRunState, status: SeedSummary['status']): void {
  const existingIndex = state.perSeedSummaries.findIndex((summary) => summary.seed === seed);
  const prefixKeys = new Set(
    state.completedPrefixes
      .filter((prefix) => prefix.seed === seed)
      .map((prefix) => prefixKey(prefix)),
  );
  const predictions = state.collectedPredictions.filter((prediction) => prediction.originalSeed === seed);
  const errors = state.errors.filter((error) => error.seed === seed);
  const summary: SeedSummary = {
    seed,
    prefixesProcessed: prefixKeys.size,
    predictionsCollected: predictions.length,
    uniquePredictionsCollected: buildUniquePredictions(predictions).length,
    errorCount: errors.length,
    status,
  };

  if (existingIndex === -1) {
    state.perSeedSummaries.push(summary);
  } else {
    state.perSeedSummaries[existingIndex] = summary;
  }
}

function emitProgress(
  seed: string,
  seedIndex: number,
  currentPrefixBatch: GeneratedPrefix[],
  options: RunOptions,
  state: MutableRunState,
  progress?: ProgressHandler,
): void {
  if (!progress) {
    return;
  }

  const seedPredictions = state.collectedPredictions.filter((prediction) => prediction.originalSeed === seed);
  const completedInBatch = state.completedPrefixes.filter(
    (completed) =>
      completed.seed === seed &&
      currentPrefixBatch.some((candidate) => prefixKey(candidate) === prefixKey(completed)),
  ).length;

  progress({
    currentSeed: seed,
    seedIndex: seedIndex + 1,
    seedCount: options.seeds.length,
    prefixesProcessed: completedInBatch,
    prefixesTotal: currentPrefixBatch.length,
    predictionsCollected: seedPredictions.length,
    uniquePredictionsCollected: buildUniquePredictions(seedPredictions).length,
  });
}

function recordError(
  state: MutableRunState,
  error: Omit<RunError, 'timestamp'>,
): void {
  state.errors.push({
    ...error,
    timestamp: new Date().toISOString(),
  });
}

function buildReport(state: MutableRunState): RunReport {
  const uniqueNormalizedPredictions = buildUniquePredictions(state.collectedPredictions);

  return {
    runMetadata: state.runMetadata,
    inputSeeds: state.inputSeeds,
    generatedPrefixes: state.generatedPrefixes,
    collectedPredictions: state.collectedPredictions,
    uniqueNormalizedPredictions,
    perSeedSummaries: state.perSeedSummaries,
    errors: state.errors,
    finalSummary: {
      seedCount: state.inputSeeds.length,
      generatedPrefixCount: state.generatedPrefixes.length,
      completedPrefixCount: state.completedPrefixes.length,
      predictionCount: state.collectedPredictions.length,
      uniquePredictionCount: uniqueNormalizedPredictions.length,
      errorCount: state.errors.length,
      stopped: state.stopped,
    },
  };
}

async function saveState(state: MutableRunState, outPath: string): Promise<void> {
  const resumeState: ResumeState = {
    version: 1,
    runMetadata: state.runMetadata,
    inputSeeds: state.inputSeeds,
    completedPrefixes: state.completedPrefixes,
    generatedPrefixes: state.generatedPrefixes,
    collectedPredictions: state.collectedPredictions,
    perSeedSummaries: state.perSeedSummaries,
    errors: state.errors,
  };

  await saveResumeState(resumeState, outPath);
}

async function randomDelay(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  const low = delayMs * 0.75;
  const high = delayMs * 1.25;
  const waitMs = Math.round(low + Math.random() * (high - low));
  await new Promise((resolve) => {
    setTimeout(resolve, waitMs);
  });
}
