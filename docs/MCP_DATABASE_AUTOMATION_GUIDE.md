# RequestLab Database and MCP Automation Guide

This document is the implementation contract for an MCP server that reads RequestLab data, resolves environments, runs endpoints, and completes multi-step API tasks from natural-language instructions.

## 1. System contract

RequestLab is a multi-tenant API workbench. The tenant boundary is the workspace. A user may access a workspace only when they are its owner or have an accepted row in `postman_workspace_members`. Collections, folders, environments, and requests inherit access from that workspace.

The MCP server must never bypass this boundary. Every tool call must execute as the authenticated user, or as a server-side service that has explicitly resolved and recorded the user’s workspace access.

## 2. Database tables

### `postman_workspaces`

Represents the top-level organization boundary.

- `id`: UUID primary key.
- `user_id`: workspace owner’s Supabase Auth UUID.
- `name`: display name.
- `created_at`: creation timestamp.

### `postman_workspace_members`

Represents accepted workspace collaborators.

- `workspace_id`: workspace relationship.
- `user_id`: authenticated user relationship.
- `email`: member email used for display and invitation matching.
- `role`: `owner` or `member`.
- `joined_at`: membership timestamp.

### `postman_workspace_invites`

Represents pending, accepted, or declined invitations.

- `workspace_id`, `workspace_name`: target workspace.
- `email`: invited email.
- `invited_by`: inviter’s Auth UUID.
- `status`: `pending`, `accepted`, or `declined`.
- `responded_at`: response timestamp.

### `postman_collections`

Groups related endpoints.

- `id`: UUID primary key.
- `workspace_id`: owning workspace.
- `created_by`: creator’s Auth UUID; immutable after creation.
- `name`: collection name.
- `description`: collection-level rich documentation.
- `created_at`: creation timestamp.

Collection deletion is allowed only for the creator, workspace owner, or administrator. Collection documentation is unique because it is stored on this collection row.

### `postman_folders`

Organizes endpoints hierarchically inside a collection.

- `id`: UUID primary key.
- `collection_id`: owning collection.
- `parent_folder_id`: nullable parent folder for nested folders.
- `name`: folder name.
- `description`: folder documentation.
- `is_starred`: whether the folder is pinned to the top of its level.
- `sort_order`: intended sibling ordering value.

Database triggers reject self-parenting, cross-collection parents, and folder cycles.

### `postman_requests`

Stores an executable API endpoint.

