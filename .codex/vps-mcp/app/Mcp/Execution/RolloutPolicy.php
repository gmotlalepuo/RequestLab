<?php

namespace App\Mcp\Execution;

use App\Mcp\Exceptions\McpException;

class RolloutPolicy
{
    public function assertIssueLicense(array $resources): void
    {
        $expected = config('mcp.rollout.issue_license', []);
        foreach (['workspace_id', 'collection_id', 'environment_id', 'lookup_request_id', 'update_request_id', 'workflow_version'] as $field) {
            $configured = $expected[$field] ?? null;
            if (!is_string($configured) || $configured === '' || !hash_equals($configured, (string) ($resources[$field] ?? ''))) {
                throw new McpException(
                    'ROLLOUT_NOT_ALLOWED',
                    'This workflow is not allowlisted for the selected RequestLab context.',
                    httpStatus: 403,
                );
            }
        }
    }
}
