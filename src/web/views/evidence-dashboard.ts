import type { EvidencePayload } from '../services.js';
import { escapeHtml, formatDate, renderEmpty, renderLayout } from './layout.js';

export function renderEvidenceDashboard(payload: EvidencePayload): string {
  return renderLayout({
    active: 'ideas',
    title: `Evidence for ${payload.idea.title}`,
    body: `<section class="page-header">
        <p class="eyebrow">Evidence dashboard</p>
        <h1>${escapeHtml(payload.idea.title)}</h1>
        <div class="actions">
          <a class="secondary-button" href="/ideas/${payload.idea.id}">Idea dashboard</a>
          <a class="secondary-button" href="/api/ideas/${payload.idea.id}/evidence">Evidence JSON</a>
        </div>
      </section>
      <section class="metric-grid">
        ${metric('Sources', payload.counts.sources)}
        ${metric('Quotes', payload.counts.evidence)}
        ${metric('Competitors', payload.counts.competitors)}
        ${metric('Predictions', payload.counts.predictions)}
      </section>
      ${payload.warnings.length === 0 ? '' : `<section class="section">
        <h2>Missing Evidence Warnings</h2>
        <div class="warning-list">${payload.warnings.map((warning) => `<div class="notice">${escapeHtml(warning)}</div>`).join('')}</div>
      </section>`}
      <section class="section">
        <div class="section-heading">
          <h2>Evidence Quotes</h2>
          <span>${payload.evidence.length} rows</span>
        </div>
        ${renderEvidenceRows(payload)}
      </section>
      <section class="section two-column">
        <div>
          <div class="section-heading">
            <h2>Sources</h2>
            <span>${payload.sources.length} rows</span>
          </div>
          ${renderSources(payload)}
        </div>
        <div>
          <div class="section-heading">
            <h2>Competitors</h2>
            <span>${payload.competitors.length} rows</span>
          </div>
          ${renderCompetitors(payload)}
        </div>
      </section>`,
  });
}

function renderEvidenceRows(payload: EvidencePayload): string {
  if (payload.evidenceWithSources.length === 0) {
    return renderEmpty('No extracted evidence quotes are stored yet.');
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Quote</th>
          <th>Signal</th>
          <th>Confidence</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${payload.evidenceWithSources.map(({ evidence, source }) => `<tr>
          <td>${escapeHtml(evidence.quote)}</td>
          <td>${escapeHtml([evidence.pain_type, evidence.urgency, evidence.payment_signal].filter(Boolean).join(' / '))}</td>
          <td>${escapeHtml(evidence.confidence_score ?? '')}</td>
          <td>${source ? `<a href="${escapeHtml(source.url)}">${escapeHtml(source.title ?? source.url)}</a>` : 'Unknown source'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderSources(payload: EvidencePayload): string {
  if (payload.sources.length === 0) {
    return renderEmpty('No external source records are stored yet.');
  }

  return `<div class="stack">
    ${payload.sources.map((source) => `<article class="card compact-card">
      <strong><a href="${escapeHtml(source.url)}">${escapeHtml(source.title ?? source.url)}</a></strong>
      <span>${escapeHtml(source.source_type)} fetched ${escapeHtml(formatDate(source.fetched_at))}</span>
      ${source.snippet ? `<p>${escapeHtml(source.snippet)}</p>` : ''}
    </article>`).join('')}
  </div>`;
}

function renderCompetitors(payload: EvidencePayload): string {
  if (payload.competitors.length === 0) {
    return renderEmpty('No competitor records are stored yet.');
  }

  return `<div class="table-wrap">
    <table>
      <thead><tr><th>Name</th><th>Price</th><th>Model</th><th>Notes</th></tr></thead>
      <tbody>
        ${payload.competitors.map((competitor) => `<tr>
          <td><a href="${escapeHtml(competitor.url)}">${escapeHtml(competitor.name)}</a></td>
          <td>${escapeHtml(competitor.price_text ?? '')}</td>
          <td>${escapeHtml(competitor.pricing_model ?? competitor.product_type ?? '')}</td>
          <td>${escapeHtml(competitor.review_summary ?? '')}</td>
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
