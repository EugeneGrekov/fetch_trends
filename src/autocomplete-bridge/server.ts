import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  authenticateToken,
  InvalidCredentialsError,
  loginWithPassword,
  resolveAuthConfigPath,
} from './auth.js';
import { InvalidAutocompleteRequestError } from './protocol.js';
import {
  AutocompleteBridgeService,
  BridgeJobConflictError,
  BridgeJobNotFoundError,
  type AutocompleteBridgeServiceOptions,
} from './service.js';
import type { AutocompleteBridgeJob } from './types.js';

const MAX_BODY_BYTES = 1_000_000;

export interface AutocompleteBridgeServerOptions extends AutocompleteBridgeServiceOptions {
  authConfigPath?: string;
  host?: string;
  port?: number;
}
export interface StartedAutocompleteBridgeServer {
  server: Server;
  service: AutocompleteBridgeService;
  url: string;
}

export async function startAutocompleteBridgeServer(
  options: AutocompleteBridgeServerOptions = {},
): Promise<StartedAutocompleteBridgeServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3099;
  const authConfigPath = resolveAuthConfigPath(options.authConfigPath);
  const service = new AutocompleteBridgeService(options);
  await service.initialize();

  const server = createServer((request, response) => {
    void handleRequest(request, response, service, authConfigPath).catch((error) => {
      sendError(response, error);
    });
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, host, () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;

  return {
    server,
    service,
    url: `http://${host}:${resolvedPort}`,
  };
}

export async function stopAutocompleteBridgeServer(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise();
    });
    server.closeIdleConnections();
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: AutocompleteBridgeService,
  authConfigPath: string,
): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

  if (method === 'OPTIONS') {
    sendEmpty(response, 204);
    return;
  }

  if (method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJsonBody(request);
    if (!isRecord(body) || typeof body.username !== 'string' || typeof body.password !== 'string') {
      throw new HttpError(400, 'username and password are required.');
    }

    const login = await loginWithPassword(authConfigPath, body.username, body.password);
    sendJson(response, 200, login);
    return;
  }

  const identity = await requireIdentity(request, authConfigPath);

  if (method === 'GET' && url.pathname === '/api/auth/check') {
    sendJson(response, 200, { ok: true, username: identity.username });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/jobs') {
    const submitted = await service.submit(await readJsonBody(request), identity.username);
    sendJson(response, submitted.cached ? 200 : 201, {
      cached: submitted.cached,
      job: publicJob(submitted.job),
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/jobs') {
    const limit = parseLimit(url.searchParams.get('limit'));
    sendJson(response, 200, {
      jobs: (await service.listJobs(limit)).map(publicJob),
    });
    return;
  }

  const jobMatch = /^\/api\/jobs\/(?<id>\d+)(?<wait>\/wait)?$/.exec(url.pathname);
  if (method === 'GET' && jobMatch?.groups) {
    const id = parseJobId(jobMatch.groups.id);
    const job = jobMatch.groups.wait
      ? await service.waitForJob(id, parseLongPollTimeout(url.searchParams.get('timeout')))
      : await service.getJob(id);
    sendJson(response, 200, { job: publicJob(job) });
    return;
  }

  const retryMatch = /^\/api\/jobs\/(?<id>\d+)\/retry$/.exec(url.pathname);
  if (method === 'POST' && retryMatch?.groups) {
    const job = await service.retry(parseJobId(retryMatch.groups.id));
    sendJson(response, 200, { job: publicJob(job) });
    return;
  }

  throw new HttpError(404, 'Not found.');
}

async function requireIdentity(
  request: IncomingMessage,
  authConfigPath: string,
): Promise<{ username: string }> {
  const authorization = request.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const identity = match ? await authenticateToken(authConfigPath, match[1] ?? '') : undefined;

  if (!identity) {
    throw new HttpError(401, 'A valid bearer token is required.');
  }

  return identity;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunkValue of request) {
    const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue);
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Request body is too large.');
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function publicJob(job: AutocompleteBridgeJob): Record<string, unknown> {
  return {
    id: job.id,
    status: job.status,
    seeds: job.seeds,
    modifiers: job.modifiers,
    outputPath: job.outputPath,
    resultMarkdown: job.status === 'completed' ? job.resultMarkdown : null,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

function sendError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }

  if (error instanceof HttpError) {
    sendJson(response, error.status, { error: error.message });
    return;
  }

  if (error instanceof InvalidCredentialsError) {
    sendJson(response, 401, { error: error.message });
    return;
  }

  if (error instanceof InvalidAutocompleteRequestError) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  if (error instanceof BridgeJobNotFoundError) {
    sendJson(response, 404, { error: error.message });
    return;
  }

  if (error instanceof BridgeJobConflictError) {
    sendJson(response, 409, { error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  sendJson(response, 500, { error: message });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    ...commonHeaders(),
    'content-length': Buffer.byteLength(encoded),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(encoded);
}

function sendEmpty(response: ServerResponse, status: number): void {
  response.writeHead(status, commonHeaders());
  response.end();
}

function commonHeaders(): Record<string, string> {
  return {
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-origin': '*',
    'access-control-allow-private-network': 'true',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
}

function parseLongPollTimeout(value: string | null): number {
  if (value === null) {
    return 30_000;
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30) {
    throw new HttpError(400, 'timeout must be between 0 and 30 seconds.');
  }

  return Math.round(seconds * 1_000);
}

function parseLimit(value: string | null): number {
  if (value === null) {
    return 50;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HttpError(400, 'limit must be an integer between 1 and 100.');
  }

  return limit;
}

function parseJobId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new HttpError(400, 'Invalid job ID.');
  }

  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
