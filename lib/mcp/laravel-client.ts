import "server-only";

import { createClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/security/http";

export async function authenticatedMcpRequest(path: string, body?: unknown, method = "POST") {
  const baseUrl = process.env.MCP_SERVER_URL?.replace(/\/+$/, "");
  if (!baseUrl) throw new HttpError(503, "The MCP server is not configured.");
  const supabase = await createClient();
  const [{ data: { user } }, { data: { session } }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  if (!user || !session?.access_token) throw new HttpError(401, "Authentication required.");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
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
  } catch {
    throw new HttpError(503, "The MCP server is unavailable.");
  }
  const result = await response.json().catch(() => null);
  if (!result || typeof result !== "object") throw new HttpError(502, "The MCP server returned an invalid response.");
  return { status: response.status, result };
}
