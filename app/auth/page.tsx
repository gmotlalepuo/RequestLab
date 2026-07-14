import AuthForm from '@/components/AuthForm';

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <AuthForm initialMode={mode === 'signup' ? 'signup' : 'login'} />;
}
