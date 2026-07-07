import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWebServices, type ValidationRunner, type WebServiceOptions } from './services.js';
import { evidenceRoutes } from './routes/evidence.js';
import { ideaRoutes } from './routes/ideas.js';
import { jobRoutes } from './routes/jobs.js';
import { reportRoutes } from './routes/reports.js';
import { settingsRoutes } from './routes/settings.js';
import { escapeHtml } from './views/layout.js';
import { htmlResponse, jsonResponse, textResponse, type WebResponse, type WebRoute, type WebRuntimeOptions } from './types.js';
import type { ValidationDependencies, ValidationOptions } from '../validation/types.js';

const routes: WebRoute[] = [
  ...ideaRoutes,
  ...jobRoutes,
  ...evidenceRoutes,
  ...reportRoutes,
  ...settingsRoutes,
];

export interface WebServerOptions {
  dbPath?: string;
  host?: string;
  port?: number;
  outDir?: string;
  resultsPath?: string;
  aiEnabled?: boolean;
  runJobsInProcess?: boolean;
  validationDefaults?: Partial<ValidationOptions>;
  validationDependencies?: ValidationDependencies;
  validationRunner?: ValidationRunner;
  onBackgroundError?: (error: unknown) => void;
}

export interface StartedWebServer {
  server: Server;
  url: string;
}

export function createWebServer(options: WebServerOptions = {}): Server {
  const runtime = resolveRuntimeOptions(options);
  const services = createWebServices({
    aiEnabled: runtime.aiEnabled,
    dbPath: options.dbPath,
    onBackgroundError: options.onBackgroundError,
    outDir: runtime.outDir,
    resultsPath: runtime.resultsPath,
    runJobsInProcess: runtime.runJobsInProcess,
    validationDefaults: options.validationDefaults,
    validationDependencies: options.validationDependencies,
    validationRunner: options.validationRunner,
  } satisfies WebServiceOptions);

  return createServer(async (request, response) => {
    const webResponse = await handleRequest(request, runtime, services).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (request.url?.startsWith('/api/')) {
        return jsonResponse({ error: message }, 500);
      }

      return htmlResponse(`<h1>Server error</h1><p>${escapeHtml(message)}</p>`, 500);
    });

    sendResponse(response, webResponse);
  });
}

export async function startWebServer(options: WebServerOptions = {}): Promise<StartedWebServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3000;
  const server = createWebServer(options);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;

  return {
    server,
    url: `http://${host}:${resolvedPort}`,
  };
}

export async function stopWebServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  options: WebRuntimeOptions,
  services: ReturnType<typeof createWebServices>,
): Promise<WebResponse> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/assets/styles.css') {
    return serveStyles();
  }

  const route = matchRoute(request.method ?? 'GET', url.pathname);
  if (!route) {
    return textResponse('Not found', 'text/plain; charset=utf-8', 404);
  }

  return route.route.handler({
    bodyText: await readRequestBody(request),
    options,
    params: route.params,
    request,
    services,
    url,
  });
}

function matchRoute(method: string, pathname: string): { route: WebRoute; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }

    const match = route.pattern.exec(pathname);
    if (!match) {
      continue;
    }

    return {
      route,
      params: match.groups ?? {},
    };
  }

  return null;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method ?? '')) {
    return '';
  }

  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function serveStyles(): Promise<WebResponse> {
  const path = fileURLToPath(new URL('./assets/styles.css', import.meta.url));
  const css = await readFile(path);

  return {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/css; charset=utf-8',
    },
    body: css,
  };
}

function sendResponse(response: ServerResponse, webResponse: WebResponse): void {
  response.statusCode = webResponse.status ?? 200;

  for (const [name, value] of Object.entries(webResponse.headers ?? {})) {
    response.setHeader(name, value);
  }

  response.end(webResponse.body ?? '');
}

function resolveRuntimeOptions(options: WebServerOptions): WebRuntimeOptions {
  return {
    aiEnabled: options.aiEnabled ?? process.env.FETCH_TRENDS_WEB_AI === 'true',
    appVersion: process.env.npm_package_version ?? '0.0.0',
    dbPath: options.dbPath,
    outDir: options.outDir ?? './results/web',
    resultsPath: options.resultsPath ?? './results',
    runJobsInProcess: options.runJobsInProcess ?? true,
  };
}
