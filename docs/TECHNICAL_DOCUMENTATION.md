# RequestLab Technical Documentation

## 1. Product overview

RequestLab is an authenticated API workbench for creating, organizing, executing, documenting, and sharing HTTP requests. It combines a Postman-style client with team workspaces, Supabase-backed persistence, request documentation, environment variables, response inspection, cURL generation, and Postman Collection v2.x import/export.

## 2. Architecture

- **Frontend:** Next.js App Router, React, TypeScript, Lucide icons, responsive CSS.
- **Authentication:** Supabase Auth with email/password confirmation, password recovery, protected server routes, and role-aware access.
- **Database:** Supabase Postgres with dedicated `postman_*` tables and Row Level Security (RLS).
- **Request execution:** Authenticated server-side `/api/proxy` route, avoiding browser CORS limitations.
- **Deployment:** Vercel-compatible Next.js deployment or Docker standalone deployment.
- **Data access:** Repository abstraction with Supabase and local-storage implementations.

## 3. Core data model

The application stores:

| Entity | Purpose |
|---|---|
| Workspaces | Organizational and access boundary for teams |
| Workspace members | Owner/member membership and collaboration access |
| Invites | Explicit email-based workspace invitations |
| Collections | Groups of related API requests |
| Folders | Nested organization inside collections |
| Requests | HTTP method, URL, parameters, headers, body, and auth configuration |
| Environments | Collection-scoped variables for reusable URLs, IDs, and credentials |
| Documentation | Rich endpoint-level guidance stored with each request |
| Complaints | User feedback and administrator responses |

## 4. Request lifecycle

1. A user selects or creates a workspace and collection.
2. A request is created at collection or folder level.
3. The user configures method, URL, parameters, headers, body, authentication, and environment variables.
4. The request is sent through the authenticated server proxy.
5. The response is displayed with status, timing, headers, formatted JSON, resizing, and copy controls.
6. Endpoint documentation is maintained in the Docs tab and saved independently per request.

## 5. Collaboration and permissions

- Workspace access is granted only to the owner or an accepted member.
- Invitations must match the invitee’s authenticated email address.
- Collection deletion is restricted to the collection creator, workspace owner, or administrator.
- RLS policies enforce access at the database boundary; UI hiding is only a usability layer.
- Folder hierarchy triggers prevent cycles, cross-collection parents, and invalid request-folder relationships.

## 6. Security controls

- Supabase sessions are verified on protected routes.
- Same-origin checks protect state-changing API requests.
- JSON payload size and field limits reduce abuse and accidental overload.
- Rate limits are applied to sensitive API routes.
- The outbound proxy validates URLs, blocks private/reserved destinations, restricts redirects, filters unsafe forwarding headers, and applies timeouts and response-size limits.
- Content Security Policy, frame restrictions, referrer policy, permissions policy, and MIME protections are configured at the edge.
- Service-role credentials remain server-side and are never exposed to the browser.

## 7. Environment configuration

Required public variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Server-only variables may include the Supabase service-role key, Stripe secrets, email provider keys, and cron secrets. These must be configured in the hosting provider and never committed to Git.

## 8. Local development

```bash
npm install
npm run dev
```

Run the SQL in `supabase/schema.sql` against the target Supabase project. For production validation:

```bash
npm run lint
npm run build
npm start
```

## 9. Deployment

For Vercel, configure all environment variables for the correct environment, set the Supabase Site URL to the deployed URL, and add the production authentication callback URL. For Docker, use the provided multi-stage Dockerfile and run as the unprivileged standalone server.

## 10. Operational recommendations

- Enable Supabase database backups and monitor authentication events.
- Rotate service-role, payment, email, and webhook secrets periodically.
- Add structured server logs and alerting for proxy failures and repeated abuse.
- Keep the schema migration script version-controlled and apply it through a controlled release process.
- Test RLS policies with owner, member, creator, and administrator accounts before major releases.
