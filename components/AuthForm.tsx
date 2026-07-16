"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import BrandLogo from "./BrandLogo";
import ThemeToggle from "./ThemeToggle";

type Mode = "login" | "forgot";

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const changeMode = (next: Mode) => { setMode(next); setError(""); setMessage(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setMessage("");
    if (!isSupabaseConfigured()) { setError("Supabase is not configured for this deployment."); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser();
        const apps = Array.isArray(user?.app_metadata?.apps) ? user.app_metadata.apps : [];
        const sharedAccount = apps.length > 1;
        window.location.assign(sharedAccount ? "/choose-app" : "/app");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/auth` });
        if (error) throw error;
        setMessage("Password reset instructions are on their way.");
      }
    } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
  };
  return <main className="auth-page">
    <section className="auth-story"><Link className="brand" href="/" aria-label="RequestLab home"><BrandLogo /></Link><div><span className="hero-pill dark-pill"><LockKeyhole size={14}/> Administrator-managed access</span><h1>Your API work,<br/>only yours.</h1><p>Every workspace is protected by authentication and database security policies.</p><ul><li><Check size={17}/> Access requests from any device</li><li><Check size={17}/> Keep collections isolated by account</li><li><Check size={17}/> Collaborate inside approved workspaces</li></ul></div><small>Securely powered by Supabase Auth</small></section>
    <section className="auth-panel"><ThemeToggle className="auth-theme-toggle"/><div className="auth-card"><Link className="back-link" href="/"><ArrowLeft size={16}/> Back to home</Link><span className="mobile-auth-logo"><BrandLogo markOnly/></span><div className="auth-title"><span className="eyebrow">{mode === "forgot" ? "Account recovery" : "Welcome back"}</span><h2>{mode === "forgot" ? "Reset your password" : "Log in to RequestLab"}</h2><p>{mode === "forgot" ? "We’ll email you a secure reset link." : "Continue where you left off."}</p></div>
      <form onSubmit={submit}><label className="auth-field"><span>Email address</span><div><Mail size={18}/><input required type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)}/></div></label>{mode === "login" && <label className="auth-field"><span>Password</span><div><LockKeyhole size={18}/><input required minLength={8} type={showPassword?"text":"password"} autoComplete="current-password" placeholder="Your password" value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={showPassword?"Hide password":"Show password"} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>}{mode === "login"&&<button className="forgot-link" type="button" onClick={()=>changeMode("forgot")}>Forgot password?</button>}{error&&<div className="auth-error" role="alert">{error}</div>}{message&&<div className="auth-success" role="status">{message}</div>}<button className="auth-submit" disabled={loading}>{loading&&<LoaderCircle className="spin" size={18}/>} {mode === "forgot"?"Send reset link":"Log in"}</button></form>
      <div className="auth-switch">{mode === "login"?<span className="signup-restricted">Accounts are created by an administrator. Contact <a href="mailto:gmotlalepuo@gmail.com">gmotlalepuo@gmail.com</a> for access.</span>:<button onClick={()=>changeMode("login")}>Return to login</button>}</div>
    </div></section>
  </main>;
}
