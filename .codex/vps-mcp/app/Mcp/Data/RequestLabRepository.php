<?php

namespace App\Mcp\Data;

use App\Mcp\Auth\AuthenticatedUser;

interface RequestLabRepository
{
    public function forUser(AuthenticatedUser $user): self;

    public function listWorkspaces(): array;
    public function listCollections(string $workspaceId): array;
    public function listFolders(string $collectionId, ?string $parentFolderId): array;
    public function listRequests(string $collectionId, ?string $folderId): array;
    public function listEnvironments(string $collectionId): array;
    public function getWorkspaceMembers(string $workspaceId): array;
    public function getCollection(string $collectionId): array;
    public function getFolder(string $folderId): array;
    public function getRequest(string $requestId): array;
    public function getEnvironment(string $environmentId): array;
    public function searchRequests(string $workspaceId): array;
}
