import { redirect } from "next/navigation";
import SettingsPortal from "@/components/SettingsPortal";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  const apps = Array.isArray(user.app_metadata?.apps) ? user.app_metadata.apps : [];
  if (!apps.includes("requestlab") && !user.app_metadata?.requestlab_role) redirect("/choose-app");
  return <SettingsPortal email={user.email || ""} metadata={user.user_metadata || {}} isAdmin={user.app_metadata?.requestlab_role === "admin"} />;
}
