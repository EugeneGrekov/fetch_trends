import { renderReportJson, renderReportView } from '../views/report-view.js';
import { htmlResponse, jsonResponse, textResponse, type WebContext, type WebResponse, type WebRoute } from '../types.js';

export const reportRoutes: WebRoute[] = [
  { method: 'GET', pattern: /^\/reports\/(?<id>\d+)$/, handler: getReportPageOrExport },
  { method: 'GET', pattern: /^\/api\/reports\/(?<id>\d+)$/, handler: getReportApi },
];

async function getReportPageOrExport(context: WebContext): Promise<WebResponse> {
  const payload = await context.services.getReport(parseId(context.params.id));
  const format = context.url.searchParams.get('format');

  if (format === 'markdown') {
    return textResponse(payload.report.markdown, 'text/markdown; charset=utf-8');
  }

  if (format === 'json') {
    return jsonResponse(renderReportJson(payload));
  }

  return htmlResponse(renderReportView(payload));
}

async function getReportApi(context: WebContext): Promise<WebResponse> {
  return jsonResponse(renderReportJson(await context.services.getReport(parseId(context.params.id))));
}

function parseId(value: string | undefined): number {
  return Number(value);
}
