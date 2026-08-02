<?php

namespace App\Mcp\Execution;

use App\Mcp\Auth\AuthenticatedUser;
use App\Mcp\Data\RequestLabRepository;
use App\Mcp\Exceptions\McpException;
use App\Mcp\Knowledge\KnowledgeCatalog;

class IssueLicenseWorkflowService
{
    public function __construct(
        private readonly RequestLabRepository $repository,
        private readonly RequestLabExecutor $executor,
        private readonly KnowledgeCatalog $knowledge,
        private readonly JsonPathExtractor $extractor,
        private readonly CanonicalDigest $digest,
        private readonly ConfirmationService $confirmations,
    ) {
    }

    public function prepare(array $arguments, AuthenticatedUser $user): array
    {
        $this->requireExecutionEnabled();
        $repository = $this->repository->forUser($user);
        $workflow = $this->knowledge->getWorkflow('issue_license')['workflow'];
        $lookupKnowledge = $this->knowledge->getEndpoint('get_registration_by_national_id');
        $collection = $repository->getCollection($arguments['collection_id']);
        $environment = $repository->getEnvironment($arguments['environment_id']);
        [$lookup, $update] = $this->discoverReviewedRequests($repository, $arguments['collection_id']);
        $lookupId = $lookup['id'];
        $updateId = $update['id'];
        $this->validateRelationships($arguments, $collection, $environment, $lookup, $update);
        $this->validateStoredDefinitions($lookup, $update);

        $lookupEvidence = $this->executor->execute(
            $user,
            $lookupId,
            $arguments['environment_id'],
            $arguments['collection_id'],
            'GET',
            ['national_id' => $arguments['national_id']],
            $this->definitionDigest($lookup),
        );
        if (($lookupEvidence['status'] ?? 500) < 200 || ($lookupEvidence['status'] ?? 500) >= 300) {
            throw new McpException(
                'LOOKUP_FAILED',
                'The registration lookup did not return a successful response.',
                ['status' => $lookupEvidence['status'] ?? null],
                422,
            );
        }
        try {
            $response = json_decode((string) $lookupEvidence['body'], true, flags: JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new McpException('LOOKUP_RESPONSE_INVALID', 'The registration lookup returned invalid JSON.', httpStatus: 502);
        }
        if (!is_array($response)) {
            throw new McpException('LOOKUP_RESPONSE_INVALID', 'The registration lookup returned an invalid object.', httpStatus: 502);
        }

        $values = [];
        $missing = [];
        foreach ($lookupKnowledge['response_extractions'] as $extraction) {
            $value = $this->extractor->extract($response, $extraction['path']);
            if (($extraction['required'] ?? false) && (!is_string($value) || trim($value) === '')) {
                $missing[] = $extraction['name'];
            }
            $values[$extraction['name']] = $value;
        }
        if ($missing) {
            throw new McpException(
                'MISSING_REQUIRED_INPUT',
                'The workflow needs '.implode(', ', $missing).' before it can continue.',
                ['missing_inputs' => $missing],
                422,
            );
        }
        $returnedNationalId = $this->extractor->extract($response, '$.teacher_registrations.national_id');
        if (!is_string($returnedNationalId) || !hash_equals($arguments['national_id'], $returnedNationalId)) {
            throw new McpException('LOOKUP_RECORD_MISMATCH', 'The lookup response does not match the requested national ID.', httpStatus: 409);
        }

        $plan = [
            'user_id' => $user->id,
            'workspace_id' => $arguments['workspace_id'],
            'collection_id' => $arguments['collection_id'],
            'environment_id' => $arguments['environment_id'],
            'workflow' => ['name' => $workflow['name'], 'version' => $workflow['version']],
            'request_ids' => [$lookupId, $updateId],
            'methods' => ['GET', 'PUT'],
            'arguments' => [
                'national_id' => $arguments['national_id'],
                'qr_link' => $values['qr_link'],
                'endorsement_status' => 'Endorsement-Complete',
            ],
            'transition' => [
                'reg_status' => $values['reg_status'],
                'endorsement_status' => 'Endorsement-Complete',
            ],
            'update_definition_digest' => $this->definitionDigest($update),
            'resolved_host' => $lookupEvidence['resolved_host'],
        ];
        $planDigest = $this->digest->make($plan);
        $preview = [
            'workspace' => $collection['name'] ?? $arguments['workspace_id'],
            'environment' => trim((string) ($environment['name'] ?? $arguments['environment_id'])),
            'workflow' => $workflow['name'].' '.$workflow['version'],
            'request_id' => $updateId,
            'request_name' => $update['name'] ?? 'update UAT status',
            'method' => 'PUT',
            'host' => $lookupEvidence['resolved_host'],
            'national_id' => $this->maskNationalId($arguments['national_id']),
            'current_reg_status' => $values['reg_status'],
            'qr_link' => '[REDACTED]',
            'intended_change' => 'Set endorsement_status to Endorsement-Complete.',
        ];

        return $this->confirmations->issue($user->id, $planDigest, $preview, [
            'plan' => $plan,
            'lookup_host' => $lookupEvidence['resolved_host'],
            'update_request_id' => $updateId,
            'environment_id' => $arguments['environment_id'],
            'collection_id' => $arguments['collection_id'],
            'workspace_id' => $arguments['workspace_id'],
            'national_id' => $arguments['national_id'],
            'qr_link' => $values['qr_link'],
            'reg_status' => $values['reg_status'],
            'update_definition_digest' => $this->definitionDigest($update),
        ]) + ['requires_confirmation' => true];
    }

    private function validateRelationships(array $arguments, array $collection, array $environment, array $lookup, array $update): void
    {
        if (($collection['workspace_id'] ?? null) !== $arguments['workspace_id']
            || ($environment['workspace_id'] ?? null) !== $arguments['workspace_id']
            || ($environment['collection_id'] ?? null) !== $arguments['collection_id']
            || ($lookup['collection_id'] ?? null) !== $arguments['collection_id']
            || ($update['collection_id'] ?? null) !== $arguments['collection_id']) {
            throw new McpException('RESOURCE_RELATIONSHIP_INVALID', 'The workflow resources do not belong to the selected workspace and collection.', httpStatus: 422);
        }
    }

    private function validateStoredDefinitions(array $lookup, array $update): void
    {
        if (($lookup['method'] ?? null) !== 'GET'
            || ($lookup['url'] ?? null) !== '{{teacher_reg_backend_base_url}}teacher_registrations/{{national_id}}'
            || ($update['method'] ?? null) !== 'PUT'
            || ($update['url'] ?? null) !== '{{teacher_reg_backend_base_url}}teacher_registrations/{{national_id}}') {
            throw new McpException('ENDPOINT_DEFINITION_CHANGED', 'A reviewed workflow endpoint changed after binding.', httpStatus: 409);
        }
        $params = [];
        foreach ($update['params'] ?? [] as $row) {
            if (is_array($row) && ($row['enabled'] ?? true) === true) {
                $params[$row['key'] ?? ''] = $row['value'] ?? '';
            }
        }
        if (($params['endorsement_status'] ?? null) !== '{{endorsement_status}}'
            || ($params['qr_link'] ?? null) !== '{{qr_link}}') {
            throw new McpException('ENDPOINT_DEFINITION_CHANGED', 'The reviewed update parameters changed after binding.', httpStatus: 409);
        }
    }

    private function discoverReviewedRequests(RequestLabRepository $repository, string $collectionId): array
    {
        $folder = null;
        foreach ($repository->listFolders($collectionId, null) as $candidate) {
            $name = trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower((string) ($candidate['name'] ?? ''))));
            if (in_array($name, ['teacher registration', 'teacher registrations'], true)) {
                $folder = $candidate;
                break;
            }
        }
        if (!$folder) {
            throw new McpException('LICENSE_ENDPOINT_NOT_FOUND', 'The Teacher Registration service folder was not found in the selected collection.', httpStatus: 404);
        }

