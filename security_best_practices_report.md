# RequestLab Security Best-Practices Audit

Audit date: 2026-07-20  
Scope: Next.js application routes, Supabase authentication/RLS, admin operations, dependency state, environment handling, and deployed HTTP headers.  
Method: read-only source review, Graphify trust-boundary mapping, TypeScript/build validation, `npm audit`, and header inspection against the deployed Vercel application.

## Executive summary

> Remediation update (2026-07-20): SEC-001, SEC-002, SEC-005, SEC-006, SEC-007, SEC-008, and the principal validation/error-handling portions of SEC-009/SEC-010 have been addressed. SEC-004 now has an application-level limiter, but multi-instance production should add a shared edge/data-store limiter. SEC-003 requires the project owner to rotate previously disclosed credentials in Supabase, Stripe, Vercel, and any other affected provider; source code cannot safely perform that rotation.

RequestLab has a sound authentication baseline: protected routes call Supabase `getUser()`, administrator checks are performed server-side against `app_metadata`, RLS is enabled across application tables, security-definer functions pin an empty search path, and local environment files are ignored and not tracked by Git. TypeScript and the production build pass.

The most urgent risk is the API proxy. Any authenticated user can make the Vercel server fetch arbitrary HTTP(S) destinations, including redirect targets, without private-network or metadata-address filtering. This is an SSRF capability and should be treated as a release-blocking issue before the application is exposed to untrusted accounts. The same route has no strict input, body, response-size, or rate controls, increasing denial-of-service and cost-abuse risk.

No remediation was implemented during this audit.

## Critical findings

### SEC-001 — Unrestricted authenticated SSRF in the request proxy

**Evidence:** `app/api/proxy/route.ts:45-46`, `app/api/proxy/route.ts:69`  
**Impact:** An authenticated user can direct the server to loopback, RFC1918/private networks, link-local/cloud metadata endpoints, internal services, and redirect chains. Returned response bodies and headers are relayed to that user. This can expose infrastructure credentials or internal services and can turn the deployment into a network pivot.

**Recommendation:** Introduce a dedicated outbound-request policy before every network hop: parse with `URL`, allow only approved schemes and ports, resolve DNS, reject loopback/private/link-local/multicast/reserved IPv4 and IPv6 ranges, revalidate every redirect instead of using unrestricted `redirect: "follow"`, and protect against DNS rebinding. Decide explicitly whether public arbitrary-host access is a product requirement; if it is, isolate the runner in an egress-restricted service rather than the main web application.

## High findings

### SEC-002 — Proxy input and response resources are effectively unbounded

**Evidence:** `app/api/proxy/route.ts:45`, `app/api/proxy/route.ts:47-64`, `app/api/proxy/route.ts:70-79`  
**Impact:** The route trusts a TypeScript cast at runtime, accepts arbitrary array counts/string sizes/method values/header sets, and buffers the complete upstream body with `response.text()`. A logged-in user can consume memory, bandwidth, serverless duration, and logging capacity. The 30-second timeout does not cap bytes or concurrency.

**Recommendation:** Validate the complete payload with a runtime schema; allowlist HTTP methods; cap URL/header/body/environment-row sizes; reject dangerous or hop-by-hop headers; enforce request content type and request-body limits; stream or incrementally read responses with a hard byte ceiling; abort once exceeded; and cap concurrent requests per user/workspace.

### SEC-003 — Previously disclosed production-capable secrets should be rotated

**Evidence:** Secrets were shared outside the repository during project setup. `.gitignore:40-42` correctly excludes local environment files, and `git ls-files` found no tracked environment file.  
**Impact:** A Supabase service-role key bypasses RLS, and payment/email provider secrets can authorize privileged actions. Any secret disclosed in chat, screenshots, logs, or copied terminal history must be considered exposed even when it was never committed.

**Recommendation:** Rotate the Supabase service-role key and any other disclosed server secret in their provider dashboards; update Vercel environment variables; invalidate old values; inspect provider audit logs; and keep only publishable/anon identifiers in client-visible variables. Never place service-role or payment secret values in screenshots, tickets, or client bundles.

## Medium findings

### SEC-004 — No application-level rate limiting or abuse quotas

**Evidence:** `app/api/proxy/route.ts:36-82`, `app/api/complaints/route.ts:22-39`, `app/api/admin/users/route.ts:20-79`  
**Impact:** Authenticated accounts can repeatedly invoke outbound requests or create complaints. A compromised administrator session can also generate high-volume privileged operations. This increases cost, spam, and availability risk.

**Recommendation:** Apply per-user, per-workspace, per-IP, and global limits appropriate to each endpoint, with stricter proxy concurrency/byte quotas. Return `429` with retry metadata, record security-relevant events, and alert on sustained proxy failures or unusual destinations.

### SEC-005 — Missing browser security headers on the deployed application

**Evidence:** `next.config.ts:3-6`; a 2026-07-20 HEAD request to the deployed Vercel URL returned HSTS but no CSP, `X-Content-Type-Options`, frame protection, referrer policy, permissions policy, COOP, or CORP.  
**Impact:** The application lacks defense-in-depth against clickjacking, MIME confusion, injected script execution, referrer leakage, and unnecessary browser capabilities. The constant inline theme script in `app/layout.tsx:10` complicates a strict CSP.

