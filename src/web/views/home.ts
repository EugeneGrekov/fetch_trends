import type { IdeaRow } from '../../db/schema.js';
import { renderIdeaForm } from './idea-form.js';
import { escapeHtml, formatDate, renderBadge, renderEmpty, renderLayout } from './layout.js';

export function renderHome(ideas: IdeaRow[]): string {
  const recentIdeas = ideas.length === 0
    ? renderEmpty('No ideas have been submitted yet. Start with one concrete micro-business concept.')
    : `<div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Idea</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${ideas.map(renderIdeaRow).join('')}
          </tbody>
        </table>
      </div>`;

  return renderLayout({
    active: 'home',
    title: 'Local Validation Dashboard',
    body: `<section class="hero">
        <div>
          <p class="eyebrow">Evidence-first local research</p>
          <h1>Validate search language before building.</h1>
          <p class="lede">Submit a micro-business idea, run the SQLite-backed validation pipeline, then inspect queries, autocomplete evidence, scores, and stored reports from one local dashboard.</p>
        </div>
        <div class="hero-panel">
          <strong>Local only</strong>
          <span>SQLite remains the source of truth. Reports render stored evidence and do not regenerate unless a worker runs a new job.</span>
        </div>
      </section>
      ${renderIdeaForm()}
      <section class="section">
        <div class="section-heading">
          <h2>Recent Ideas</h2>
          <a href="/settings">Check local setup</a>
        </div>
        ${recentIdeas}
      </section>`,
  });
}

function renderIdeaRow(idea: IdeaRow): string {
  return `<tr>
    <td><a href="/ideas/${idea.id}">${escapeHtml(idea.title)}</a></td>
    <td>${renderBadge(idea.status)}</td>
    <td>${escapeHtml(formatDate(idea.updated_at))}</td>
  </tr>`;
}
