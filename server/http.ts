import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Framework-agnostic request / response shapes shared by the Vite dev middlewares and the
 * serverless functions under `api/`. Handlers are pure: they take an `ApiRequest` and return an
 * `ApiResponse`; the adapters below translate to and from Node's `http` objects.
 */
export interface ApiRequest {
  method: string;
  url: URL;
  /** Lower-cased header names. */
  headers: Record<string, string>;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body?: string | Uint8Array;
}

export type ApiHandler = (req: ApiRequest) => Promise<ApiResponse>;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  };
}

export function empty(status: number, headers: Record<string, string> = {}): ApiResponse {
  return { status, headers };
}

/** Builds an `ApiRequest` from a Node request. `pathname` overrides the path when the host already stripped or rewrote it. */
export function fromNodeRequest(req: IncomingMessage, pathname?: string): ApiRequest {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (pathname !== undefined) url.pathname = pathname;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[name.toLowerCase()] = value;
    else if (Array.isArray(value)) headers[name.toLowerCase()] = value.join(', ');
  }
  return { method: req.method ?? 'GET', url, headers };
}

export function sendNodeResponse(res: ServerResponse, response: ApiResponse): void {
  res.statusCode = response.status;
  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
  if (response.body === undefined) {
    res.end();
    return;
  }
  const body = typeof response.body === 'string' ? Buffer.from(response.body, 'utf8') : Buffer.from(response.body);
  res.setHeader('Content-Length', String(body.length));
  res.end(body);
}

/**
 * Runs a handler for a Node request and writes the answer, turning thrown errors into a JSON 502.
 * Works both as a connect middleware (Vite) and as a Vercel Node function body.
 */
export async function serveNode(handler: ApiHandler, req: IncomingMessage, res: ServerResponse, pathname?: string): Promise<void> {
  let response: ApiResponse;
  try {
    response = await handler(fromNodeRequest(req, pathname));
  } catch (err) {
    response = json(502, { error: errorMessage(err) }, { 'Cache-Control': 'no-store' });
  }
  sendNodeResponse(res, response);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
