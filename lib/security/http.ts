import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

const JSON_LIMIT_BYTES = 1_000_000;
const RATE_WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, "Cross-origin requests are not allowed.");
  }
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") {
    throw new HttpError(403, "Cross-site requests are not allowed.");
  }
}

export async function readJson(request: Request, maxBytes = JSON_LIMIT_BYTES): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new HttpError(413, "Request body is too large.");
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw new HttpError(413, "Request body is too large.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "Request body must contain valid JSON.");
  }
}

export function consumeRateLimit(key: string, limit: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  if (bucket.count >= limit) {
    throw new HttpError(429, "Too many requests. Please wait and try again.");
  }
  bucket.count += 1;
  if (buckets.size > 5_000) {
    for (const [entryKey, entry] of buckets) if (entry.resetAt <= now) buckets.delete(entryKey);
  }
}

const isPrivateIpv4 = (address: string) => {
  const [a, b, c] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0)
    || (a === 192 && b === 2) || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0 && c === 113) || a >= 224;
};

const isPrivateIpv6 = (address: string) => {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8")
    || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")
    || normalized.startsWith("ff") || normalized.startsWith("2001:db8")) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    return isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
};

const isBlockedAddress = (address: string) => {
  const version = isIP(address);
  return version === 4 ? isPrivateIpv4(address) : version === 6 ? isPrivateIpv6(address) : true;
};

export async function assertSafeOutboundUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "Enter a valid request URL.");
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, "Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password) throw new HttpError(400, "Credentials are not allowed in request URLs.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new HttpError(403, "Local and private network destinations are blocked.");
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => { throw new HttpError(400, "The request host could not be resolved."); });
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new HttpError(403, "Local, private, reserved, and metadata destinations are blocked.");
  }
  return url;
}

export function requestIdentity(request: NextRequest, userId: string, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${scope}:${userId}:${forwarded || "unknown"}`;
}