- `id`: UUID primary key.
- `collection_id`: owning collection.
- `folder_id`: nullable folder; `null` means collection root.
- `name`: endpoint display name.
- `documentation`: endpoint-specific rich documentation.
- `sort_order`: intended sibling ordering value.
- `method`: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`.
- `url`: URL template, potentially containing `{{variable}}` placeholders.
- `params`: JSON array of `{ id, key, value, enabled }` rows.
- `headers`: JSON array of `{ id, key, value, enabled }` rows.
- `body_mode`: `none`, `json`, `raw`, or `form`.
- `body_raw`: raw body text.
- `body_form`: form rows using the same key/value shape.
- `auth`: `{ type: "none" | "bearer" | "basic", ... }`.
- `created_at`: creation timestamp.

The request-folder trigger ensures that a request cannot point to a folder in another collection.

### `postman_environments`

Stores collection-scoped variables.

- `id`: UUID primary key.
- `workspace_id`: owning workspace.
- `collection_id`: collection scope.
- `name`: environment name, such as `User Acceptance Testing`.
- `variables`: JSON array of `{ id, key, value, enabled }`.
- `created_at`: creation timestamp.

Variables are resolved at execution time. The stored request remains templated.

## 3. Variable resolution

The supported syntax is:

```text
{{variable_name}}
```

Resolution should:

1. Load the selected collection environment.
2. Keep only variables where `enabled = true` and `key` is non-empty.
3. Replace placeholders in URL, query parameter keys and values, headers, raw body, form fields, and authentication values.
4. Leave an unresolved placeholder unchanged and report it to the user or MCP caller.
5. Never log secret variable values.

Example:

```json
{
  "name": "User Acceptance Testing",
  "variables": [
    { "key": "teacher_reg_backend_base_url", "value": "https://uat.example.com", "enabled": true },
    { "key": "national_id", "value": "436415528", "enabled": true }
  ]
}
```

Request URL:

```text
{{teacher_reg_backend_base_url}}/teacher_registrations/{{national_id}}
```

Resolved URL:

```text
https://uat.example.com/teacher_registrations/436415528
```

## 4. Executing an endpoint

The MCP server should use the authenticated RequestLab proxy rather than calling arbitrary URLs directly from the model process. The proxy:

- Validates the request shape.
- Resolves supplied environment variables.
- Blocks unsafe/private outbound destinations.
- Restricts redirects and forwarding headers.
- Applies a timeout and response-size limit.
- Returns status, status text, headers, timing, size, and body.

The conceptual execution payload is:

```json
{
  "request": { "id": "request-uuid" },
  "environmentId": "environment-uuid"
}
```

The MCP server should fetch the complete request and environment first, then send the validated request to the authenticated proxy route.

## 5. Recommended MCP tools

### Discovery tools

```text
list_workspaces()
list_collections(workspace_id)
list_folders(collection_id, parent_folder_id?)
list_requests(collection_id, folder_id?)
list_environments(collection_id)
get_workspace_members(workspace_id)
```

### Read tools

```text
get_collection(collection_id)
get_folder(folder_id)
get_request(request_id)
get_environment(environment_id)
resolve_request(request_id, environment_id)
```

`resolve_request` should return the resolved URL, enabled headers, resolved parameters, resolved body, and a redacted preview. It should not expose secret values unless the user has explicitly authorized execution and the value is required.

### Execution tools

```text
run_request(request_id, environment_id?, confirm_mode)
run_sequence(steps[], environment_id?, confirm_mode)
```

`run_sequence` should return each step’s request ID, status, duration, response body or redacted body, and extracted values.

### Mutation tools

```text
create_request(collection_id, folder_id?, request)
update_request(request_id, patch)
delete_request(request_id)
create_folder(collection_id, parent_folder_id?, name)
move_request(request_id, folder_id?, sort_order)
move_folder(folder_id, parent_folder_id?, sort_order)
create_environment(collection_id, name, variables)
update_environment(environment_id, patch)
delete_environment(environment_id)
update_documentation(scope, id, rich_text)
```

Mutations should default to dry-run previews for destructive or broad changes.

## 6. Natural-language task execution

A safe MCP planner should transform a request such as:

> “Find the teacher by national ID 436415528 in UAT and tell me their registration status.”

into:

1. Identify the active workspace.
2. Find the `UAT` or `User Acceptance Testing` environment.
3. Search collections and documentation for a matching teacher-registration endpoint.
4. Resolve `{{teacher_reg_backend_base_url}}` and `{{national_id}}`.
5. Show the planned endpoint and resolved non-secret parameters.
6. Execute the request after the required confirmation policy is satisfied.
7. Parse the response and return only the requested registration status.

For a multi-step task:

1. Discover candidate endpoints.
2. Build a plan with explicit dependencies.
3. Identify values extracted from earlier responses.
4. Show the plan, endpoints, environment, and intended side effects.
5. Execute read-only steps.
6. Require confirmation before writes, deletes, state transitions, or requests with sensitive side effects.
7. Return a concise result with request IDs and evidence.

## 7. Confirmation and autonomy policy

“Without user input” should mean the server can execute an already-approved, narrowly scoped workflow—not that the model can silently perform arbitrary actions.

Recommended modes:

- `plan_only`: inspect and explain; never execute.
- `read_only_auto`: automatically run safe GET/HEAD/OPTIONS requests within the user’s authorized workspace.
- `confirm_writes`: require confirmation for POST, PUT, PATCH, DELETE, or any request classified as state-changing.
- `scheduled_job`: run a pre-approved named workflow with an allowlisted set of request IDs and environment IDs.

Every execution should record the authenticated user, workspace, request ID, environment ID, timestamp, resolved host, method, status, and a redacted result. Never store bearer tokens, passwords, API keys, or full sensitive response bodies in logs.

## 8. Endpoint discovery from documentation

Documentation should be treated as hints, not executable authority. The MCP server can use collection, folder, and endpoint documentation to rank candidate endpoints, but it must validate the actual stored method, URL, headers, body, and environment before execution.

Useful documentation fields for endpoint discovery:

- Purpose and business action.
- Required parameters and accepted values.
- Required headers and authentication.
- Example request and response.
- Side-effect classification: read, create, update, delete.
- Expected status codes.
- Extraction instructions, such as `teacher_registrations[0].reg_status`.

## 9. Error handling

The MCP layer should return structured errors:

```json
{
  "code": "UNRESOLVED_VARIABLE",
  "message": "The request needs national_id.",
  "request_id": "request-uuid",
  "environment_id": "environment-uuid",
  "missing_variables": ["national_id"]
}
```

Recommended codes include `AUTH_REQUIRED`, `WORKSPACE_ACCESS_DENIED`, `RESOURCE_NOT_FOUND`, `UNRESOLVED_VARIABLE`, `UNSAFE_URL`, `REQUEST_TIMEOUT`, `UPSTREAM_ERROR`, `RESPONSE_TOO_LARGE`, and `CONFIRMATION_REQUIRED`.

## 10. Implementation checklist

- Authenticate every MCP request.
- Resolve the active workspace explicitly; never guess across tenants.
- Use repository methods or tightly scoped Supabase queries.
- Respect RLS and never expose the service-role key to the model or browser.
- Resolve environments at execution time.
- Redact secrets in previews, logs, traces, and model context.
- Validate endpoint IDs, environment IDs, and collection relationships.
- Add idempotency keys for automated writes.
- Use allowlists for scheduled workflows.
- Require confirmation for side effects.
- Return structured evidence after execution.
- Add audit logging before enabling broad autonomous operation.

