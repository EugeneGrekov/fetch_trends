import type { IncomingMessage } from 'node:http';
import type { WebServices } from './services.js';

export interface WebRuntimeOptions {
  dbPath?: string;
  outDir: string;
  resultsPath: string;
  runJobsInProcess: boolean;
  appVersion: string;
  aiEnabled: boolean;
}

export interface WebContext {
  request: IncomingMessage;
  url: URL;
  params: Record<string, string>;
  bodyText: string;
  services: WebServices;
  options: WebRuntimeOptions;
}

export interface WebResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

export interface WebRoute {
  method: string;
  pattern: RegExp;
  handler: (context: WebContext) => Promise<WebResponse> | WebResponse;
}

export function htmlResponse(body: string, status = 200): WebResponse {
  return {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
    body,
  };
}

export function jsonResponse(body: unknown, status = 200): WebResponse {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body, null, 2),
  };
}

export function textResponse(body: string, contentType = 'text/plain; charset=utf-8', status = 200): WebResponse {
  return {
    status,
    headers: {
      'content-type': contentType,
    },
    body,
  };
}

export function redirectResponse(location: string): WebResponse {
  return {
    status: 303,
    headers: {
      location,
    },
    body: '',
  };
}
