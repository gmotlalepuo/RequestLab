import { createBrowserClient } from '@supabase/ssr';

const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = () => Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  supabaseKey,
);

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Add the required values to .env.local.');
  }
  return client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey!,
  );
}
