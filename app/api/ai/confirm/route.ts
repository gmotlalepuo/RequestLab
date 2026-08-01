import { NextRequest, NextResponse } from "next/server";
import { authenticatedMcpRequest } from "@/lib/mcp/laravel-client";
import { assertSameOrigin, consumeRateLimit, HttpError, readJson, requestIdentity } from "@/lib/security/http";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new HttpError(401, "Authentication required.");
    consumeRateLimit(requestIdentity(request, user.id, "ai-confirm"), 10);
    const value = await readJson(request, 20_000);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "The approval request is invalid.");
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["confirmation_id", "plan_digest", "idempotency_key"].includes(key))
      || typeof input.confirmation_id !== "string" || !UUID.test(input.confirmation_id)
      || typeof input.plan_digest !== "string" || !/^[a-f0-9]{64}$/.test(input.plan_digest)
      || typeof input.idempotency_key !== "string" || !/^[A-Za-z0-9._:-]{16,120}$/.test(input.idempotency_key)) {
      throw new HttpError(400, "The approval request is invalid.");
    }
    const { status, result } = await authenticatedMcpRequest(
      `/api/mcp/confirmations/${input.confirmation_id}/approve`,
      { plan_digest: input.plan_digest, idempotency_key: input.idempotency_key },
    );
    return NextResponse.json(result, { status });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "The approval could not be processed." }, { status });
  }
}
