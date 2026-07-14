-- RequestLab schema with authentication, workspace sharing, and RLS.
-- Run the complete script in the Supabase SQL editor.

create table if not exists postman_workspaces (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table postman_workspaces add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table postman_workspaces alter column user_id set default auth.uid();

create table if not exists postman_workspace_members (
  workspace_id uuid not null references postman_workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists postman_workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references postman_workspaces (id) on delete cascade,
  workspace_name text not null default '',
  email text not null,
  invited_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (workspace_id, email)
);
alter table postman_workspace_invites add column if not exists workspace_name text not null default '';

create table if not exists postman_collections (
  id uuid primary key,
  workspace_id uuid not null references postman_workspaces (id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists postman_environments (
  id uuid primary key,
  workspace_id uuid not null references postman_workspaces (id) on delete cascade,
  collection_id uuid references postman_collections (id) on delete cascade,
  name text not null,
  variables jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table postman_environments add column if not exists collection_id uuid references postman_collections (id) on delete cascade;

create table if not exists postman_folders (
  id uuid primary key,
  collection_id uuid not null references postman_collections (id) on delete cascade,
  parent_folder_id uuid references postman_folders (id) on delete cascade,
  name text not null,
  is_starred boolean not null default false,
  created_at timestamptz not null default now()
);
alter table postman_folders add column if not exists is_starred boolean not null default false;

create table if not exists postman_requests (
  id uuid primary key,
  collection_id uuid not null references postman_collections (id) on delete cascade,
  folder_id uuid references postman_folders (id) on delete cascade,
  name text not null,
  method text not null default 'GET',
  url text not null default '',
  params jsonb not null default '[]'::jsonb,
  headers jsonb not null default '[]'::jsonb,
  body_mode text not null default 'none',
  body_raw text not null default '',
  body_form jsonb not null default '[]'::jsonb,
  auth jsonb not null default '{"type":"none"}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists postman_workspaces_user_id_idx on postman_workspaces (user_id);
create index if not exists postman_members_user_id_idx on postman_workspace_members (user_id);
create index if not exists postman_invites_email_status_idx on postman_workspace_invites (lower(email), status);
create index if not exists postman_collections_workspace_id_idx on postman_collections (workspace_id);
create index if not exists postman_environments_workspace_id_idx on postman_environments (workspace_id);
create index if not exists postman_environments_collection_id_idx on postman_environments (collection_id);
create index if not exists postman_folders_collection_id_idx on postman_folders (collection_id);
create index if not exists postman_requests_collection_id_idx on postman_requests (collection_id);

-- Membership helpers bypass membership-table RLS without exposing its rows.
create or replace function public.postman_has_workspace_access(target_workspace_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.postman_workspace_members
    where workspace_id = target_workspace_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.postman_is_workspace_owner(target_workspace_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.postman_workspace_members
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

-- Every new workspace automatically receives its owner membership.
create or replace function public.postman_add_workspace_owner()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.postman_workspace_members (workspace_id, user_id, email, role)
  select new.id, new.user_id, coalesce(u.email, ''), 'owner'
  from auth.users u where u.id = new.user_id
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists postman_workspace_owner_trigger on postman_workspaces;
create trigger postman_workspace_owner_trigger
after insert on postman_workspaces
for each row execute function public.postman_add_workspace_owner();

create or replace function public.postman_set_invite_workspace_name()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  select name into new.workspace_name from public.postman_workspaces where id = new.workspace_id;
  return new;
end;
$$;
drop trigger if exists postman_invite_workspace_name_trigger on postman_workspace_invites;
create trigger postman_invite_workspace_name_trigger
before insert or update of workspace_id on postman_workspace_invites
for each row execute function public.postman_set_invite_workspace_name();
update postman_workspace_invites i set workspace_name = w.name
from postman_workspaces w where w.id = i.workspace_id and i.workspace_name = '';

-- Backfill owner memberships when upgrading an existing installation.
insert into postman_workspace_members (workspace_id, user_id, email, role)
select w.id, w.user_id, coalesce(u.email, ''), 'owner'
from postman_workspaces w join auth.users u on u.id = w.user_id
where w.user_id is not null
on conflict (workspace_id, user_id) do nothing;

-- Invite responses can only target a pending invite matching the caller's JWT email.
create or replace function public.postman_respond_to_invite(invite_id uuid, accept_invite boolean)
returns void language plpgsql security definer
set search_path = ''
as $$
declare selected_invite public.postman_workspace_invites%rowtype;
declare caller_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into selected_invite from public.postman_workspace_invites
  where id = invite_id and status = 'pending' and lower(email) = caller_email
  for update;
  if not found then raise exception 'Invitation not found or no longer available'; end if;
  if accept_invite then
    insert into public.postman_workspace_members (workspace_id, user_id, email, role)
    values (selected_invite.workspace_id, (select auth.uid()), caller_email, 'member')
    on conflict (workspace_id, user_id) do nothing;
    update public.postman_workspace_invites set status = 'accepted', responded_at = now()
    where id = invite_id;
  else
    update public.postman_workspace_invites set status = 'declined', responded_at = now()
    where id = invite_id;
  end if;
end;
$$;

revoke all on function public.postman_respond_to_invite(uuid, boolean) from public;
grant execute on function public.postman_respond_to_invite(uuid, boolean) to authenticated;
grant execute on function public.postman_has_workspace_access(uuid) to authenticated;
grant execute on function public.postman_is_workspace_owner(uuid) to authenticated;

alter table postman_workspaces enable row level security;
alter table postman_workspace_members enable row level security;
alter table postman_workspace_invites enable row level security;
alter table postman_collections enable row level security;
alter table postman_environments enable row level security;
alter table postman_folders enable row level security;
alter table postman_requests enable row level security;

-- Remove prototype and earlier owner-only policies.
drop policy if exists "anon full access" on postman_workspaces;
drop policy if exists "anon full access" on postman_collections;
drop policy if exists "anon full access" on postman_folders;
drop policy if exists "anon full access" on postman_requests;
drop policy if exists "owners manage workspaces" on postman_workspaces;
drop policy if exists "owners manage collections" on postman_collections;
drop policy if exists "owners manage folders" on postman_folders;
drop policy if exists "owners manage requests" on postman_requests;
drop policy if exists "members view workspaces" on postman_workspaces;
drop policy if exists "owners create workspaces" on postman_workspaces;
drop policy if exists "owners update workspaces" on postman_workspaces;
drop policy if exists "owners delete workspaces" on postman_workspaces;
drop policy if exists "members view memberships" on postman_workspace_members;
drop policy if exists "owners remove memberships" on postman_workspace_members;
drop policy if exists "invite participants view invites" on postman_workspace_invites;
drop policy if exists "owners create invites" on postman_workspace_invites;
drop policy if exists "owners revoke invites" on postman_workspace_invites;
drop policy if exists "owners update invites" on postman_workspace_invites;
drop policy if exists "members manage collections" on postman_collections;
drop policy if exists "members manage environments" on postman_environments;
drop policy if exists "members manage folders" on postman_folders;
drop policy if exists "members manage requests" on postman_requests;

create policy "members view workspaces" on postman_workspaces
for select to authenticated using ((select public.postman_has_workspace_access(id)));
create policy "owners create workspaces" on postman_workspaces
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owners update workspaces" on postman_workspaces
for update to authenticated using ((select public.postman_is_workspace_owner(id)))
with check ((select auth.uid()) = user_id);
create policy "owners delete workspaces" on postman_workspaces
for delete to authenticated using ((select public.postman_is_workspace_owner(id)));

create policy "members view memberships" on postman_workspace_members
for select to authenticated using ((select public.postman_has_workspace_access(workspace_id)));
create policy "owners remove memberships" on postman_workspace_members
for delete to authenticated using (
  role <> 'owner' and (select public.postman_is_workspace_owner(workspace_id))
);

create policy "invite participants view invites" on postman_workspace_invites
for select to authenticated using (
  (select public.postman_is_workspace_owner(workspace_id))
  or (status = 'pending' and lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), '')))
);
create policy "owners create invites" on postman_workspace_invites
for insert to authenticated with check (
  (select public.postman_is_workspace_owner(workspace_id))
  and invited_by = (select auth.uid()) and status = 'pending'
);
create policy "owners revoke invites" on postman_workspace_invites
for delete to authenticated using ((select public.postman_is_workspace_owner(workspace_id)));
create policy "owners update invites" on postman_workspace_invites
for update to authenticated using ((select public.postman_is_workspace_owner(workspace_id)))
with check ((select public.postman_is_workspace_owner(workspace_id)));

create policy "members manage collections" on postman_collections
for all to authenticated using ((select public.postman_has_workspace_access(workspace_id)))
with check ((select public.postman_has_workspace_access(workspace_id)));
create policy "members manage environments" on postman_environments
for all to authenticated using (
  (select public.postman_has_workspace_access(workspace_id))
  and exists (
    select 1 from postman_collections c
    where c.id = postman_environments.collection_id
      and c.workspace_id = postman_environments.workspace_id
  )
) with check (
  (select public.postman_has_workspace_access(workspace_id))
  and exists (
    select 1 from postman_collections c
    where c.id = postman_environments.collection_id
      and c.workspace_id = postman_environments.workspace_id
  )
);
create policy "members manage folders" on postman_folders
for all to authenticated using (collection_id in (
  select id from postman_collections where (select public.postman_has_workspace_access(workspace_id))
)) with check (collection_id in (
  select id from postman_collections where (select public.postman_has_workspace_access(workspace_id))
));
create policy "members manage requests" on postman_requests
for all to authenticated using (collection_id in (
  select id from postman_collections where (select public.postman_has_workspace_access(workspace_id))
)) with check (collection_id in (
  select id from postman_collections where (select public.postman_has_workspace_access(workspace_id))
));

-- For an upgraded database, resolve null legacy owners before enabling this:
-- alter table postman_workspaces alter column user_id set not null;
