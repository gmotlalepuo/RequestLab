import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, consumeRateLimit, HttpError, readJson } from "@/lib/security/http";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const admin = createAdminClient();
  let query = admin.from("postman_complaints").select("*").order("created_at", { ascending: false });
  if (user.app_metadata?.requestlab_role !== "admin") query = query.eq("user_id", user.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ complaints: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
  assertSameOrigin(request);
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  consumeRateLimit(`complaints:create:${user.id}`, 10);
  const body = await readJson(request, 50_000);
  if (!record(body)) throw new HttpError(400, "Invalid complaint details.");
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  if (subject.length < 3 || subject.length > 160 || message.length < 10 || message.length > 10_000) {
    return NextResponse.json({ error: "Add a subject and a message of at least 10 characters." }, { status: 400 });
  }
  const { data, error } = await createAdminClient().from("postman_complaints").insert({
    user_id: user.id,
    user_email: user.email || "",
    subject,
    message,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ complaint: data }, { status: 201 });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "The complaint could not be submitted." }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
  assertSameOrigin(request);
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (user.app_metadata?.requestlab_role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  consumeRateLimit(`complaints:update:${user.id}`, 60);
  const body = await readJson(request, 50_000);
  if (!record(body) || !UUID.test(String(body.id || ""))) throw new HttpError(400, "A valid complaint ID is required.");
  const requestedStatus = String(body.status || "");
  const status = ["open", "in_progress", "resolved"].includes(requestedStatus) ? requestedStatus : "open";
  const { data, error } = await createAdminClient().from("postman_complaints").update({
    status,
    admin_response: String(body.adminResponse || "").trim().slice(0, 10_000),
    updated_at: new Date().toISOString(),
  }).eq("id", body.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ complaint: data });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "The complaint could not be updated." }, { status });
  }
}
