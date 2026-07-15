import { redirect } from "next/navigation";
import AdminPortal from "@/components/AdminPortal";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  if (user.app_metadata?.requestlab_role !== "admin") redirect("/app");
  return <AdminPortal currentUserId={user.id} />;
}
