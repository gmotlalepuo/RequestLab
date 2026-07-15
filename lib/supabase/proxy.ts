import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user && (path.startsWith('/app') || path.startsWith('/admin') || path.startsWith('/settings') || path.startsWith('/choose-app') || path.startsWith('/api/'))) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  if (user && path === '/auth') {
    const url = request.nextUrl.clone();
    const apps = Array.isArray(user.app_metadata?.apps) ? user.app_metadata.apps : [];
    const sharedAccount = apps.length > 1 || ['gmotlalepuo@gmail.com', 'garenosi@26digitalbw.com'].includes((user.email || '').toLowerCase());
    url.pathname = sharedAccount ? '/choose-app' : '/app';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}
