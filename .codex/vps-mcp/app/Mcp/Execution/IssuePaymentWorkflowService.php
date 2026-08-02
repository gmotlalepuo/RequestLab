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
        'teacher_registration' => ['teacher registration', 'teacher registrations', 'teacherregistration', 'teacherregistrations'],
        'license_renewal' => ['license renewal', 'licenserenewal'],
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
        $executionOverrides = [
            $request['_national_id_variable'] => $arguments['national_id'],
        ];
        if (is_string($request['_reg_status_variable'] ?? null)) {
            $executionOverrides[$request['_reg_status_variable']] = 'Manager-Approved';
        }

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
            'execution_overrides' => $executionOverrides,
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
            'execution_overrides' => $executionOverrides,
        ]) + ['requires_confirmation' => true, 'workflow_name' => 'issue_payment'];
    }

    private function resolveResources(RequestLabRepository $repository, array $arguments): array
    {
        $collections = $repository->listCollections($arguments['workspace_id']);
        $selected = $arguments['collection_id'] ?? null;
        usort($collections, fn ($left, $right) =>
            $this->collectionPriority($right, $selected) <=> $this->collectionPriority($left, $selected)
        );

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
            $url = (string) ($request['url'] ?? '');
            preg_match_all('/\{\{\s*([^{}]+?)\s*\}\}/', $url, $placeholderMatches);
            $nationalIdVariable = null;
            foreach ($placeholderMatches[1] ?? [] as $placeholder) {
                if ($this->compactNormalize((string) $placeholder) === 'nationalid') {
                    $nationalIdVariable = trim((string) $placeholder);
                    break;
                }
            }
            if ($nationalIdVariable === null) continue;
            $pathNeedle = $service === 'license_renewal' ? 'license-renewal' : 'teacher_registrations';
            if (!str_contains(strtolower($url), $pathNeedle)) continue;
            $hasStatus = false;
            $regStatusVariable = null;
            foreach ($request['params'] ?? [] as $row) {
                if (!is_array($row) || ($row['enabled'] ?? true) !== true || $this->compactNormalize((string) ($row['key'] ?? '')) !== 'regstatus') continue;
                $hasStatus = true;
                if (preg_match('/^\{\{\s*([^{}]+?)\s*\}\}$/', (string) ($row['value'] ?? ''), $match)) {
                    $regStatusVariable = trim($match[1]);
                }
            }
            $query = (string) (parse_url($url, PHP_URL_QUERY) ?? '');
            foreach (explode('&', $query) as $pair) {
                [$key, $value] = array_pad(explode('=', $pair, 2), 2, '');
                if ($this->compactNormalize(urldecode($key)) !== 'regstatus') continue;
                $decodedValue = urldecode($value);
                if (strcasecmp($decodedValue, 'Manager-Approved') === 0) $hasStatus = true;
                if (preg_match('/^\{\{\s*([^{}]+?)\s*\}\}$/', $decodedValue, $match)) {
                    $hasStatus = true;
                    $regStatusVariable = trim($match[1]);
                }
            }
            if (!$hasStatus) continue;
            $request['_national_id_variable'] = $nationalIdVariable;
            $request['_reg_status_variable'] = $regStatusVariable;
            $normalizedName = $this->normalize((string) ($request['name'] ?? ''));
            $score = str_contains($normalizedName, 'issue payment') ? 100 : (str_contains($normalizedName, 'status') ? 50 : 0);
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
        $variables['nationalId'] = $arguments['national_id'];
        $variables['reg_status'] = 'Manager-Approved';
        $variables['regStatus'] = 'Manager-Approved';
        $variables['targetRegStatus'] = 'Manager-Approved';
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

    private function compactNormalize(string $value): string
    {
        return (string) preg_replace('/[^a-z0-9]+/', '', strtolower($value));
    }

    private function collectionPriority(array $collection, ?string $selected): int
    {
        $name = $this->normalize((string) ($collection['name'] ?? ''));
        if (preg_match('/\blatest\b/', $name)) return 300;
        if (preg_match('/\bold\b/', $name)) return 0;
        return (($collection['id'] ?? null) === $selected) ? 200 : 100;
    }

    private function maskNationalId(string $value): string
    {
        return str_repeat('*', max(0, strlen($value) - 4)).substr($value, -4);
    }
}
