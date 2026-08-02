<?php

namespace App\Mcp\Tools;

class ToolDefinitionCatalog
{
    public function definitions(): array
    {
        $tools = [
            $this->tool('list_workspaces', 'List RequestLab workspaces accessible to the authenticated user.'),
            $this->tool('list_collections', 'List collections in an accessible workspace.', ['workspace_id' => $this->uuid('Workspace UUID.')], ['workspace_id']),
            $this->tool('list_folders', 'List folders at one level of a collection.', [
                'collection_id' => $this->uuid('Collection UUID.'),
                'parent_folder_id' => $this->nullableUuid('Parent folder UUID; omit for collection root.'),
            ], ['collection_id']),
            $this->tool('list_requests', 'List requests at one level of a collection.', [
                'collection_id' => $this->uuid('Collection UUID.'),
                'folder_id' => $this->nullableUuid('Folder UUID; omit for collection root.'),
            ], ['collection_id']),
            $this->tool('list_environments', 'List environments available to a collection.', ['collection_id' => $this->uuid('Collection UUID.')], ['collection_id']),
            $this->tool('get_workspace_members', 'List accepted members of an accessible workspace.', ['workspace_id' => $this->uuid('Workspace UUID.')], ['workspace_id']),
            $this->tool('get_collection', 'Get collection metadata and documentation.', ['collection_id' => $this->uuid('Collection UUID.')], ['collection_id']),
            $this->tool('get_folder', 'Get folder metadata and documentation.', ['folder_id' => $this->uuid('Folder UUID.')], ['folder_id']),
            $this->tool('get_request', 'Get a stored request definition. Authentication values are redacted.', ['request_id' => $this->uuid('Request UUID.')], ['request_id']),
            $this->tool('get_environment', 'Get an environment with secret variable values redacted.', ['environment_id' => $this->uuid('Environment UUID.')], ['environment_id']),
            $this->tool('resolve_request', 'Resolve a stored request against an environment and return a redacted preview. This does not execute it.', [
                'request_id' => $this->uuid('Request UUID.'),
                'environment_id' => $this->uuid('Environment UUID from the same collection.'),
            ], ['request_id', 'environment_id']),
            $this->tool('knowledge_status', 'Report loaded database, endpoint-profile, and workflow knowledge.'),
            $this->tool('get_database_dictionary', 'Describe the responsibility and relationships of RequestLab tables.'),
            $this->tool('list_endpoint_knowledge', 'List reviewed semantic endpoints, required inputs, extraction rules, and binding status.'),
            $this->tool('get_endpoint_knowledge', 'Get one reviewed semantic endpoint definition.', [
                'semantic_ref' => ['type' => 'string', 'pattern' => '^[a-z][a-z0-9_]*$', 'maxLength' => 120],
            ], ['semantic_ref']),
            $this->tool('list_workflows', 'List versioned, reviewed natural-language automation workflows.'),
            $this->tool('get_workflow', 'Get one reviewed workflow including inputs, dependencies, extractions, and confirmation requirements.', [
                'name' => ['type' => 'string', 'pattern' => '^[a-z][a-z0-9_]*$', 'maxLength' => 120],
            ], ['name']),
            $this->tool('search_endpoint_candidates', 'Rank authorized stored requests using names and documentation. Results are hints and are not executable authority.', [
                'workspace_id' => $this->uuid('Active workspace UUID.'),
                'query' => ['type' => 'string', 'minLength' => 2, 'maxLength' => 500],
                'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 20],
            ], ['workspace_id', 'query']),
        ];
        if (app()->bound('config') && config('mcp.execution.enabled')) {
            $tools[] = $this->tool('prepare_issue_license', 'Run the reviewed UAT lookup and prepare an exact write confirmation. This never performs the write.', [
                'workspace_id' => $this->uuid('Active workspace UUID.'),
                'collection_id' => $this->uuid('Reviewed UAT collection UUID.'),
                'environment_id' => $this->uuid('Selected UAT environment UUID.'),
                'national_id' => ['type' => 'string', 'pattern' => '^[A-Za-z0-9-]{5,40}$', 'maxLength' => 40],
            ], ['workspace_id', 'collection_id', 'environment_id', 'national_id']);
            $tools[] = $this->tool('prepare_issue_payment', 'Resolve a reviewed service payment endpoint and prepare an exact Manager-Approved write confirmation. This never performs the write.', [
                'workspace_id' => $this->uuid('Active workspace UUID.'),
                'collection_id' => $this->nullableUuid('Preferred active collection UUID; service-folder discovery may select another authorized collection.'),
                'environment_id' => $this->nullableUuid('Preferred active environment UUID.'),
                'national_id' => ['type' => 'string', 'pattern' => '^[A-Za-z0-9-]{5,40}$', 'maxLength' => 40],
                'service' => ['type' => 'string', 'enum' => ['teacher_registration', 'license_renewal']],
                'target_environment' => ['type' => 'string', 'enum' => ['uat', 'production']],
            ], ['workspace_id', 'national_id', 'service', 'target_environment']);
        }
        return $tools;
    }

    public function modelToolNames(): array
    {
        return array_column($this->definitions(), 'name');
    }

    private function tool(string $name, string $description, array $properties = [], array $required = []): array
    {
        $schema = ['type' => 'object', 'properties' => (object) $properties, 'additionalProperties' => false];
        if ($required) {
            $schema['required'] = $required;
        }
        return ['name' => $name, 'description' => $description, 'inputSchema' => $schema];
    }

    private function uuid(string $description): array
    {
        return ['type' => 'string', 'format' => 'uuid', 'description' => $description];
    }

    private function nullableUuid(string $description): array
    {
        return ['type' => ['string', 'null'], 'format' => 'uuid', 'description' => $description];
    }
}
