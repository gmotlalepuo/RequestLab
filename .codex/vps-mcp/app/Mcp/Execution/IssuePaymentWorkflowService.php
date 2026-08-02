<?php

namespace App\Mcp\Execution;

use App\Mcp\Auth\AuthenticatedUser;
use App\Mcp\Data\RequestLabRepository;
use App\Mcp\Exceptions\McpException;

class IssuePaymentWorkflowService
{
    private const HOSTS = [
        'uat' => ['trls-uat.gov.bw', 'twosixdigitalbw.app', '168.167.228.111'],
        'production' => ['trls.gov.bw', 'twosixdigitalbw.com', '168.167.228.98'],
    ];

    private const SERVICES = [
        'teacher_registration' => ['teacher registration', 'teacher registrations'],
        'license_renewal' => ['license renewal'],
    ];

    public function __construct(
        private readonly RequestLabRepository $repository,
        private readonly CanonicalDigest $digest,
        private readonly ConfirmationService $confirmations,
    ) {
    }

    public function prepare(array $arguments, AuthenticatedUser $user): array
    {
        if (!config('mcp.execution.enabled')) {
            throw new McpException('EXECUTION_DISABLED', 'Workflow execution is disabled by server configuration.', httpStatus: 503);
        }

        $repository = $this->repository->forUser($user);
        [$collection, $environment, $folder, $request, $host] = $this->resolveResources($repository, $arguments);
        $method = strtoupper((string) $request['method']);
        $definitionDigest = $this->definitionDigest($request);
        $serviceLabel = $arguments['service'] === 'license_renewal' ? 'License Renewal' : 'Teacher Registrations';
        $environmentLabel = $arguments['target_environment'] === 'production' ? 'Production' : 'User Acceptance Testing';

        $plan = [
            'user_id' => $user->id,
            'workspace_id' => $arguments['workspace_id'],
            'collection_id' => $collection['id'],
            'environment_id' => $environment['id'],
            'workflow' => ['name' => 'issue_payment', 'version' => '1.0.0'],
            'request_ids' => [$request['id']],
            'methods' => [$method],
            'arguments' => [
                'national_id' => $arguments['national_id'],
                'reg_status' => 'Manager-Approved',
                'service' => $arguments['service'],
                'target_environment' => $arguments['target_environment'],
            ],
            'update_definition_digest' => $definitionDigest,
            'resolved_host' => $host,
        ];
        $planDigest = $this->digest->make($plan);
        $preview = [
            'environment' => $environmentLabel,
            'service' => $serviceLabel,
            'collection' => $collection['name'] ?? $collection['id'],
            'folder' => $folder['name'] ?? $folder['id'],
            'national_id' => $this->maskNationalId($arguments['national_id']),
            'request_name' => $request['name'] ?? 'Issue Payment',
            'method' => $method,
            'host' => $host,
            'intended_change' => 'Set reg_status to Manager-Approved to issue payment.',
        ];

        return $this->confirmations->issue($user->id, $planDigest, $preview, [
            'plan' => $plan,
            'workspace_id' => $arguments['workspace_id'],
            'collection_id' => $collection['id'],
            'environment_id' => $environment['id'],
            'update_request_id' => $request['id'],
            'method' => $method,
            'expected_host' => $host,
            'national_id' => $arguments['national_id'],
            'service' => $arguments['service'],
            'service_label' => $serviceLabel,
            'environment_label' => $environmentLabel,
            'update_definition_digest' => $definitionDigest,
        ]) + ['requires_confirmation' => true, 'workflow_name' => 'issue_payment'];
    }

    private function resolveResources(RequestLabRepository $repository, array $arguments): array
    {
        $collections = $repository->listCollections($arguments['workspace_id']);
        $selected = $arguments['collection_id'] ?? null;
        usort($collections, fn ($left, $right) => (int) (($right['id'] ?? null) === $selected) <=> (int) (($left['id'] ?? null) === $selected));

        foreach ($collections as $collection) {
            $environment = $this->findEnvironment($repository->listEnvironments($collection['id']), $arguments['target_environment']);
            if (!$environment) continue;
            $folder = $this->findServiceFolder($repository, $collection['id'], $arguments['service']);
            if (!$folder) continue;
            $request = $this->findPaymentRequest($repository, $collection['id'], $folder['id'], $arguments['service']);
            if (!$request) continue;
            $host = $this->resolvedHost($request, $repository->getEnvironment($environment['id']), $arguments);
            if (!in_array($host, self::HOSTS[$arguments['target_environment']], true)) {
                throw new McpException('ENVIRONMENT_HOST_MISMATCH', 'The resolved endpoint host does not match the requested environment.', [
                    'environment' => $arguments['target_environment'], 'host' => $host,
                ], 409);
            }
            return [$collection, $environment, $folder, $request, $host];
        }

        throw new McpException('PAYMENT_ENDPOINT_NOT_FOUND', 'No reviewed payment endpoint was found under the requested service folder and environment.', [
            'service' => $arguments['service'], 'environment' => $arguments['target_environment'],
        ], 404);
    }

