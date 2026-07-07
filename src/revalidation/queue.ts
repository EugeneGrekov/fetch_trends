import type { DatabaseSync } from 'node:sqlite';
import {
  createRevalidationQueueItem,
  findOpenRevalidationQueueItem,
} from '../db/repositories/revalidation.js';
import type { RevalidationQueueRow } from '../db/schema.js';
import type {
  RevalidationTaskType,
  StalenessReason,
  StalenessResult,
} from './types.js';

export interface QueueStaleTasksResult {
  queued: RevalidationQueueRow[];
  skippedExisting: Array<{
    ideaId: number;
    taskType: RevalidationTaskType;
    reason: string;
  }>;
}

export function queueStaleRevalidationTasks(
  db: DatabaseSync,
  result: StalenessResult,
  now: string,
): QueueStaleTasksResult {
  const queued: RevalidationQueueRow[] = [];
  const skippedExisting: QueueStaleTasksResult['skippedExisting'] = [];

  for (const [taskType, reasons] of reasonsByTask(result.reasons)) {
    const existing = findOpenRevalidationQueueItem(db, result.ideaId, taskType);
    const reason = summarizeTaskReasons(reasons);
    if (existing) {
      skippedExisting.push({
        ideaId: result.ideaId,
        taskType,
        reason,
      });
      continue;
    }

    queued.push(
      createRevalidationQueueItem(db, {
        ideaId: result.ideaId,
        taskType,
        reason,
        staleReasonJson: JSON.stringify(reasons, null, 2),
        createdAt: now,
      }),
    );
  }

  return {
    queued,
    skippedExisting,
  };
}

function reasonsByTask(reasons: StalenessReason[]): Map<RevalidationTaskType, StalenessReason[]> {
  const grouped = new Map<RevalidationTaskType, StalenessReason[]>();

  for (const reason of reasons) {
    const existing = grouped.get(reason.recommendedTask) ?? [];
    existing.push(reason);
    grouped.set(reason.recommendedTask, existing);
  }

  return grouped;
}

function summarizeTaskReasons(reasons: StalenessReason[]): string {
  if (reasons.length === 1) {
    return reasons[0]?.reason ?? 'Evidence needs revalidation.';
  }

  return reasons.map((reason) => reason.reason).join(' ');
}
