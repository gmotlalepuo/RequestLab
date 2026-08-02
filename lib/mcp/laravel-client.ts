import "server-only";

import { createClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/security/http";

function configuredMcpUrl() {
  const configured = process.env.MCP_SERVER_URL?.trim();
  if (!configured) {
    throw new HttpError(503, "The MCP server is not configured: MCP_SERVER_URL is missing or empty in .env.local.");
  }
  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error("unsupported protocol");
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url;
  } catch {
    throw new HttpError(503, "The MCP server configuration is invalid: MCP_SERVER_URL must be an absolute HTTP or HTTPS URL.");
  }
}

function connectionError(error: unknown, target: URL) {
  const cause = error instanceof Error && error.cause && typeof error.cause === "object"
    ? error.cause as { code?: unknown }
    : undefined;
  const code = typeof cause?.code === "string" ? cause.code : undefined;
  const endpoint = `${target.hostname}:${target.port || (target.protocol === "https:" ? "443" : "80")}`;
  if (code === "ECONNREFUSED") {
    return `The MCP server refused the connection at ${endpoint}. Check that it is running, listening on a public interface, and that the port is open.`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return `The MCP server hostname ${target.hostname} could not be resolved (${code}).`;
  }
  if (code === "ETIMEDOUT" || error instanceof DOMException && error.name === "TimeoutError") {
    return `The MCP server at ${endpoint} did not complete the request within 130 seconds. The server is reachable, but its handler or local model may be stalled.`;
  }
  return `The MCP server is unavailable at ${endpoint}${code ? ` (${code})` : ""}.`;
}

export async function authenticatedMcpRequest(path: string, body?: unknown, method = "POST") {
  const baseUrl = configuredMcpUrl();
  const supabase = await createClient();
  const [{ data: { user } }, { data: { session } }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  if (!user || !session?.access_token) throw new HttpError(401, "Authentication required.");

  let response: Response;
  try {
    response = await fetch(new URL(path, `${baseUrl.toString()}/`), {
      method,
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(130_000),
    });
  } catch (error) {
    throw new HttpError(503, connectionError(error, baseUrl));
  }
  const result = await response.json().catch(() => null);
  if (!result || typeof result !== "object") {
    const contentType = response.headers.get("content-type") || "not provided";
    throw new HttpError(502, `The MCP server returned a non-JSON response (HTTP ${response.status}, Content-Type: ${contentType}).`);
  }
  return { status: response.status, result };
}
