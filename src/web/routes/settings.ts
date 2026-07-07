import { renderSettings } from '../views/settings.js';
import { htmlResponse, jsonResponse, type WebContext, type WebResponse, type WebRoute } from '../types.js';

export const settingsRoutes: WebRoute[] = [
  { method: 'GET', pattern: /^\/settings$/, handler: getSettingsPage },
  { method: 'GET', pattern: /^\/api\/health$/, handler: getHealthApi },
];

async function getSettingsPage(context: WebContext): Promise<WebResponse> {
  return htmlResponse(renderSettings(
    context.services.getSettings(context.options.appVersion),
    await context.services.getHealth(),
  ));
}

async function getHealthApi(context: WebContext): Promise<WebResponse> {
  return jsonResponse(await context.services.getHealth());
}