**Recommendation:** Define security headers centrally. Start with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, restrictive `default-src`, `X-Content-Type-Options: nosniff`, a conservative `Referrer-Policy`, and a minimal `Permissions-Policy`. Move the bootstrap script to a nonce/hash-compatible strategy and roll CSP out in report-only mode before enforcement.

### SEC-006 — Cross-table hierarchy integrity is not enforced

**Evidence:** `supabase/schema.sql:53-76`, `supabase/schema.sql:266-277`  
**Impact:** `parent_folder_id` is not constrained to the same collection, and a request's `folder_id` is not constrained to its `collection_id`. RLS checks only the row's collection. If a foreign UUID becomes known, an authorized user may create inconsistent cross-workspace relationships and surprising cascade effects.

**Recommendation:** Add composite uniqueness/foreign-key constraints or guarded database triggers so folder parents and request folders must share the same collection. Reject self-parenting and descendant cycles. Add migration-time checks for existing inconsistent rows.

### SEC-007 — Dependency audit reports a moderate PostCSS XSS advisory

**Evidence:** `package.json:19`; `npm audit` reported two moderate entries (`next` via bundled `postcss`, GHSA-qx2v-qp2m-jg93).  
**Impact:** A vulnerable CSS stringify path can emit an unescaped closing style tag when attacker-controlled CSS reaches it. Direct exploitability in this application was not established, but the vulnerable transitive version is present.

**Recommendation:** Track the upstream Next.js resolution and upgrade to the first compatible release containing a fixed PostCSS. Do not accept the audit tool's suggested downgrade blindly. Re-run the production build and browser suite after upgrading; document risk acceptance if no safe compatible release is available.

### SEC-008 — Privileged mutations lack explicit same-origin/CSRF validation

**Evidence:** `app/api/admin/users/route.ts:20-79`, `app/api/complaints/route.ts:22-53`  
**Impact:** Supabase cookie settings and JSON requests provide partial protection, but privileged handlers do not explicitly validate `Origin`/`Sec-Fetch-Site` or require an anti-CSRF signal. Future changes to cookie or content-type handling could silently weaken the boundary.

**Recommendation:** Enforce same-origin checks on all state-changing application routes, reject unexpected content types, and use a CSRF token or signed custom header where appropriate. Preserve secure, HTTP-only, SameSite cookie settings and add automated negative tests.

## Low findings

### SEC-009 — Validation is handwritten and incomplete across management routes

**Evidence:** `app/api/admin/users/route.ts:23-29`, `app/api/admin/users/route.ts:48-65`, `app/api/complaints/route.ts:25-29`, `app/api/complaints/route.ts:45-51`  
**Impact:** Email syntax, UUIDs, maximum lengths, object shape, unknown fields, complaint size, and response size are not consistently constrained. This mainly creates robustness, storage-abuse, and maintenance risks.

**Recommendation:** Use shared runtime schemas with strict objects, UUID/email validation, normalized enums, and explicit maximum lengths. Return stable problem details without forwarding provider internals.

### SEC-010 — Some provider/upstream error details are returned directly

**Evidence:** `app/api/proxy/route.ts:80-81`, `app/api/admin/users/route.ts:13`, `app/api/admin/users/route.ts:41`, `app/api/complaints/route.ts:18`  
**Impact:** Authenticated users or administrators may receive internal network/provider wording useful for reconnaissance, while inconsistent errors complicate observability.

**Recommendation:** Map internal failures to stable public error codes/messages, attach a correlation ID, and retain detailed causes only in access-controlled server logs with sensitive values redacted.

## Positive controls observed

- Protected pages and APIs use server-side Supabase `getUser()` validation (`lib/supabase/proxy.ts:22-29`).
- Administrator authorization is enforced server-side from `app_metadata` (`lib/auth/admin.ts:4-11`).
- Self-demotion, self-suspension, and self-deletion are blocked (`app/api/admin/users/route.ts:51-52`, `app/api/admin/users/route.ts:76`).
- RLS is enabled for all core and complaints tables (`supabase/schema.sql:182-188`, `supabase/schema.sql:297`).
- Security-definer functions use `set search_path = ''` (`supabase/schema.sql:89-113`, `supabase/schema.sql:152-155`).
- The authentication callback restricts `next` to a single-slash internal path (`app/auth/callback/route.ts:7-15`).
- Environment files are ignored and none were found tracked by Git (`.gitignore:40-42`).
- No user-derived `dangerouslySetInnerHTML` flow was found; the sole use is a constant theme bootstrap script (`app/layout.tsx:10`).
- Production TypeScript and Next.js builds pass.

## Recommended remediation order

1. Contain SSRF and rotate disclosed secrets before onboarding untrusted users.
2. Add proxy byte/concurrency/input limits and rate limiting.
3. Enforce hierarchy integrity and add security headers/CSP rollout.
4. Add strict schemas, same-origin mutation checks, and sanitized error contracts.
5. Upgrade the vulnerable dependency when a compatible fix is available.
