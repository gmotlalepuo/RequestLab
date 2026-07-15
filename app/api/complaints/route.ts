import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  return NextResponse.json({ complaints: data });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json();
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  if (subject.length < 3 || message.length < 10) {
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
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (user.app_metadata?.requestlab_role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  const body = await request.json();
  const status = ["open", "in_progress", "resolved"].includes(body.status) ? body.status : "open";
  const { data, error } = await createAdminClient().from("postman_complaints").update({
    status,
    admin_response: String(body.adminResponse || "").trim(),
    updated_at: new Date().toISOString(),
  }).eq("id", body.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ complaint: data });
}
