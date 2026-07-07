import { renderFormError, renderIdeaForm } from '../views/idea-form.js';
import { renderHome } from '../views/home.js';
import { renderIdeaDashboard } from '../views/idea-dashboard.js';
import { renderLayout } from '../views/layout.js';
import { htmlResponse, jsonResponse, redirectResponse, type WebContext, type WebResponse, type WebRoute } from '../types.js';

export const ideaRoutes: WebRoute[] = [
  { method: 'GET', pattern: /^\/$/, handler: getHome },
  { method: 'GET', pattern: /^\/ideas\/new$/, handler: getNewIdea },
  { method: 'POST', pattern: /^\/api\/ideas$/, handler: postIdea },
  { method: 'GET', pattern: /^\/api\/ideas\/(?<id>\d+)$/, handler: getIdeaApi },
  { method: 'GET', pattern: /^\/ideas\/(?<id>\d+)$/, handler: getIdeaPage },
];

async function getHome(context: WebContext): Promise<WebResponse> {
  return htmlResponse(renderHome(await context.services.listRecentIdeas()));
}

function getNewIdea(): WebResponse {
  return htmlResponse(renderLayout({
    active: 'ideas',
    title: 'New Idea',
    body: `<section class="page-header">
        <p class="eyebrow">Submit idea</p>
        <h1>Create a validation job</h1>
        <p class="lede">The web UI creates an idea row and a pending validation job in SQLite. The worker runs the existing validation pipeline.</p>
      </section>
      ${renderIdeaForm()}`,
  }));
}

async function postIdea(context: WebContext): Promise<WebResponse> {
  const submission = parseIdeaSubmission(context);

  if (!submission.idea) {
    if (wantsHtml(context)) {
      return htmlResponse(renderLayout({
        active: 'ideas',
        title: 'New Idea',
        body: `${renderFormError('Enter an idea before creating a validation job.')}${renderIdeaForm()}`,
      }), 400);
    }

    return jsonResponse({ error: 'Enter an idea before creating a validation job.' }, 400);
  }

  const created = await context.services.createIdeaSubmission(submission);

  if (wantsHtml(context)) {
    return redirectResponse(`/jobs/${created.job.id}`);
  }

  return jsonResponse(created, 201);
}

async function getIdeaApi(context: WebContext): Promise<WebResponse> {
  return jsonResponse(await context.services.getIdeaDashboard(parseId(context.params.id)));
}

async function getIdeaPage(context: WebContext): Promise<WebResponse> {
  return htmlResponse(renderIdeaDashboard(await context.services.getIdeaDashboard(parseId(context.params.id))));
}

function parseIdeaSubmission(context: WebContext): {
  idea: string;
  targetMarket?: string | null;
  expectedPrice?: string | null;
  platform?: string | null;
} {
  const contentType = context.request.headers['content-type'] ?? '';

  if (contentType.includes('application/json')) {
    const parsed = context.bodyText ? JSON.parse(context.bodyText) as Record<string, unknown> : {};
    return {
      idea: normalizeField(parsed.idea),
      targetMarket: normalizeField(parsed.targetMarket),
      expectedPrice: normalizeField(parsed.expectedPrice),
      platform: normalizeField(parsed.platform),
    };
  }

  const params = new URLSearchParams(context.bodyText);
  return {
    idea: normalizeField(params.get('idea')),
    targetMarket: normalizeField(params.get('targetMarket')),
    expectedPrice: normalizeField(params.get('expectedPrice')),
    platform: normalizeField(params.get('platform')),
  };
}

function wantsHtml(context: WebContext): boolean {
  return String(context.request.headers.accept ?? '').includes('text/html');
}

function normalizeField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseId(value: string | undefined): number {
  return Number(value);
}
