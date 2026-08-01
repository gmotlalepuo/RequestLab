import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyMcpSignature } from "@/lib/mcp/internal-signature";
import { assertSafeOutboundUrl, consumeRateLimit, HttpError, requestIdentity } from "@/lib/security/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 250_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const BLOCKED_HEADERS = new Set([
  "connection", "content-length", "host", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "forwarded", "x-forwarded-for",
  "x-forwarded-host", "x-forwarded-proto",
]);

type Row = { id?: string; key?: string; value?: string; enabled?: boolean };
type StoredRequest = {
  id: string; collection_id: string; method: string; url: string; params: Row[]; headers: Row[];
  body_mode: "none" | "json" | "raw" | "form"; body_raw: string; body_form: Row[];
  auth: { type?: string; bearerToken?: string; basicUsername?: string; basicPassword?: string };
};
type StoredEnvironment = { id: string; workspace_id: string; collection_id: string; variables: Row[] };

function parsePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "The execution payload is invalid.");
  const input = value as Record<string, unknown>;
  const allowed = new Set(["request_id", "environment_id", "expected_collection_id", "expected_method", "overrides", "expected_definition_digest", "expected_host"]);
  if (Object.keys(input).some((key) => !allowed.has(key))
    || typeof input.request_id !== "string" || !UUID.test(input.request_id)
    || typeof input.environment_id !== "string" || !UUID.test(input.environment_id)
    || typeof input.expected_collection_id !== "string" || !UUID.test(input.expected_collection_id)
    || typeof input.expected_method !== "string" || !METHODS.has(input.expected_method)
    || typeof input.expected_definition_digest !== "string" || !/^[a-f0-9]{64}$/.test(input.expected_definition_digest)
    || input.expected_host !== null && input.expected_host !== undefined && (typeof input.expected_host !== "string" || input.expected_host.length > 255)
    || !input.overrides || typeof input.overrides !== "object" || Array.isArray(input.overrides)) {
    throw new HttpError(400, "The execution payload is invalid.");
  }
  const overrides = input.overrides as Record<string, unknown>;
  if (Object.keys(overrides).length > 30 || Object.entries(overrides).some(([key, item]) =>
    !/^[a-z][a-z0-9_]{0,119}$/i.test(key) || typeof item !== "string" || item.length > 20_000)) {
    throw new HttpError(400, "Execution overrides are invalid.");
  }
  return {
    requestId: input.request_id,
    environmentId: input.environment_id,
    expectedCollectionId: input.expected_collection_id,
    expectedMethod: input.expected_method,
    overrides: overrides as Record<string, string>,
    expectedDefinitionDigest: input.expected_definition_digest,
    expectedHost: typeof input.expected_host === "string" ? input.expected_host.toLowerCase() : null,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, item]) => [key, canonicalize(item)]));
}

function definitionDigest(request: StoredRequest) {
  const definition = {
    id: request.id, collection_id: request.collection_id, method: request.method, url: request.url,
    params: request.params, headers: request.headers, body_mode: request.body_mode,
    body_raw: request.body_raw, body_form: request.body_form, auth: request.auth,
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(definition))).digest("hex");
}

const enabled = (rows: Row[] | null | undefined) =>
  Array.isArray(rows) ? rows.filter((row) => row && row.enabled !== false && typeof row.key === "string" && row.key.trim()) : [];

function resolveStoredRequest(request: StoredRequest, environment: StoredEnvironment, overrides: Record<string, string>) {
  const variables = new Map(enabled(environment.variables).map((row) => [row.key!.trim(), String(row.value ?? "")]));
  const declared = new Set(variables.keys());
  const placeholderPattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const collect = (value = "") => { for (const match of value.matchAll(placeholderPattern)) declared.add(match[1].trim()); };
  collect(request.url); collect(request.body_raw);
  for (const row of [...enabled(request.params), ...enabled(request.headers), ...enabled(request.body_form)]) {
    collect(String(row.key ?? "")); collect(String(row.value ?? ""));
  }
  for (const row of enabled(request.params)) declared.add(String(row.key));
  for (const field of ["bearerToken", "basicUsername", "basicPassword"] as const) collect(String(request.auth?.[field] ?? ""));
  const unsupported = Object.keys(overrides).filter((key) => !declared.has(key));
  if (unsupported.length) throw new HttpError(422, `Unsupported execution overrides: ${unsupported.sort().join(", ")}.`);
  for (const [key, value] of Object.entries(overrides)) variables.set(key, value);

  const missing = new Set<string>();
  const resolve = (value = "") => value.replace(placeholderPattern, (match, key: string) => {
    const normalized = key.trim();
    if (!variables.has(normalized)) { missing.add(normalized); return match; }
    return variables.get(normalized)!;
  });
  const rows = (items: Row[] | null | undefined) => enabled(items).map((row) => ({
    key: resolve(String(row.key ?? "")),
    value: overrides[String(row.key)] ?? resolve(String(row.value ?? "")),
  }));
  const params = rows(request.params);
  const target = new URL(resolve(request.url));
  for (const param of params) { target.searchParams.delete(param.key); target.searchParams.append(param.key, param.value); }
  const resolved = {
    method: request.method,
    url: target.toString(),
    headers: rows(request.headers),
    bodyMode: request.body_mode,
    bodyRaw: resolve(request.body_raw ?? ""),
    bodyForm: rows(request.body_form),
    auth: {
      type: request.auth?.type ?? "none",
      bearerToken: resolve(request.auth?.bearerToken ?? ""),
      basicUsername: resolve(request.auth?.basicUsername ?? ""),
      basicPassword: resolve(request.auth?.basicPassword ?? ""),
    },
  };
  if (missing.size) throw new HttpError(422, `Unresolved environment variables: ${[...missing].sort().join(", ")}.`);
  return resolved;
}

