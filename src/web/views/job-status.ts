import type { JobDetailsPayload } from '../services.js';
import { escapeHtml, formatDate, renderBadge, renderEmpty, renderLayout } from './layout.js';

export function renderJobStatus(payload: JobDetailsPayload): string {
  const latestReport = payload.reports[0];
  const reportLink = latestReport
    ? `<a class="secondary-button" id="report-link" href="/reports/${latestReport.id}">Open report</a>`
    : `<a class="secondary-button hidden" id="report-link" href="#">Open report</a>`;
  const toolRuns = payload.toolRuns.length === 0
    ? renderEmpty('No tool runs have been recorded yet. If the job is pending, start the web server with in-process jobs or run npm run worker.')
    : `<div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Status</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            ${payload.toolRuns.map((toolRun) => `<tr>
              <td>${escapeHtml(toolRun.tool_name)}</td>
              <td>${renderBadge(toolRun.status)}</td>
              <td>${escapeHtml(formatDate(toolRun.started_at))}</td>
              <td>${escapeHtml(formatDate(toolRun.completed_at))}</td>
              <td>${escapeHtml(toolRun.error_message ?? '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

  return renderLayout({
    active: 'ideas',
    title: `Job ${payload.job.id}`,
    body: `<section class="page-header">
        <p class="eyebrow">Validation job</p>
        <h1>${escapeHtml(payload.idea.title)}</h1>
        <div class="actions">
          <a class="secondary-button" href="/ideas/${payload.idea.id}">Idea dashboard</a>
          ${reportLink}
        </div>
      </section>
      <section class="status-card card">
        <div>
          <span class="label">Current status</span>
          <div id="job-status">${renderBadge(payload.job.status)}</div>
        </div>
        <div>
          <span class="label">Started</span>
          <strong id="job-started">${escapeHtml(formatDate(payload.job.started_at))}</strong>
        </div>
        <div>
          <span class="label">Completed</span>
          <strong id="job-completed">${escapeHtml(formatDate(payload.job.completed_at))}</strong>
        </div>
      </section>
      <section class="section">
        <h2>Tool Runs</h2>
        <div id="job-error">${payload.job.error_message ? `<div class="notice notice-error">${escapeHtml(payload.job.error_message)}</div>` : ''}</div>
        ${toolRuns}
      </section>
      <script>
        const statusEl = document.getElementById('job-status');
        const completedEl = document.getElementById('job-completed');
        const errorEl = document.getElementById('job-error');
        const reportLink = document.getElementById('report-link');
        async function pollJob() {
          const response = await fetch('/api/jobs/${payload.job.id}/status');
          if (!response.ok) return;
          const data = await response.json();
          statusEl.innerHTML = data.statusBadge;
          completedEl.textContent = data.completedAtLabel;
          errorEl.textContent = data.errorMessage || '';
          errorEl.className = data.errorMessage ? 'notice notice-error' : '';
          if (data.reportId) {
            reportLink.href = '/reports/' + data.reportId;
            reportLink.classList.remove('hidden');
          }
          if (!['completed', 'failed', 'partial', 'stopped'].includes(data.status)) {
            window.setTimeout(pollJob, 1500);
          }
        }
        if (!['completed', 'failed', 'partial', 'stopped'].includes(${JSON.stringify(payload.job.status)})) {
          window.setTimeout(pollJob, 1500);
        }
      </script>`,
  });
}
