import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, consumeRateLimit, HttpError, readJson } from "@/lib/security/http";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export async function GET() {
  const access = await requireAdmin();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const admin = createAdminClient();
  const users = [];
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    users.push(...data.users);
    if (data.users.length < perPage) break;
  }
  return NextResponse.json({ users }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
  assertSameOrigin(request);
  const access = await requireAdmin();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  consumeRateLimit(`admin-users:create:${access.user.id}`, 20);
  const body = await readJson(request);
  if (!record(body)) throw new HttpError(400, "Invalid user details.");
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!EMAIL.test(email) || email.length > 320 || password.length < 12 || password.length > 256 || String(body.fullName || "").length > 120) {
    throw new HttpError(400, "A valid email, full name, and password of 12–256 characters are required.");
  }
  const role = body.role === "admin" ? "admin" : "user";
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { apps: ["requestlab"], requestlab_role: role },
    user_metadata: {
      full_name: String(body.fullName || "").trim(),
      job_title: "",
      company: "",
    },
  });
  if (error) throw new HttpError(400, "The user could not be created. Check whether the email already exists.");
  return NextResponse.json({ user: data.user }, { status: 201 });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "The user could not be created." }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
  assertSameOrigin(request);
  const access = await requireAdmin();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  consumeRateLimit(`admin-users:update:${access.user.id}`, 60);
  const body = await readJson(request);
  if (!record(body)) throw new HttpError(400, "Invalid user update.");
  const id = String(body.id || "");
  if (!UUID.test(id)) throw new HttpError(400, "A valid user ID is required.");
  if (id === access.user.id && (body.role === "user" || body.banned === true)) {
    return NextResponse.json({ error: "You cannot remove or suspend your own administrator access." }, { status: 400 });
  }
  const attributes: Record<string, unknown> = {};
  if (body.email) {
    const email = String(body.email).trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 320) throw new HttpError(400, "Enter a valid email address.");
    attributes.email = email;
  }
  if (body.password) {
    if (String(body.password).length < 12 || String(body.password).length > 256) throw new HttpError(400, "Passwords must contain 12–256 characters.");
    attributes.password = String(body.password);
  }
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(id);
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 400 });
  if (body.fullName !== undefined) {
    if (String(body.fullName).length > 120) throw new HttpError(400, "Full name is too long.");
    attributes.user_metadata = { ...existing.user.user_metadata, full_name: String(body.fullName).trim() };
  }
  if (body.role) attributes.app_metadata = { ...existing.user.app_metadata, requestlab_role: body.role === "admin" ? "admin" : "user" };
  if (body.banned !== undefined) attributes.ban_duration = body.banned ? "876000h" : "none";
  const { data, error } = await admin.auth.admin.updateUserById(id, attributes);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: data.user });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "The user could not be updated." }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
  assertSameOrigin(request);
  const access = await requireAdmin();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) throw new HttpError(400, "A valid user ID is required.");
  consumeRateLimit(`admin-users:delete:${access.user.id}`, 20);
  if (id === access.user.id) return NextResponse.json({ error: "You cannot delete your own administrator account." }, { status: 400 });
  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "The user could not be deleted." }, { status });
  }
}
