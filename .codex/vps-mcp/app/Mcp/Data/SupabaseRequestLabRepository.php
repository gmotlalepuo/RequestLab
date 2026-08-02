<?php

namespace App\Mcp\Data;

use App\Mcp\Auth\AuthenticatedUser;
use App\Mcp\Exceptions\McpException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

class SupabaseRequestLabRepository implements RequestLabRepository
{
    private ?AuthenticatedUser $user = null;

    public function forUser(AuthenticatedUser $user): self
    {
        $repository = clone $this;
        $repository->user = $user;
        return $repository;
    }

    public function listWorkspaces(): array
    {
        return $this->query('postman_workspaces', [
            'select' => 'id,user_id,name,created_at',
            'order' => 'name.asc',
        ]);
    }

    public function listCollections(string $workspaceId): array
    {
        return $this->query('postman_collections', [
            'select' => 'id,workspace_id,created_by,name,description,created_at',
            'workspace_id' => 'eq.'.$workspaceId,
            'order' => 'name.asc',
        ]);
    }

    public function listFolders(string $collectionId, ?string $parentFolderId): array
    {
        return $this->query('postman_folders', [
            'select' => 'id,collection_id,parent_folder_id,name,description,is_starred,sort_order,created_at',
            'collection_id' => 'eq.'.$collectionId,
            'parent_folder_id' => $parentFolderId ? 'eq.'.$parentFolderId : 'is.null',
            'order' => 'is_starred.desc,sort_order.asc,name.asc',
        ]);
    }

    public function listRequests(string $collectionId, ?string $folderId): array
    {
        return $this->query('postman_requests', [
            'select' => 'id,collection_id,folder_id,name,documentation,sort_order,method,url,created_at',
            'collection_id' => 'eq.'.$collectionId,
            'folder_id' => $folderId ? 'eq.'.$folderId : 'is.null',
            'order' => 'sort_order.asc,name.asc',
        ]);
    }

    public function listEnvironments(string $collectionId): array
    {
        return $this->query('postman_environments', [
            'select' => 'id,workspace_id,collection_id,name,created_at',
            'collection_id' => 'eq.'.$collectionId,
            'order' => 'name.asc',
        ]);
    }

    public function getWorkspaceMembers(string $workspaceId): array
    {
        return $this->query('postman_workspace_members', [
            'select' => 'workspace_id,user_id,email,role,joined_at',
            'workspace_id' => 'eq.'.$workspaceId,
            'order' => 'role.asc,email.asc',
        ]);
    }

    public function getCollection(string $collectionId): array
    {
        return $this->one('postman_collections', [
            'select' => 'id,workspace_id,created_by,name,description,created_at',
            'id' => 'eq.'.$collectionId,
        ], 'Collection');
    }

    public function getFolder(string $folderId): array
    {
        return $this->one('postman_folders', [
            'select' => 'id,collection_id,parent_folder_id,name,description,is_starred,sort_order,created_at',
            'id' => 'eq.'.$folderId,
        ], 'Folder');
    }

    public function getRequest(string $requestId): array
    {
        return $this->one('postman_requests', [
            'select' => 'id,collection_id,folder_id,name,documentation,sort_order,method,url,params,headers,body_mode,body_raw,body_form,auth,created_at',
            'id' => 'eq.'.$requestId,
        ], 'Request');
    }

    public function getEnvironment(string $environmentId): array
    {
        return $this->one('postman_environments', [
            'select' => 'id,workspace_id,collection_id,name,variables,created_at',
            'id' => 'eq.'.$environmentId,
        ], 'Environment');
    }

    public function searchRequests(string $workspaceId): array
    {
        $rows = $this->query('postman_requests', [
            'select' => 'id,collection_id,folder_id,name,documentation,method,url,postman_collections!inner(workspace_id,name)',
            'postman_collections.workspace_id' => 'eq.'.$workspaceId,
            'order' => 'name.asc',
            'limit' => 500,
        ]);

        return array_map(function (array $row) {
            $collection = $row['postman_collections'] ?? [];
            unset($row['postman_collections']);
            $row['workspace_id'] = $collection['workspace_id'] ?? null;
            $row['collection_name'] = $collection['name'] ?? null;
            return $row;
        }, $rows);
    }

    private function one(string $table, array $query, string $resource): array
    {
        $rows = $this->query($table, $query + ['limit' => 1]);
        if (!$rows) {
            throw new McpException(
                'RESOURCE_NOT_FOUND',
                $resource.' was not found or is outside the authenticated workspace.',
                ['resource' => strtolower($resource)],
                404,
            );
        }
        return $rows[0];
    }

    private function query(string $table, array $query): array
    {
        try {
            $response = $this->client()->get('/rest/v1/'.$table, $query);
        } catch (ConnectionException) {
            throw new McpException(
                'DATA_SERVICE_UNAVAILABLE',
                'RequestLab data is temporarily unavailable.',
                httpStatus: 503,
            );
        }

        if ($response->status() === 401) {
            throw new McpException('AUTH_REQUIRED', 'The Supabase session has expired.', httpStatus: 401);
        }
        if ($response->status() === 403) {
            throw new McpException(
                'WORKSPACE_ACCESS_DENIED',
                'The authenticated user cannot access this RequestLab resource.',
                httpStatus: 403,
            );
        }
        if (!$response->successful() || !is_array($response->json())) {
            throw new McpException(
                'DATA_SERVICE_ERROR',
                'RequestLab data could not be retrieved.',
                ['status' => $response->status()],
                502,
            );
        }

        return $response->json();
    }

    private function client(): PendingRequest
    {
        if (!$this->user) {
            throw new McpException('AUTH_REQUIRED', 'An authenticated repository context is required.', httpStatus: 401);
        }

        return Http::baseUrl(config('mcp.supabase_url'))
            ->acceptJson()
            ->withHeaders(['apikey' => config('mcp.supabase_publishable_key')])
            ->withToken($this->user->accessToken)
            ->timeout(config('mcp.timeout_seconds'));
    }
}
