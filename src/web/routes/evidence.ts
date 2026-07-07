import { renderEvidenceDashboard } from '../views/evidence-dashboard.js';
import { htmlResponse, jsonResponse, type WebContext, type WebResponse, type WebRoute } from '../types.js';

export const evidenceRoutes: WebRoute[] = [
  { method: 'GET', pattern: /^\/ideas\/(?<id>\d+)\/evidence$/, handler: getEvidencePage },
  { method: 'GET', pattern: /^\/api\/ideas\/(?<id>\d+)\/evidence$/, handler: getEvidenceApi },
];

async function getEvidencePage(context: WebContext): Promise<WebResponse> {
  return htmlResponse(renderEvidenceDashboard(await context.services.getEvidence(parseId(context.params.id))));
}

async function getEvidenceApi(context: WebContext): Promise<WebResponse> {
  return jsonResponse(await context.services.getEvidence(parseId(context.params.id)));
}

function parseId(value: string | undefined): number {
  return Number(value);
}
