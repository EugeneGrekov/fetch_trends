import type { HealthPayload, SettingsPayload } from '../services.js';
import { escapeHtml, renderBadge, renderLayout } from './layout.js';

export function renderSettings(settings: SettingsPayload, health: HealthPayload): string {
  return renderLayout({
    active: 'settings',
    title: 'Settings',
    body: `<section class="page-header">
        <p class="eyebrow">Local setup</p>
        <h1>Settings and health</h1>
        <p class="lede">Configuration values are shown as paths or configured/missing statuses. Secrets are never printed.</p>
      </section>
      <section class="section two-column">
        <div class="card">
          <h2>Storage</h2>
          <dl class="definition-list">
            <dt>SQLite database</dt><dd><code>${escapeHtml(settings.dbPath)}</code></dd>
            <dt>Results path</dt><dd><code>${escapeHtml(settings.resultsPath)}</code></dd>
            <dt>AI artifacts path</dt><dd><code>${escapeHtml(settings.artifactsPath)}</code></dd>
            <dt>App version</dt><dd>${escapeHtml(settings.appVersion)}</dd>
          </dl>
        </div>
        <div class="card">
          <h2>Health</h2>
          <dl class="definition-list">
            <dt>Database</dt><dd>${renderBadge(health.migrationStatus)}</dd>
            <dt>Pending jobs</dt><dd>${health.pendingJobs}</dd>
            <dt>Running jobs</dt><dd>${health.runningJobs}</dd>
            <dt>Codex AI</dt><dd>${renderBadge(settings.ai.codex)}</dd>
          </dl>
        </div>
      </section>
      <section class="section">
        <h2>Collectors</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Collector</th><th>Status</th></tr></thead>
            <tbody>
              ${settings.collectors.map((collector) => `<tr>
                <td>${escapeHtml(collector.name)}</td>
                <td>${renderBadge(collector.status)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`,
  });
}
