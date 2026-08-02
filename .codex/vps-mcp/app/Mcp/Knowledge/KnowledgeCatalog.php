<?php

namespace App\Mcp\Knowledge;

use App\Mcp\Exceptions\McpException;

class KnowledgeCatalog
{
    private string $root;

    public function __construct()
    {
        $this->root = base_path('docs/mcp/knowledge');
    }

    public function status(): array
    {
        $manifest = $this->manifest();
        $workflows = $this->workflows();
        $endpoints = $this->endpoints();
        $unbound = array_values(array_map(
            fn ($endpoint) => $endpoint['semantic_ref'],
            array_filter($endpoints, fn ($endpoint) => ($endpoint['binding']['status'] ?? 'unresolved') !== 'bound'),
        ));

        return [
            'contract_version' => $manifest['contract_version'],
            'database_dictionary_version' => $this->databaseDictionary()['version'] ?? null,
            'endpoint_knowledge_version' => $this->endpointIndex()['version'] ?? null,
            'database_dictionary_loaded' => !empty($this->databaseDictionary()['tables']),
            'endpoint_profile_loaded' => !empty($this->endpointProfile()['recommended_fields']),
            'endpoint_count' => count($endpoints),
            'unbound_endpoints' => $unbound,
            'workflow_count' => count($workflows),
            'workflows' => array_map(fn ($workflow) => [
                'name' => $workflow['name'],
                'version' => $workflow['version'],
                'ready' => $this->unresolvedReferences($workflow) === [],
            ], $workflows),
            'ready_for_execution' => $unbound === []
                && count(array_filter($workflows, fn ($workflow) => $this->unresolvedReferences($workflow) !== [])) === 0,
        ];
    }

    public function databaseDictionary(): array
    {
        return $this->read($this->manifest()['database_dictionary']);
    }

    public function endpointProfile(): array
    {
        return $this->read($this->manifest()['endpoint_profile_contract']);
    }

    public function endpoints(): array
    {
        return $this->endpointIndex()['endpoints'] ?? [];
    }

    public function getEndpoint(string $semanticRef): array
    {
        foreach ($this->endpoints() as $endpoint) {
            if (($endpoint['semantic_ref'] ?? null) === $semanticRef) {
                return $endpoint;
            }
        }
        throw new McpException('RESOURCE_NOT_FOUND', 'Endpoint knowledge was not found.', ['semantic_ref' => $semanticRef], 404);
    }

    public function listWorkflows(): array
    {
        return array_map(fn ($workflow) => [
            'name' => $workflow['name'],
            'version' => $workflow['version'],
            'description' => $workflow['description'],
            'required_inputs' => $workflow['required_inputs'],
            'effects' => array_values(array_unique(array_column($workflow['steps'], 'effect'))),
            'contains_write' => count(array_intersect(array_column($workflow['steps'], 'effect'), ['create', 'update', 'delete'])) > 0,
            'ready' => $this->unresolvedReferences($workflow) === [],
            'unresolved_references' => $this->unresolvedReferences($workflow),
        ], $this->workflows());
    }

    public function getWorkflow(string $name): array
    {
        foreach ($this->workflows() as $workflow) {
            if ($workflow['name'] === $name) {
                return [
                    'workflow' => $workflow,
                    'ready' => $this->unresolvedReferences($workflow) === [],
                    'unresolved_references' => $this->unresolvedReferences($workflow),
                ];
            }
        }
        throw new McpException('RESOURCE_NOT_FOUND', 'The named workflow was not found.', ['workflow' => $name], 404);
    }

    public function planningContext(): array
    {
        return [
            'contract_version' => $this->manifest()['contract_version'],
            'tenant_boundary' => $this->databaseDictionary()['tenant_boundary'] ?? 'workspace',
            'tables' => array_map(fn ($table) => [
                'name' => $table['name'] ?? null,
                'purpose' => $table['purpose'] ?? null,
                'tenant_path' => $table['tenant_path'] ?? null,
            ], $this->databaseDictionary()['tables'] ?? []),
            'endpoint_authority_rule' => $this->endpointProfile()['authority_rule'] ?? null,
            'endpoints' => $this->endpoints(),
            'workflows' => $this->workflows(),
            'execution_readiness' => $this->status()['ready_for_execution'],
        ];
    }

    private function manifest(): array
    {
        $manifest = $this->read('manifest.json');
        foreach (['contract_version', 'database_dictionary', 'endpoint_profile_contract', 'endpoint_knowledge', 'workflows'] as $field) {
            if (!array_key_exists($field, $manifest)) {
                throw new McpException('KNOWLEDGE_INVALID', 'The knowledge manifest is invalid.', ['missing' => $field], 500);
            }
        }
        return $manifest;
    }

    private function endpointIndex(): array
    {
        return $this->read($this->manifest()['endpoint_knowledge']);
    }

    private function unresolvedReferences(array $workflow): array
    {
        $unresolved = [];
        array_walk_recursive($workflow, function ($value) use (&$unresolved) {
            if (is_string($value) && str_starts_with($value, 'UNRESOLVED:')) {
                $unresolved[] = substr($value, strlen('UNRESOLVED:'));
            }
        });
        return array_values(array_unique($unresolved));
    }

    private function workflows(): array
    {
        return array_map(function ($path) {
            $workflow = $this->read($path);
            $this->validateWorkflow($workflow, $path);
            return $workflow;
        }, $this->manifest()['workflows']);
    }

    private function validateWorkflow(array $workflow, string $path): void
    {
        foreach (['name', 'version', 'description', 'required_inputs', 'steps'] as $field) {
            if (!array_key_exists($field, $workflow)) {
                throw new McpException('KNOWLEDGE_INVALID', 'A workflow is invalid.', ['path' => $path, 'missing' => $field], 500);
            }
        }
        foreach ($workflow['steps'] as $step) {
            $write = in_array($step['effect'] ?? null, ['create', 'update', 'delete'], true);
            if ($write && ($step['confirmation'] ?? null) !== 'required') {
                throw new McpException('KNOWLEDGE_INVALID', 'A write workflow step must require confirmation.', ['path' => $path, 'step' => $step['id'] ?? null], 500);
            }
        }
    }

    private function read(string $relativePath): array
    {
        $path = $this->root.DIRECTORY_SEPARATOR.str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath);
        $resolvedRoot = realpath($this->root);
        $resolvedPath = realpath($path);
        if (!$resolvedRoot || !$resolvedPath || !str_starts_with($resolvedPath, $resolvedRoot.DIRECTORY_SEPARATOR)) {
            throw new McpException('KNOWLEDGE_INVALID', 'A knowledge resource path is invalid.', ['path' => $relativePath], 500);
        }
        try {
            $value = json_decode(file_get_contents($resolvedPath), true, flags: JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            throw new McpException('KNOWLEDGE_INVALID', 'A knowledge resource contains invalid JSON.', ['path' => $relativePath], 500);
        }
        if (!is_array($value)) {
            throw new McpException('KNOWLEDGE_INVALID', 'A knowledge resource must contain an object.', ['path' => $relativePath], 500);
        }
        return $value;
    }
}
