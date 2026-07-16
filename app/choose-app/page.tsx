import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Braces, BriefcaseBusiness } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BrandLogo from "@/components/BrandLogo";
import ThemeToggle from "@/components/ThemeToggle";

export default async function ChooseAppPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  const apps: string[] = Array.isArray(user.app_metadata?.apps) ? user.app_metadata.apps : [];
  const hasRequestLab = apps.includes("requestlab") || Boolean(user.app_metadata?.requestlab_role);
  const hasBermuda = apps.includes("bermuda");
  if (hasRequestLab && !hasBermuda) redirect("/app");
  const bermudaUrl = process.env.NEXT_PUBLIC_BERMUDA_APP_URL || "";
  return <main className="app-chooser"><header><BrandLogo/><ThemeToggle/></header><section><span className="section-kicker">Welcome back</span><h1>Which app would you like to open?</h1><p>Your account has access to more than one 26Digital workspace.</p><div className="app-choice-grid">{hasRequestLab&&<Link href="/app"><span><Braces/></span><div><strong>RequestLab</strong><small>API requests, collections, and collaboration</small></div><ArrowRight/></Link>}{hasBermuda&&(bermudaUrl?<a href={bermudaUrl}><span><BriefcaseBusiness/></span><div><strong>Bermuda</strong><small>Continue to the Bermuda application</small></div><ArrowRight/></a>:<div className="app-choice-disabled"><span><BriefcaseBusiness/></span><div><strong>Bermuda</strong><small>Add NEXT_PUBLIC_BERMUDA_APP_URL to enable this link.</small></div></div>)}</div></section></main>;
}
