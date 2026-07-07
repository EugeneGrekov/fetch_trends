export function renderLayout(args: {
  title: string;
  body: string;
  active?: 'home' | 'ideas' | 'reports' | 'settings';
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(args.title)} - Fetch Trends</title>
    <link rel="stylesheet" href="/assets/styles.css">
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/">Fetch Trends</a>
      <nav class="nav" aria-label="Main navigation">
        ${navLink('/', 'Home', args.active === 'home')}
        ${navLink('/ideas/new', 'New Idea', args.active === 'ideas')}
        ${navLink('/settings', 'Settings', args.active === 'settings')}
      </nav>
    </header>
    <main class="shell">
      ${args.body}
    </main>
  </body>
</html>`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderBadge(value: string): string {
  const normalized = value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
  return `<span class="badge badge-${escapeHtml(normalized)}">${escapeHtml(value)}</span>`;
}

export function formatDate(value: string | null): string {
  if (!value) {
    return 'Not yet';
  }

  return new Date(value).toLocaleString();
}

export function renderEmpty(message: string): string {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function navLink(href: string, label: string, active: boolean): string {
  const className = active ? 'nav-link active' : 'nav-link';
  return `<a class="${className}" href="${href}">${escapeHtml(label)}</a>`;
}
