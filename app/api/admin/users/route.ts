import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

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
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const access = await requireAdmin();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || password.length < 8) {
    return NextResponse.json({ error: "A valid email and password of at least 8 characters are required." }, { status: 400 });
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
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: data.user }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await requireAdmin();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  if (id === access.user.id && (body.role === "user" || body.banned === true)) {
    return NextResponse.json({ error: "You cannot remove or suspend your own administrator access." }, { status: 400 });
  }
  const attributes: Record<string, unknown> = {};
  if (body.email) attributes.email = String(body.email).trim().toLowerCase();
  if (body.password) {
    if (String(body.password).length < 8) return NextResponse.json({ error: "Passwords must contain at least 8 characters." }, { status: 400 });
    attributes.password = String(body.password);
  }
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(id);
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 400 });
  if (body.fullName !== undefined) attributes.user_metadata = { ...existing.user.user_metadata, full_name: String(body.fullName).trim() };
  if (body.role) attributes.app_metadata = { ...existing.user.app_metadata, requestlab_role: body.role === "admin" ? "admin" : "user" };
  if (body.banned !== undefined) attributes.ban_duration = body.banned ? "876000h" : "none";
  const { data, error } = await admin.auth.admin.updateUserById(id, attributes);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: data.user });
}

export async function DELETE(request: Request) {
  const access = await requireAdmin();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  if (id === access.user.id) return NextResponse.json({ error: "You cannot delete your own administrator account." }, { status: 400 });
  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
