import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, resolveDatabasePath } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import {
  completeBridgeJob,
  createOrGetBridgeJob,
  failBridgeJob,
  failInterruptedBridgeJobs,
  findBridgeJob,
  findNextQueuedBridgeJob,
  hasProcessingBridgeJob,
  listBridgeJobs,
  retryBridgeJob,
  startBridgeJob,
} from './jobs.js';
import { normalizeAutocompleteRequest } from './protocol.js';
import { createAutocompleteResearchRunner } from './research.js';
import type {
  AutocompleteBridgeJob,
  AutocompleteCheckRequest,
  AutocompleteResearchRunner,
} from './types.js';

export interface AutocompleteBridgeServiceOptions {
  dbPath?: string;
  resultsDir?: string;
  researchRunner?: AutocompleteResearchRunner;
  now?: () => Date;
  logger?: (message: string) => void;
}

export class BridgeJobNotFoundError extends Error {}
export class BridgeJobConflictError extends Error {}

export class AutocompleteBridgeService {
  readonly dbPath: string;
  readonly resultsDir: string;
  private readonly events = new EventEmitter();
  private readonly logger: (message: string) => void;
  private readonly now: () => Date;
  private readonly researchRunner: AutocompleteResearchRunner;
  private workerPromise: Promise<void> | undefined;

  constructor(options: AutocompleteBridgeServiceOptions = {}) {
    this.dbPath = resolveDatabasePath(options.dbPath);
    this.resultsDir = options.resultsDir ?? './results/chatgpt-autocomplete';
    this.researchRunner = options.researchRunner ?? createAutocompleteResearchRunner(this.resultsDir);
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? ((message) => process.stdout.write(`${message}\n`));
    this.events.setMaxListeners(0);
  }

  async initialize(): Promise<{ interruptedJobs: number }> {
    const interruptedJobs = await this.withDb((db) => failInterruptedBridgeJobs(db, this.timestamp()));
    this.wakeWorker();
    return { interruptedJobs };
  }

  async submit(
    requestValue: AutocompleteCheckRequest | unknown,
    username: string,
  ): Promise<{ cached: boolean; job: AutocompleteBridgeJob }> {
    const request = normalizeAutocompleteRequest(requestValue);
    const created = await this.withDb((db) => createOrGetBridgeJob(db, request, username, this.timestamp()));
    if (created.created) {
      this.log(`[autocomplete-bridge] job queued id=${created.job.id} user=${JSON.stringify(username)}`);
    }
    this.wakeWorker();

    return {
      cached: !created.created,
      job: created.job,
    };
  }

  async getJob(id: number): Promise<AutocompleteBridgeJob> {
    const job = await this.withDb((db) => findBridgeJob(db, id));
    if (!job) {
      throw new BridgeJobNotFoundError(`Autocomplete job ${id} was not found.`);
    }

    return job;
  }

  async listJobs(limit = 50): Promise<AutocompleteBridgeJob[]> {
    return this.withDb((db) => listBridgeJobs(db, limit));
  }

  async retry(id: number): Promise<AutocompleteBridgeJob> {
    const existing = await this.getJob(id);
    if (existing.status !== 'failed') {
      throw new BridgeJobConflictError(`Autocomplete job ${id} is not failed.`);
    }

    const job = await this.withDb((db) => retryBridgeJob(db, id, this.timestamp()));
    this.log(`[autocomplete-bridge] job queued id=${job.id} reason=retry`);
    this.notify(job);
    this.wakeWorker();
    return job;
  }

  async waitForJob(id: number, timeoutMs = 30_000): Promise<AutocompleteBridgeJob> {
    const initial = await this.getJob(id);
    if (isTerminal(initial)) {
      return initial;
    }

    return new Promise<AutocompleteBridgeJob>((resolvePromise, rejectPromise) => {
      let finished = false;
      const eventName = this.eventName(id);

      const finish = (operation: () => void): void => {
        if (finished) {
          return;
        }

        finished = true;
        clearTimeout(timer);
        this.events.off(eventName, onChange);
        operation();
      };

      const onChange = (job: AutocompleteBridgeJob): void => {
        finish(() => resolvePromise(job));
      };

      const timer = setTimeout(() => {
        void this.getJob(id).then(
          (job) => finish(() => resolvePromise(job)),
          (error) => finish(() => rejectPromise(error)),
        );
      }, timeoutMs);

      this.events.on(eventName, onChange);

      void this.getJob(id).then(
        (current) => {
          if (current.updatedAt !== initial.updatedAt || current.status !== initial.status) {
            finish(() => resolvePromise(current));
          }
        },
        (error) => finish(() => rejectPromise(error)),
      );
    });
  }

  async waitUntilIdle(): Promise<void> {
    while (this.workerPromise) {
      await this.workerPromise;
    }
  }

  private wakeWorker(): void {
    if (this.workerPromise) {
      return;
    }

    this.workerPromise = this.processQueue().finally(() => {
      this.workerPromise = undefined;
      void this.restartWorkerIfQueued();
    });
  }

  private async restartWorkerIfQueued(): Promise<void> {
    const hasQueuedJob = await this.withDb((db) => Boolean(findNextQueuedBridgeJob(db)));
    if (hasQueuedJob) {
      this.wakeWorker();
    }
  }

  private async processQueue(): Promise<void> {
    while (true) {
      const job = await this.claimNextJob();
      if (!job) {
        return;
      }

      this.log(`[autocomplete-bridge] job started id=${job.id}`);
      this.notify(job);

      try {
        const result = await this.researchRunner(job);
        const completed = await this.withDb((db) => completeBridgeJob(
          db,
          job.id,
          result.markdown,
          result.outputPath,
          this.timestamp(),
        ));
        this.log(`[autocomplete-bridge] job finished id=${completed.id} status=completed`);
        this.notify(completed);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const failed = await this.withDb((db) => failBridgeJob(
          db,
          job.id,
          errorMessage,
          this.timestamp(),
        ));
        this.log(
          `[autocomplete-bridge] job finished id=${failed.id} status=failed error=${JSON.stringify(errorMessage)}`,
        );
        this.notify(failed);
      }
    }
  }

  private async claimNextJob(): Promise<AutocompleteBridgeJob | undefined> {
    return this.withDb((db) => {
      if (hasProcessingBridgeJob(db)) {
        return undefined;
      }

      const queued = findNextQueuedBridgeJob(db);
      if (!queued) {
        return undefined;
      }

      const outputPath = queued.outputPath ?? join(this.resultsDir, `job-${queued.id}.csv`);
      return startBridgeJob(db, queued.id, this.timestamp(), outputPath);
    });
  }

  private notify(job: AutocompleteBridgeJob): void {
    this.events.emit(this.eventName(job.id), job);
  }

  private log(message: string): void {
    this.logger(message);
  }

  private eventName(id: number): string {
    return `job:${id}`;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private async withDb<T>(operation: (db: DatabaseSync) => T): Promise<T> {
    const { db } = await openDatabase(this.dbPath);

    try {
      applyMigrations(db);
      return operation(db);
    } finally {
      db.close();
    }
  }
}

function isTerminal(job: AutocompleteBridgeJob): boolean {
  return job.status === 'completed' || job.status === 'failed';
}
