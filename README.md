# RequestLab

A responsive, authenticated API workspace built with Next.js and Supabase. Create private or shared workspaces, invite teammates with confirmation, organize collections and nested folders, build HTTP requests, inspect responses, and import or export Postman Collection v2.x JSON.

## Local setup

Requirements: Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, npm 12, and a Supabase project.

1. Copy `.env.example` to `.env.local`.
2. Add the project URL and publishable key from Supabase's Connect panel.
3. Run `supabase/schema.sql` in the Supabase SQL editor. This creates the isolated `postman_workspaces`, `postman_collections`, `postman_folders`, and `postman_requests` tables with owner-based row-level security.
4. In Supabase Authentication → URL Configuration, set the Site URL to your deployment URL and add `http://localhost:3000/auth/callback` as a development redirect URL.
5. Install and start the app:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Production

```bash
npm run build
npm start
```

The Next.js server includes `/api/proxy`, which executes outbound HTTP requests server-side so the API client is not restricted by browser CORS policies. The route requires a verified Supabase session.

## Docker

Put the two Supabase values in `.env`, then run:

```bash
docker compose up --build
```

The app is exposed at http://localhost:3000. The multi-stage image uses Next.js standalone output and runs as an unprivileged user.

## Authentication and data isolation

Email/password signup, login, email confirmation, password recovery, and logout use Supabase Auth. Protected routes verify the current user on the server. Database policies scope workspaces to `auth.uid()` and inherit that ownership across collections, folders, and requests.

Workspace owners can invite an email address from the people panel. The invitee must log in using that exact address and explicitly accept the pending request before membership and workspace access are granted. Owners can revoke pending invitations or remove existing members.

Existing unprefixed tables are not modified or queried. If upgrading an earlier prefixed schema, assign or delete workspaces whose `user_id` is null, then run the final `NOT NULL` statement documented at the bottom of `supabase/schema.sql`.
