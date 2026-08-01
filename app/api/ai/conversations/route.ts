import { NextRequest, NextResponse } from "next/server";
import { authenticatedMcpRequest } from "@/lib/mcp/laravel-client";
import { assertSameOrigin, consumeRateLimit, HttpError, readJson, requestIdentity } from "@/lib/security/http";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function user(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, "Authentication required.");
  consumeRateLimit(requestIdentity(request, user.id, "ai-conversations"), 60);
}

function result(response: { status: number; result: unknown }) {
  return NextResponse.json(response.result, { status: response.status });
}

export async function GET(request: NextRequest) {
  try {
    await user(request);
    const workspaceId = request.nextUrl.searchParams.get("workspace_id");
    const conversationId = request.nextUrl.searchParams.get("conversation_id");
    const audit = request.nextUrl.searchParams.get("audit") === "1";
    if (conversationId) {
      if (!UUID.test(conversationId)) throw new HttpError(400, "The conversation is invalid.");
      return result(await authenticatedMcpRequest(`/api/mcp/conversations/${conversationId}`, undefined, "GET"));
    }
    if (!workspaceId || !UUID.test(workspaceId)) throw new HttpError(400, "Choose a valid workspace.");
    const path = audit ? "/api/mcp/executions" : "/api/mcp/conversations";
    return result(await authenticatedMcpRequest(`${path}?workspace_id=${encodeURIComponent(workspaceId)}`, undefined, "GET"));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "AI history could not be loaded." }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request); await user(request);
    const raw = await readJson(request, 30_000);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "The conversation request is invalid.");
    const value = raw as Record<string, unknown>;
    if (value.action === "create") {
      if (typeof value.workspace_id !== "string" || !UUID.test(value.workspace_id)) throw new HttpError(400, "Choose a valid workspace.");
      return result(await authenticatedMcpRequest("/api/mcp/conversations", {
        workspace_id: value.workspace_id, collection_id: value.collection_id || null,
        environment_id: value.environment_id || null, request_id: value.request_id || null,
      }));
    }
    if (value.action === "message" && typeof value.conversation_id === "string" && UUID.test(value.conversation_id)
      && ["user", "agent", "error"].includes(String(value.role)) && typeof value.text === "string" && value.text.trim().length <= 20_000) {
      return result(await authenticatedMcpRequest(`/api/mcp/conversations/${value.conversation_id}/messages`, {
        role: value.role, text: value.text, ...(value.metadata && typeof value.metadata === "object" ? { metadata: value.metadata } : {}),
      }));
    }
    throw new HttpError(400, "The conversation request is invalid.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "The conversation could not be saved." }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request); await user(request);
    const id = request.nextUrl.searchParams.get("conversation_id");
    if (!id || !UUID.test(id)) throw new HttpError(400, "The conversation is invalid.");
    return result(await authenticatedMcpRequest(`/api/mcp/conversations/${id}`, undefined, "DELETE"));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "The conversation could not be archived." }, { status });
  }
}
