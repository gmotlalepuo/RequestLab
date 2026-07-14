import { NextRequest, NextResponse } from 'next/server';
import type { ApiRequest, ApiResponse } from '@/src/types';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const request = resolveEnvironment((await incoming.json()) as ApiRequest);
  if (!request.url?.trim()) return NextResponse.json({ error: 'A URL is required.' }, { status: 400 });
  const headers = new Headers();
  request.headers.filter((h) => h.enabled && h.key).forEach((h) => headers.set(h.key, h.value));
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-cache');
  if (!headers.has('postman-token')) headers.set('postman-token', crypto.randomUUID());
  if (!headers.has('user-agent')) headers.set('user-agent', 'PostmanRuntime/7.54.0');
  if (!headers.has('accept')) headers.set('accept', '*/*');
  if (!headers.has('accept-encoding')) headers.set('accept-encoding', 'gzip, deflate, br');
  if (!headers.has('connection')) headers.set('connection', 'keep-alive');
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
    const response = await fetch(buildUrl(request), { method: request.method, headers, body, signal: controller.signal, redirect: 'follow' });
    const text = await response.text();
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
    return NextResponse.json({ error: error instanceof Error && error.name === 'AbortError' ? 'Request timed out after 30 seconds.' : (error as Error).message }, { status: 502 });
  } finally { clearTimeout(timeout); }
}
