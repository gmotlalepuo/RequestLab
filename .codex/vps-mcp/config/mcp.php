<?php

return [
    'name' => env('MCP_SERVER_NAME', 'id-document-verifier'),
    'version' => env('MCP_SERVER_VERSION', '1.0.0'),
    'protocol_version' => env('MCP_PROTOCOL_VERSION', '2025-03-26'),
    'supabase_url' => rtrim((string) env('SUPABASE_URL', ''), '/'),
    'supabase_publishable_key' => env('SUPABASE_PUBLISHABLE_KEY', env('SUPABASE_ANON_KEY', '')),
    'timeout_seconds' => (int) env('MCP_UPSTREAM_TIMEOUT', 15),
    'secret_key_pattern' => env(
        'MCP_SECRET_KEY_PATTERN',
        '/(?:token|secret|password|api[_-]?key|authorization|cookie|credential)/i'
    ),
    'execution' => [
        'enabled' => filter_var(env('MCP_EXECUTION_ENABLED', false), FILTER_VALIDATE_BOOL),
        'confirmation_ttl_seconds' => (int) env('MCP_CONFIRMATION_TTL_SECONDS', 300),
        'audit_retention_days' => (int) env('MCP_AUDIT_RETENTION_DAYS', 90),
        'berzuda_url' => env('BERZUDA_EXECUTION_URL', ''),
        'signing_secret' => env('MCP_INTERNAL_SIGNING_SECRET', ''),
        'timeout_seconds' => (int) env('MCP_EXECUTION_TIMEOUT', 45),
    ],
    'conversation' => [
        'retention_days' => (int) env('MCP_CONVERSATION_RETENTION_DAYS', 30),
    ],
    'rollout' => [
        'issue_license' => [
            'workspace_id' => env('MCP_ISSUE_LICENSE_WORKSPACE_ID', 'c730595e-9010-4b04-a90c-69edca895ac2'),
            'collection_id' => env('MCP_ISSUE_LICENSE_COLLECTION_ID', '789a28c0-8094-4f7e-9d7c-ba6ba602caeb'),
            'environment_id' => env('MCP_ISSUE_LICENSE_ENVIRONMENT_ID', 'c951fa51-33d4-471a-b2bd-9749c96b2d27'),
            'lookup_request_id' => env('MCP_ISSUE_LICENSE_LOOKUP_REQUEST_ID', 'a9758cea-ef5b-4527-aa2b-3140f36f4524'),
            'update_request_id' => env('MCP_ISSUE_LICENSE_UPDATE_REQUEST_ID', '105b8b1a-cee9-4e95-81c7-0b9f879f2f60'),
            'workflow_version' => env('MCP_ISSUE_LICENSE_WORKFLOW_VERSION', '1.0.0'),
        ],
    ],
    'model' => [
        'runtime' => 'ollama',
        'base_url' => rtrim((string) env('OLLAMA_URL', 'http://127.0.0.1:11434'), '/'),
        'name' => env('OLLAMA_MODEL', 'qwen2.5:1.5b'),
        'timeout_seconds' => (int) env('OLLAMA_TIMEOUT', 120),
        'context_length' => (int) env('OLLAMA_CONTEXT_LENGTH', 8192),
        'keep_alive' => env('OLLAMA_KEEP_ALIVE', '10m'),
    ],
];
