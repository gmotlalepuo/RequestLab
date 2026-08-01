import { NextRequest, NextResponse } from "next/server";
import { authenticatedMcpRequest } from "@/lib/mcp/laravel-client";
import { assertSameOrigin, consumeRateLimit, HttpError, readJson, requestIdentity } from "@/lib/security/http";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 140;

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new HttpError(401, "Authentication required.");
    consumeRateLimit(requestIdentity(request, user.id, "ai-mcp"), 30);
    const payload = await readJson(request, 100_000);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new HttpError(400, "The MCP request is invalid.");
    const rpc = payload as Record<string, unknown>;
    if (rpc.jsonrpc !== "2.0" || typeof rpc.id !== "string" && typeof rpc.id !== "number"
      || !["initialize", "tools/list", "tools/call"].includes(String(rpc.method))) {
      throw new HttpError(400, "The MCP request is invalid.");
    }
    const { status, result } = await authenticatedMcpRequest("/api/mcp", rpc);
    return NextResponse.json(result, { status });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "The AI request could not be processed." }, { status });
  }
}
