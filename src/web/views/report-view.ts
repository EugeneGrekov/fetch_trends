import type { ReportPayload } from '../services.js';
import { escapeHtml, formatDate, renderLayout } from './layout.js';

export function renderReportView(payload: ReportPayload): string {
  return renderLayout({
    active: 'reports',
    title: `Report ${payload.report.id}`,
    body: `<section class="page-header">
        <p class="eyebrow">Stored report</p>
        <h1>${escapeHtml(payload.idea.title)}</h1>
        <p class="lede">Created ${escapeHtml(formatDate(payload.report.created_at))}. Export reads this stored row and does not regenerate evidence.</p>
        <div class="actions">
          <a class="secondary-button" href="/ideas/${payload.idea.id}">Idea dashboard</a>
          <a class="secondary-button" href="/reports/${payload.report.id}?format=markdown">Export Markdown</a>
          <a class="secondary-button" href="/reports/${payload.report.id}?format=json">Export JSON</a>
        </div>
      </section>
      <section class="report-shell">
        <pre class="report-markdown">${escapeHtml(payload.report.markdown)}</pre>
      </section>`,
  });
}

export function renderReportJson(payload: ReportPayload): Record<string, unknown> {
  return {
    report: {
      id: payload.report.id,
      ideaId: payload.report.idea_id,
      jobId: payload.report.job_id,
      reportType: payload.report.report_type,
      createdAt: payload.report.created_at,
    },
    idea: payload.idea,
    markdown: payload.report.markdown,
    structured: payload.structured,
  };
}
