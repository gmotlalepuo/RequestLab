"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, LoaderCircle, MessageSquareWarning, Save, UserRound } from "lucide-react";
import BrandLogo from "./BrandLogo";
import ThemeToggle from "./ThemeToggle";
import { createClient } from "@/lib/supabase/client";

type Complaint = { id: string; subject: string; message: string; status: string; admin_response: string; created_at: string };

export default function SettingsPortal({ email, metadata, isAdmin }: { email: string; metadata: Record<string, unknown>; isAdmin: boolean }) {
  const [profile, setProfile] = useState({ fullName: String(metadata.full_name || ""), jobTitle: String(metadata.job_title || ""), company: String(metadata.company || "") });
  const [password, setPassword] = useState("");
  const [complaint, setComplaint] = useState({ subject: "", message: "" });
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadComplaints = async () => {
    const response = await fetch("/api/complaints");
    const data = await response.json();
    if (response.ok) setComplaints(data.complaints || []);
  };
  useEffect(() => { void loadComplaints(); }, []);
  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label); setError(""); setNotice("");
    try { await task(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  };
  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    void run("profile", async () => {
      const { error } = await createClient().auth.updateUser({ data: { full_name: profile.fullName, job_title: profile.jobTitle, company: profile.company } });
      if (error) throw error;
      setNotice("Profile information updated.");
    });
  };
  const changePassword = (event: FormEvent) => {
    event.preventDefault();
    void run("password", async () => {
      if (password.length < 8) throw new Error("Use at least 8 characters for your new password.");
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      setPassword(""); setNotice("Password changed successfully.");
    });
  };
  const submitComplaint = (event: FormEvent) => {
    event.preventDefault();
    void run("complaint", async () => {
      const response = await fetch("/api/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(complaint) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setComplaint({ subject: "", message: "" });
      setNotice("Your complaint was sent to the administrator.");
      await loadComplaints();
    });
  };

  return <main className="portal-page">
    <header className="portal-header"><BrandLogo /><nav><Link href="/app"><ArrowLeft size={15}/> Workspace</Link>{isAdmin && <Link href="/admin">Admin portal</Link>}<ThemeToggle /></nav></header>
    <div className="portal-layout">
      <aside><span className="section-kicker">Account</span><h1>Settings</h1><p>Manage your profile, security, and support requests.</p><div className="account-summary"><UserRound/><div><strong>{profile.fullName || "RequestLab user"}</strong><small>{email}</small></div></div></aside>
      <section className="settings-stack">
        {(error || notice) && <div className={error ? "portal-alert error" : "portal-alert success"}>{error || notice}</div>}
        <form className="portal-card" onSubmit={saveProfile}><header><UserRound/><div><h2>Profile information</h2><p>Keep your account details current.</p></div></header><div className="portal-fields"><label>Full name<input value={profile.fullName} onChange={e=>setProfile({...profile,fullName:e.target.value})}/></label><label>Job title<input value={profile.jobTitle} onChange={e=>setProfile({...profile,jobTitle:e.target.value})}/></label><label>Company<input value={profile.company} onChange={e=>setProfile({...profile,company:e.target.value})}/></label><label>Email<input value={email} disabled/></label></div><button className="primary" disabled={busy==="profile"}>{busy==="profile"?<LoaderCircle className="spin"/>:<Save/>} Save profile</button></form>
        <form className="portal-card" onSubmit={changePassword}><header><KeyRound/><div><h2>Change password</h2><p>Use a unique password with at least eight characters.</p></div></header><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy==="password"}>{busy==="password"?<LoaderCircle className="spin"/>:<KeyRound/>} Update password</button></form>
        <form className="portal-card" onSubmit={submitComplaint}><header><MessageSquareWarning/><div><h2>Report a problem</h2><p>Tell the administrator what went wrong or what could improve.</p></div></header><label>Subject<input required minLength={3} value={complaint.subject} onChange={e=>setComplaint({...complaint,subject:e.target.value})}/></label><label>Details<textarea required minLength={10} value={complaint.message} onChange={e=>setComplaint({...complaint,message:e.target.value})}/></label><button className="primary" disabled={busy==="complaint"}>{busy==="complaint"?<LoaderCircle className="spin"/>:<MessageSquareWarning/>} Submit complaint</button></form>
        <section className="portal-card"><header><CheckCircle2/><div><h2>Your reports</h2><p>Track responses from the administrator.</p></div></header><div className="complaint-list">{complaints.length?complaints.map(item=><article key={item.id}><div><strong>{item.subject}</strong><span className={`status-badge ${item.status}`}>{item.status.replace("_"," ")}</span></div><p>{item.message}</p>{item.admin_response&&<blockquote>{item.admin_response}</blockquote>}<small>{new Date(item.created_at).toLocaleString()}</small></article>):<p className="muted">You have not submitted any complaints.</p>}</div></section>
      </section>
    </div>
  </main>;
}
