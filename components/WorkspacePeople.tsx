'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Check, Clock3, Mail, ShieldCheck, Trash2, UserRound, Users, X } from 'lucide-react';
import type { Repository } from '@/src/data/repository';
import type { Workspace, WorkspaceInvite, WorkspaceMember } from '@/src/types';

export function PendingInvites({ repo, invites, onChanged }: { repo: Repository; invites: WorkspaceInvite[]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!invites.length) return null;
  const respond = async (invite: WorkspaceInvite, accept: boolean) => {
    setBusy(invite.id);
    try { await repo.respondToInvite(invite.id, accept); await onChanged(); } finally { setBusy(null); }
  };
  return <section className="invite-banner" aria-label="Pending workspace invitations"><div className="invite-banner-icon"><Mail size={19}/></div><div className="invite-banner-copy"><strong>Workspace invitation</strong><span>{invites[0].workspaceName ? `You were invited to “${invites[0].workspaceName}”.` : 'You were invited to a shared workspace.'}</span></div><div className="invite-banner-actions"><button className="secondary" disabled={busy !== null} onClick={() => respond(invites[0], false)}>Decline</button><button className="primary" disabled={busy !== null} onClick={() => respond(invites[0], true)}><Check size={15}/> Accept</button></div>{invites.length > 1 && <span className="invite-count">+{invites.length - 1}</span>}</section>;
}

export default function WorkspacePeople({ repo, workspace, isOwner, onClose }: { repo: Repository; workspace: Workspace; isOwner: boolean; onClose: () => void }) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const [nextMembers, nextInvites] = await Promise.all([
      repo.listWorkspaceMembers(workspace.id),
      isOwner ? repo.listWorkspaceInvites(workspace.id) : Promise.resolve([]),
    ]);
    setMembers(nextMembers); setInvites(nextInvites);
  }, [repo, workspace.id, isOwner]);
  useEffect(() => { load().catch((cause: Error) => setError(cause.message)); }, [load]);
  const invite = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await repo.inviteToWorkspace(workspace.id, email); setEmail(''); await load(); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const removeMember = async (member: WorkspaceMember) => {
    if (!confirm(`Remove ${member.email} from this workspace?`)) return;
    await repo.removeWorkspaceMember(workspace.id, member.userId); await load();
  };
  return <div className="modal-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="people-modal" role="dialog" aria-modal="true" aria-labelledby="people-title"><header><div><span className="eyebrow">Workspace access</span><h2 id="people-title">People in {workspace.name}</h2></div><button className="icon-button" aria-label="Close people panel" onClick={onClose}><X/></button></header>{isOwner && <form className="invite-form" onSubmit={invite}><label htmlFor="invite-email">Invite by email</label><div><Mail size={18}/><input id="invite-email" required type="email" inputMode="email" autoComplete="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)}/><button className="primary" disabled={busy}>Send invite</button></div><small>They must log in with this email and accept the request before gaining access.</small></form>}{error && <div className="auth-error" role="alert">{error}</div>}<div className="people-section"><h3><Users size={17}/> Members <span>{members.length}</span></h3><div className="people-list">{members.map((member) => <div className="person-row" key={member.userId}><span className="person-avatar"><UserRound size={18}/></span><div><strong>{member.email}</strong><small>{member.role === 'owner' ? <><ShieldCheck size={13}/> Owner</> : 'Member'}</small></div>{isOwner && member.role !== 'owner' && <button className="icon-button danger" aria-label={`Remove ${member.email}`} onClick={() => removeMember(member)}><Trash2 size={17}/></button>}</div>)}</div></div>{isOwner && invites.length > 0 && <div className="people-section"><h3><Clock3 size={17}/> Pending <span>{invites.length}</span></h3><div className="people-list">{invites.map((invite) => <div className="person-row" key={invite.id}><span className="person-avatar pending"><Mail size={18}/></span><div><strong>{invite.email}</strong><small>Waiting for confirmation</small></div><button className="text-button danger" onClick={async () => { await repo.revokeInvite(invite.id); await load(); }}>Revoke</button></div>)}</div></div>}</section></div>;
}
