'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';

type Mode = 'login' | 'signup' | 'forgot';

export default function AuthForm({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const changeMode = (next: Mode) => { setMode(next); setError(''); setMessage(''); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!isSupabaseConfigured()) { setError('Supabase is not configured for this deployment.'); return; }
    setLoading(true);
    const supabase = createClient();
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.assign('/app');
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (error) throw error;
        if (data.session) window.location.assign('/app');
        else setMessage('Check your inbox to confirm your email, then return to log in.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/auth?mode=login` });
        if (error) throw error;
        setMessage('Password reset instructions are on their way.');
      }
    } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
  };

  const title = mode === 'forgot' ? 'Reset your password' : mode === 'signup' ? 'Start your workspace' : 'Log in to RequestLab';
  return <main className="auth-page">
    <section className="auth-story">
      <Link className="brand" href="/" aria-label="RequestLab home"><BrandLogo /></Link>
      <div><span className="hero-pill dark-pill"><LockKeyhole size={14}/> Private workspaces</span><h1>Your API work,<br/>only yours.</h1><p>Every workspace is protected by authentication and owner-based database policies.</p><ul><li><Check size={17}/> Access your requests from any device</li><li><Check size={17}/> Keep collections isolated by account</li><li><Check size={17}/> Work comfortably on desktop and mobile</li></ul></div>
      <small>Securely powered by Supabase Auth</small>
    </section>
    <section className="auth-panel">
      <ThemeToggle className="auth-theme-toggle"/>
      <div className="auth-card">
        <Link className="back-link" href="/"><ArrowLeft size={16}/> Back to home</Link>
        <span className="mobile-auth-logo"><BrandLogo markOnly /></span>
        <div className="auth-title"><span className="eyebrow">{mode === 'forgot' ? 'Account recovery' : mode === 'signup' ? 'Create your account' : 'Welcome back'}</span><h2>{title}</h2><p>{mode === 'forgot' ? 'We’ll email you a secure reset link.' : mode === 'signup' ? 'Free to start. Your data stays private.' : 'Continue where you left off.'}</p></div>
        <form onSubmit={submit}>
          <label className="auth-field"><span>Email address</span><div><Mail size={18}/><input required type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}/></div></label>
          {mode !== 'forgot' && <label className="auth-field"><span>Password</span><div><LockKeyhole size={18}/><input required minLength={8} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)}/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>}
          {mode === 'login' && <button className="forgot-link" type="button" onClick={() => changeMode('forgot')}>Forgot password?</button>}
          {error && <div className="auth-error" role="alert">{error}</div>}{message && <div className="auth-success" role="status">{message}</div>}
          <button className="auth-submit" disabled={loading}>{loading && <LoaderCircle className="spin" size={18}/>} {mode === 'forgot' ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
        </form>
        <div className="auth-switch">{mode === 'signup' ? <>Already have an account? <button onClick={() => changeMode('login')}>Log in</button></> : mode === 'login' ? <>New to RequestLab? <button onClick={() => changeMode('signup')}>Create an account</button></> : <button onClick={() => changeMode('login')}>Return to login</button>}</div>
      </div>
    </section>
  </main>;
}
