import { NextRequest, NextResponse } from 'next/server';
import type { ApiRequest, ApiResponse } from '@/src/types';
import { createClient } from '@/lib/supabase/server';
import { assertSafeOutboundUrl, assertSameOrigin, consumeRateLimit, HttpError, readJson, requestIdentity } from '@/lib/security/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const BODY_MODES = new Set(['none', 'json', 'raw', 'form']);
const AUTH_TYPES = new Set(['none', 'bearer', 'basic']);
const BLOCKED_HEADERS = new Set([
  'connection', 'content-length', 'host', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
  'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
]);

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const shortString = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;

const validateRows = (value: unknown, maxRows: number) => Array.isArray(value) && value.length <= maxRows && value.every((row) =>
  object(row) && shortString(row.id, 100) && shortString(row.key, 2_000) && shortString(row.value, 20_000) && typeof row.enabled === 'boolean');

const parseRequest = (value: unknown): ApiRequest => {
  if (!object(value) || !shortString(value.url, 8_192) || !shortString(value.method, 12)
    || !METHODS.has(String(value.method)) || !shortString(value.bodyMode, 16) || !BODY_MODES.has(String(value.bodyMode))
    || !shortString(value.bodyRaw, 750_000) || !validateRows(value.params, 200)
    || !validateRows(value.headers, 200) || !validateRows(value.bodyForm, 200)
    || (value.environment !== undefined && !validateRows(value.environment, 500)) || !object(value.auth)
    || !shortString(value.auth.type, 16) || !AUTH_TYPES.has(String(value.auth.type))
    || (value.auth.bearerToken !== undefined && !shortString(value.auth.bearerToken, 20_000))
    || (value.auth.basicUsername !== undefined && !shortString(value.auth.basicUsername, 2_000))
    || (value.auth.basicPassword !== undefined && !shortString(value.auth.basicPassword, 20_000))) {
    throw new HttpError(400, 'The request contains invalid or oversized fields.');
  }
  return value as unknown as ApiRequest;
};

const readLimitedText = async (response: Response) => {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_RESPONSE_BYTES) throw new HttpError(413, 'Response exceeded the 5 MB limit.');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new HttpError(413, 'Response exceeded the 5 MB limit.');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(output);
};

const fetchSafely = async (initialUrl: string, init: RequestInit) => {
  let url = await assertSafeOutboundUrl(initialUrl);
  let method = String(init.method ?? 'GET');
  let body = init.body;
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetch(url, { ...init, method, body, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirects >= MAX_REDIRECTS) throw new HttpError(502, 'The request exceeded the redirect limit.');
    const location = response.headers.get('location');
    if (!location) return response;
    url = await assertSafeOutboundUrl(new URL(location, url).toString());
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
      method = 'GET'; body = undefined;
    }
  }
};

const buildUrl = (request: ApiRequest) => {
  let url = request.url.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const params = request.params.filter((item) => item.enabled && item.key);
  if (!params.length) return url;
  const query = new URLSearchParams(params.map((item) => [item.key, item.value])).toString();
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
};

const resolveEnvironment = (request: ApiRequest): ApiRequest => {
  const variables = new Map((request.environment ?? []).filter((item) => item.enabled && item.key).map((item) => [item.key, item.value]));
  const resolve = (value = '') => value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key: string) => variables.get(key) ?? match);
  return {
    ...request,
    url: resolve(request.url),
    params: request.params.map((item) => ({ ...item, key: resolve(item.key), value: resolve(item.value) })),
    headers: request.headers.map((item) => ({ ...item, key: resolve(item.key), value: resolve(item.value) })),
    bodyRaw: resolve(request.bodyRaw),
    bodyForm: request.bodyForm.map((item) => ({ ...item, key: resolve(item.key), value: resolve(item.value) })),
    auth: {
      ...request.auth,
      bearerToken: resolve(request.auth.bearerToken),
      basicUsername: resolve(request.auth.basicUsername),
      basicPassword: resolve(request.auth.basicPassword),
    },
  };
};

export async function POST(incoming: NextRequest) {
  try {
    assertSameOrigin(incoming);
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  consumeRateLimit(requestIdentity(incoming, user.id, 'proxy'), 60);
  const request = parseRequest(resolveEnvironment(parseRequest(await readJson(incoming))));
  if (!request.url?.trim()) return NextResponse.json({ error: 'A URL is required.' }, { status: 400 });
  const headers = new Headers();
  request.headers.filter((h) => h.enabled && h.key && !BLOCKED_HEADERS.has(h.key.toLowerCase())).forEach((h) => headers.set(h.key, h.value));
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-cache');
  if (!headers.has('postman-token')) headers.set('postman-token', crypto.randomUUID());
  if (!headers.has('user-agent')) headers.set('user-agent', 'PostmanRuntime/7.54.0');
  if (!headers.has('accept')) headers.set('accept', '*/*');
  if (request.auth.type === 'bearer' && request.auth.bearerToken) headers.set('authorization', `Bearer ${request.auth.bearerToken}`);
  if (request.auth.type === 'basic') headers.set('authorization', `Basic ${Buffer.from(`${request.auth.basicUsername ?? ''}:${request.auth.basicPassword ?? ''}`).toString('base64')}`);
  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (request.bodyMode === 'json' || request.bodyMode === 'raw') body = request.bodyRaw;
    if (request.bodyMode === 'form') body = new URLSearchParams(request.bodyForm.filter((f) => f.enabled && f.key).map((f) => [f.key, f.value])).toString();
    if (request.bodyMode === 'json' && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (request.bodyMode === 'raw' && !headers.has('content-type')) headers.set('content-type', 'text/plain');
    if (request.bodyMode === 'form' && !headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const started = performance.now();
  try {
    const response = await fetchSafely(buildUrl(request), { method: request.method, headers, body, signal: controller.signal });
    const text = await readLimitedText(response);
    const result: ApiResponse = {
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - started),
      sizeBytes: Buffer.byteLength(text),
      headers: Array.from(response.headers.entries()).map(([key, value]) => ({ key, value })),
      body: text,
    };
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error && error.name === 'AbortError' ? 'Request timed out after 30 seconds.' : 'The upstream request could not be completed.' }, { status: 502 });
  } finally { clearTimeout(timeout); }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : 'The request could not be processed.' }, { status });
  }
}