        $lookup = null;
        $update = null;
        foreach ($repository->listRequests($collectionId, $folder['id']) as $summary) {
            if (!in_array($summary['method'] ?? null, ['GET', 'PUT'], true)) continue;
            $request = $repository->getRequest($summary['id']);
            if (($request['url'] ?? null) !== '{{teacher_reg_backend_base_url}}teacher_registrations/{{national_id}}') continue;
            if (($request['method'] ?? null) === 'GET') $lookup = $request;
            if (($request['method'] ?? null) === 'PUT') {
                $params = [];
                foreach ($request['params'] ?? [] as $row) {
                    if (is_array($row) && ($row['enabled'] ?? true) === true) $params[$row['key'] ?? ''] = $row['value'] ?? '';
                }
                if (($params['endorsement_status'] ?? null) === '{{endorsement_status}}' && ($params['qr_link'] ?? null) === '{{qr_link}}') $update = $request;
            }
        }
        if (!$lookup || !$update) {
            throw new McpException('LICENSE_ENDPOINT_NOT_FOUND', 'The reviewed Teacher Registration lookup and license-write endpoints were not found in the service folder.', httpStatus: 404);
        }
        return [$lookup, $update];
    }

    private function requireExecutionEnabled(): void
    {
        if (!config('mcp.execution.enabled')) {
            throw new McpException('EXECUTION_DISABLED', 'Workflow execution is disabled by server configuration.', httpStatus: 503);
        }
    }

    private function maskNationalId(string $value): string
    {
        return str_repeat('*', max(0, strlen($value) - 4)).substr($value, -4);
    }

    private function definitionDigest(array $request): string
    {
        return $this->digest->make(array_intersect_key($request, array_flip([
            'id', 'collection_id', 'method', 'url', 'params', 'headers',
            'body_mode', 'body_raw', 'body_form', 'auth',
        ])));
    }
}
