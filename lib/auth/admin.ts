import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, error: "Authentication required", status: 401 } as const;
  if (user.app_metadata?.requestlab_role !== "admin") {
    return { user: null, error: "Administrator access required", status: 403 } as const;
  }
  return { user, error: null, status: 200 } as const;
}