async function readLimitedText(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_RESPONSE_BYTES) throw new HttpError(413, "The upstream response exceeded 1 MB.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new HttpError(413, "The upstream response exceeded 1 MB."); }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(output);
}

export async function POST(incoming: NextRequest) {
  try {
    const rawBody = await incoming.text();
    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) throw new HttpError(413, "The execution payload is too large.");
    verifyMcpSignature(rawBody, incoming.headers.get("x-mcp-timestamp"), incoming.headers.get("x-mcp-signature"));
    const token = incoming.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new HttpError(401, "Authentication required.");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) throw new HttpError(503, "Supabase is not configured.");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new HttpError(401, "Authentication required.");
    consumeRateLimit(requestIdentity(incoming, user.id, "mcp-execute"), 30);
    let json: unknown;
    try { json = JSON.parse(rawBody); } catch { throw new HttpError(400, "The execution payload must contain valid JSON."); }
    const payload = parsePayload(json);
    const [{ data: request, error: requestError }, { data: environment, error: environmentError }] = await Promise.all([
      supabase.from("postman_requests").select("id,collection_id,method,url,params,headers,body_mode,body_raw,body_form,auth").eq("id", payload.requestId).single(),
      supabase.from("postman_environments").select("id,workspace_id,collection_id,variables").eq("id", payload.environmentId).single(),
    ]);
    if (requestError || environmentError || !request || !environment) throw new HttpError(404, "The request or environment was not found in the authenticated workspace.");
    const stored = request as StoredRequest;
    const selectedEnvironment = environment as StoredEnvironment;
    if (stored.collection_id !== selectedEnvironment.collection_id || stored.collection_id !== payload.expectedCollectionId) {
      throw new HttpError(422, "The request and environment relationship is invalid.");
    }
    if (stored.method !== payload.expectedMethod) throw new HttpError(409, "The stored request method changed after approval.");
    if (definitionDigest(stored) !== payload.expectedDefinitionDigest) {
      throw new HttpError(409, "The stored request definition changed after approval.");
    }
    const resolved = resolveStoredRequest(stored, selectedEnvironment, payload.overrides);
    const safeUrl = await assertSafeOutboundUrl(resolved.url);
    if (payload.expectedHost && safeUrl.host.toLowerCase() !== payload.expectedHost) {
      throw new HttpError(409, "The resolved execution host changed after approval.");
    }
    const headers = new Headers();
    for (const row of resolved.headers) if (!BLOCKED_HEADERS.has(row.key.toLowerCase())) headers.set(row.key, row.value);
    if (resolved.auth.type === "bearer" && resolved.auth.bearerToken) headers.set("authorization", `Bearer ${resolved.auth.bearerToken}`);
    if (resolved.auth.type === "basic") headers.set("authorization", `Basic ${Buffer.from(`${resolved.auth.basicUsername}:${resolved.auth.basicPassword}`).toString("base64")}`);
    headers.set("cache-control", "no-cache");
    headers.set("user-agent", "RequestLab-MCP/1.0");
    let body: string | undefined;
    if (!["GET", "HEAD"].includes(resolved.method)) {
      if (resolved.bodyMode === "json" || resolved.bodyMode === "raw") body = resolved.bodyRaw;
      if (resolved.bodyMode === "form") body = new URLSearchParams(resolved.bodyForm.map((row) => [row.key, row.value])).toString();
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const started = performance.now();
    try {
      const response = await fetch(safeUrl, { method: resolved.method, headers, body, redirect: "manual", signal: controller.signal });
      const responseBody = await readLimitedText(response);
      return NextResponse.json({
        request_id: stored.id, environment_id: selectedEnvironment.id, resolved_host: safeUrl.host,
        method: resolved.method, status: response.status, status_text: response.statusText,
        duration_ms: Math.round(performance.now() - started), size_bytes: Buffer.byteLength(responseBody),
        content_type: response.headers.get("content-type"), body: responseBody,
      });
    } finally { clearTimeout(timer); }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    const message = error instanceof HttpError ? error.message
      : error instanceof Error && error.name === "AbortError" ? "The upstream request timed out."
        : "The MCP execution request could not be completed.";
    return NextResponse.json({ error: message }, { status });
  }
}