    private function findEnvironment(array $environments, string $target): ?array
    {
        foreach ($environments as $environment) {
            $name = $this->normalize((string) ($environment['name'] ?? ''));
            if ($target === 'production' && ($name === 'production' || $name === 'prod')) return $environment;
            if ($target === 'uat' && (str_contains($name, 'user acceptance') || str_contains($name, 'user testing') || $name === 'uat')) return $environment;
        }
        return null;
    }

    private function findServiceFolder(RequestLabRepository $repository, string $collectionId, string $service): ?array
    {
        $queue = $repository->listFolders($collectionId, null);
        while ($queue) {
            $folder = array_shift($queue);
            $name = $this->normalize((string) ($folder['name'] ?? ''));
            if (in_array($name, self::SERVICES[$service], true)) return $folder;
            foreach ($repository->listFolders($collectionId, $folder['id']) as $child) $queue[] = $child;
        }
        return null;
    }

    private function findPaymentRequest(RequestLabRepository $repository, string $collectionId, string $folderId, string $service): ?array
    {
        $candidates = [];
        foreach ($repository->listRequests($collectionId, $folderId) as $summary) {
            if (!in_array(strtoupper((string) ($summary['method'] ?? '')), ['PUT', 'PATCH'], true)) continue;
            $request = $repository->getRequest($summary['id']);
            if (!str_contains((string) ($request['url'] ?? ''), '{{national_id}}')) continue;
            $pathNeedle = $service === 'license_renewal' ? 'license-renewal' : 'teacher_registrations';
            if (!str_contains(strtolower((string) $request['url']), $pathNeedle)) continue;
            $hasStatus = false;
            foreach ($request['params'] ?? [] as $row) {
                if (is_array($row) && ($row['enabled'] ?? true) === true && ($row['key'] ?? null) === 'reg_status') $hasStatus = true;
            }
            if (!$hasStatus) continue;
            $score = str_contains($this->normalize((string) ($request['name'] ?? '')), 'issue payment') ? 100 : 0;
            $candidates[] = [$score, $request];
        }
        usort($candidates, fn ($left, $right) => $right[0] <=> $left[0]);
        return $candidates[0][1] ?? null;
    }

    private function resolvedHost(array $request, array $environment, array $arguments): string
    {
        $variables = [];
        foreach ($environment['variables'] ?? [] as $row) {
            if (is_array($row) && ($row['enabled'] ?? true) === true && is_string($row['key'] ?? null)) $variables[$row['key']] = (string) ($row['value'] ?? '');
        }
        $variables['national_id'] = $arguments['national_id'];
        $variables['reg_status'] = 'Manager-Approved';
        $url = preg_replace_callback('/\{\{\s*([^{}]+?)\s*\}\}/', fn ($match) => $variables[trim($match[1])] ?? $match[0], (string) $request['url']);
        if (str_contains($url, '{{') || !is_string(parse_url($url, PHP_URL_HOST))) {
            throw new McpException('ENVIRONMENT_VARIABLES_MISSING', 'The selected environment cannot resolve the reviewed payment endpoint URL.', httpStatus: 422);
        }
        return strtolower((string) parse_url($url, PHP_URL_HOST));
    }

    private function definitionDigest(array $request): string
    {
        return $this->digest->make(array_intersect_key($request, array_flip([
            'id', 'collection_id', 'method', 'url', 'params', 'headers', 'body_mode', 'body_raw', 'body_form', 'auth',
        ])));
    }

    private function normalize(string $value): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower($value)));
    }

    private function maskNationalId(string $value): string
    {
        return str_repeat('*', max(0, strlen($value) - 4)).substr($value, -4);
    }
}
