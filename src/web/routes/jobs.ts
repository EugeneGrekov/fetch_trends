import { renderJobStatus } from '../views/job-status.js';
import { formatDate, renderBadge } from '../views/layout.js';
import { htmlResponse, jsonResponse, type WebContext, type WebResponse, type WebRoute } from '../types.js';

export const jobRoutes: WebRoute[] = [
  { method: 'GET', pattern: /^\/jobs\/(?<id>\d+)$/, handler: getJobPage },
  { method: 'GET', pattern: /^\/api\/jobs\/(?<id>\d+)$/, handler: getJobApi },
  { method: 'GET', pattern: /^\/api\/jobs\/(?<id>\d+)\/status$/, handler: getJobStatusApi },
];

async function getJobPage(context: WebContext): Promise<WebResponse> {
  return htmlResponse(renderJobStatus(await context.services.getJobDetails(parseId(context.params.id))));
}

async function getJobApi(context: WebContext): Promise<WebResponse> {
  return jsonResponse(await context.services.getJobDetails(parseId(context.params.id)));
}

async function getJobStatusApi(context: WebContext): Promise<WebResponse> {
  const details = await context.services.getJobDetails(parseId(context.params.id));
  const latestReport = details.reports[0];

  return jsonResponse({
    id: details.job.id,
    ideaId: details.job.idea_id,
    status: details.job.status,
    statusBadge: renderBadge(details.job.status),
    startedAt: details.job.started_at,
    startedAtLabel: formatDate(details.job.started_at),
    completedAt: details.job.completed_at,
    completedAtLabel: formatDate(details.job.completed_at),
    errorMessage: details.job.error_message,
    reportId: latestReport?.id ?? null,
  });
}

function parseId(value: string | undefined): number {
  return Number(value);
}
