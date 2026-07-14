import { ApiRequest, ApiResponse } from '../types';

const REQUEST_TIMEOUT_MS = 30000;

const encodeBase64 = (input: string): string => {
  if (typeof btoa === 'function') {
    return btoa(input);
  }
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = input.charCodeAt(i + 1);
    const c = input.charCodeAt(i + 2);
    output += chars[a >> 2];
    output += chars[((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4)];
    output += isNaN(b) ? '=' : chars[((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6)];
    output += isNaN(c) ? '=' : chars[c & 63];
  }
  return output;
};

export function buildUrl(request: ApiRequest): string {
  let url = request.url.trim();
  if (url === '') {
    return url;
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  const enabledParams = request.params.filter(
    (param) => param.enabled && param.key !== '',
  );
  if (enabledParams.length === 0) {
    return url;
  }
  const pairs = enabledParams
    .map(
      (param) =>
        `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value)}`,
    )
    .join('&');
  return url + (url.includes('?') ? '&' : '?') + pairs;
}

export async function sendRequest(request: ApiRequest): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  for (const header of request.headers) {
    if (header.enabled && header.key !== '') {
      headers[header.key] = header.value;
    }
  }

  if (request.auth.type === 'bearer' && request.auth.bearerToken) {
    headers['Authorization'] = `Bearer ${request.auth.bearerToken}`;
  } else if (request.auth.type === 'basic') {
    const credentials = `${request.auth.basicUsername ?? ''}:${request.auth.basicPassword ?? ''}`;
    headers['Authorization'] = `Basic ${encodeBase64(credentials)}`;
  }

  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (request.bodyMode === 'json') {
      body = request.bodyRaw;
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (request.bodyMode === 'raw') {
      body = request.bodyRaw;
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'text/plain';
      }
    } else if (request.bodyMode === 'form') {
      body = request.bodyForm
        .filter((field) => field.enabled && field.key !== '')
        .map(
          (field) =>
            `${encodeURIComponent(field.key)}=${encodeURIComponent(field.value)}`,
        )
        .join('&');
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(buildUrl(request), {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    const durationMs = Date.now() - startedAt;
    const responseHeaders: { key: string; value: string }[] = [];
    response.headers.forEach((value, key) => {
      responseHeaders.push({ key, value });
    });
    return {
      status: response.status,
      statusText: response.statusText,
      durationMs,
      sizeBytes: new Blob([text]).size,
      headers: responseHeaders,
      body: text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function prettyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
