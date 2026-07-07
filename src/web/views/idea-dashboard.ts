import type { IdeaDashboardPayload } from '../services.js';
import type { ScoreRow } from '../../db/schema.js';
import { escapeHtml, formatDate, renderBadge, renderEmpty, renderLayout } from './layout.js';

export function renderIdeaDashboard(payload: IdeaDashboardPayload): string {
  const latestJob = payload.jobs[0];
  const latestReport = payload.reports[0];

  return renderLayout({
    active: 'ideas',
    title: payload.idea.title,
    body: `<section class="page-header">
        <p class="eyebrow">Idea dashboard</p>
        <h1>${escapeHtml(payload.idea.title)}</h1>
        <p class="lede">${escapeHtml(payload.idea.raw_description)}</p>
        <div class="actions">
          ${latestJob ? `<a class="secondary-button" href="/jobs/${latestJob.id}">View job ${latestJob.id}</a>` : ''}
          <a class="secondary-button" href="/ideas/${payload.idea.id}/evidence">Inspect evidence</a>
          ${latestReport ? `<a class="primary-button" href="/reports/${latestReport.id}">Read report</a>` : ''}
        </div>
      </section>
      <section class="metric-grid">
        ${metric('Queries', payload.queries.length)}
        ${metric('Autocomplete predictions', payload.predictions.length)}
        ${metric('Sources', payload.evidence.counts.sources)}
        ${metric('Evidence quotes', payload.evidence.counts.evidence)}
        ${metric('Competitors', payload.evidence.counts.competitors)}
      </section>
      <section class="section two-column">
        <div class="card">
          <h2>Scorecard</h2>
          ${renderScores(payload.scores)}
        </div>
        <div class="card">
          <h2>Latest Status</h2>
          ${latestJob ? `<dl class="definition-list">
            <dt>Idea status</dt><dd>${renderBadge(payload.idea.status)}</dd>
            <dt>Job status</dt><dd>${renderBadge(latestJob.status)}</dd>
            <dt>Completed</dt><dd>${escapeHtml(formatDate(latestJob.completed_at))}</dd>
          </dl>` : renderEmpty('No validation jobs exist for this idea yet.')}
        </div>
      </section>
      <section class="section two-column">
        <div>
          <div class="section-heading">
            <h2>Top Queries</h2>
            <span>${payload.queries.length} stored</span>
          </div>
          ${renderQueries(payload)}
        </div>
        <div>
          <div class="section-heading">
            <h2>Top Predictions</h2>
            <span>${payload.predictions.length} stored</span>
          </div>
          ${renderPredictions(payload)}
        </div>
      </section>
      ${payload.evidence.warnings.length === 0 ? '' : `<section class="section">
        <h2>Missing Evidence Warnings</h2>
        <div class="warning-list">${payload.evidence.warnings.map((warning) => `<div class="notice">${escapeHtml(warning)}</div>`).join('')}</div>
      </section>`}`,
  });
}

function renderScores(scores: ScoreRow[]): string {
  if (scores.length === 0) {
    return renderEmpty('No scores have been stored yet.');
  }

  return `<div class="score-list">
    ${scores.map((score) => {
      const parsed = parseScore(score.score_json);
      return `<article class="score-row">
        <div>
          <strong>${escapeHtml(score.score_type)}</strong>
          <span>${escapeHtml(score.decision)}</span>
        </div>
        <div class="score-number">${score.total_score}</div>
        ${parsed ? `<pre>${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>` : ''}
      </article>`;
    }).join('')}
  </div>`;
}

function renderQueries(payload: IdeaDashboardPayload): string {
  const rows = payload.queries.slice(0, 12);
  if (rows.length === 0) {
    return renderEmpty('No generated queries have been stored yet.');
  }

  return `<div class="table-wrap">
    <table>
      <thead><tr><th>Query</th><th>Intent</th><th>Priority</th></tr></thead>
      <tbody>
        ${rows.map((query) => `<tr>
          <td>${escapeHtml(query.query)}</td>
          <td>${escapeHtml(query.intent_type ?? '')}</td>
          <td>${escapeHtml(query.priority_score ?? '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderPredictions(payload: IdeaDashboardPayload): string {
  const rows = payload.predictions.slice(0, 12);
  if (rows.length === 0) {
    return renderEmpty('No autocomplete predictions have been stored yet.');
  }

  return `<div class="table-wrap">
    <table>
      <thead><tr><th>Prediction</th><th>Intent</th><th>Confidence</th></tr></thead>
      <tbody>
        ${rows.map((prediction) => `<tr>
          <td>${escapeHtml(prediction.prediction)}</td>
          <td>${escapeHtml(prediction.intent)}</td>
          <td>${prediction.confidence_score}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function metric(label: string, value: number): string {
  return `<div class="metric card">
    <span>${escapeHtml(label)}</span>
    <strong>${value}</strong>
  </div>`;
}

function parseScore(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
