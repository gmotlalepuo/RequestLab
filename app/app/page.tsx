import { redirect } from 'next/navigation';
import ApiClient from '@/components/ApiClient';
import { createClient } from '@/lib/supabase/server';

export default async function WorkspacePage() {
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseKey) redirect('/#setup');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth');
  const apps = Array.isArray(user.app_metadata?.apps) ? user.app_metadata.apps : [];
  if (!apps.includes('requestlab') && !user.app_metadata?.requestlab_role) redirect('/choose-app');
  return <ApiClient userId={user.id} userEmail={user.email ?? 'Account'} isAdmin={user.app_metadata?.requestlab_role === 'admin'} />;
}
