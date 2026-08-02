<?php

namespace Tests\Feature;

use App\Mcp\Auth\AuthenticatedUser;
use App\Mcp\Data\RequestLabRepository;
use App\Mcp\Exceptions\McpException;
use App\Mcp\Execution\CanonicalDigest;
use App\Mcp\Execution\ConfirmationService;
use App\Mcp\Execution\IssueLicenseWorkflowService;
use App\Mcp\Execution\JsonPathExtractor;
use App\Mcp\Execution\RequestLabExecutor;
use App\Mcp\Knowledge\KnowledgeCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\TestCase;

class IssueLicenseWorkflowServiceTest extends TestCase
{
    use RefreshDatabase;

    private const USER_ID = 'd7537b93-f733-4c6f-bdb7-d75cacb8802a';
    private const WORKSPACE_ID = 'c730595e-9010-4b04-a90c-69edca895ac2';
    private const COLLECTION_ID = '789a28c0-8094-4f7e-9d7c-ba6ba602caeb';
    private const ENVIRONMENT_ID = 'c951fa51-33d4-471a-b2bd-9749c96b2d27';
    private const LOOKUP_ID = 'a9758cea-ef5b-4527-aa2b-3140f36f4524';
    private const UPDATE_ID = '105b8b1a-cee9-4e95-81c7-0b9f879f2f60';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'mcp.execution.enabled' => true,
            'mcp.execution.confirmation_ttl_seconds' => 300,
        ]);
    }

    public function test_it_runs_only_the_lookup_and_prepares_an_encrypted_confirmation(): void
    {
        $repository = $this->repository();
        $executor = Mockery::mock(RequestLabExecutor::class);
        $executor->shouldReceive('execute')->once()
            ->withArgs(fn ($user, $requestId, $environmentId, $collectionId, $method, $overrides) =>
                $requestId === self::LOOKUP_ID
                && $environmentId === self::ENVIRONMENT_ID
                && $collectionId === self::COLLECTION_ID
                && $method === 'GET'
                && $overrides === ['national_id' => '436415528'])
            ->andReturn($this->lookupEvidence('Pending-Assessment'));

        $result = $this->service($repository, $executor)->prepare($this->arguments(), $this->user());

        $this->assertTrue($result['requires_confirmation']);
        $this->assertSame('PUT', $result['preview']['method']);
        $this->assertSame('Endorsement-Complete', str_replace('Set endorsement_status to ', '', rtrim($result['preview']['intended_change'], '.')));
        $this->assertSame('[REDACTED]', $result['preview']['qr_link']);
        $stored = DB::table('mcp_confirmations')->where('id', $result['confirmation_id'])->first();
        $this->assertNotNull($stored);
        $this->assertStringNotContainsString('https://qr.example.test/license', $stored->payload);
    }

    public function test_it_reports_missing_reg_status_instead_of_guessing(): void
    {
        $repository = $this->repository();
        $executor = Mockery::mock(RequestLabExecutor::class);
        $executor->shouldReceive('execute')->once()->andReturn($this->lookupEvidence(null));

        try {
            $this->service($repository, $executor)->prepare($this->arguments(), $this->user());
            $this->fail('Expected a missing input error.');
        } catch (McpException $exception) {
            $this->assertSame('MISSING_REQUIRED_INPUT', $exception->errorCode);
            $this->assertSame(['reg_status'], $exception->details['missing_inputs']);
        }
    }

    private function repository(): RequestLabRepository
    {
        $repository = Mockery::mock(RequestLabRepository::class);
        $repository->shouldReceive('forUser')->once()->andReturnSelf();
        $repository->shouldReceive('getCollection')->with(self::COLLECTION_ID)->andReturn([
            'id' => self::COLLECTION_ID, 'workspace_id' => self::WORKSPACE_ID, 'name' => 'UAT Endpoints',
        ]);
        $repository->shouldReceive('getEnvironment')->with(self::ENVIRONMENT_ID)->andReturn([
            'id' => self::ENVIRONMENT_ID, 'workspace_id' => self::WORKSPACE_ID,
            'collection_id' => self::COLLECTION_ID, 'name' => 'User Acceptance Testing ',
        ]);
        $repository->shouldReceive('listFolders')->with(self::COLLECTION_ID, null)->andReturn([[
            'id' => '6c5dfc50-f0c6-4cb7-bf35-1998a9a8e486', 'collection_id' => self::COLLECTION_ID, 'name' => 'Teacher Registration',
        ]]);
        $repository->shouldReceive('listRequests')->with(self::COLLECTION_ID, '6c5dfc50-f0c6-4cb7-bf35-1998a9a8e486')->andReturn([
            ['id' => self::LOOKUP_ID, 'method' => 'GET'],
            ['id' => self::UPDATE_ID, 'method' => 'PUT'],
        ]);
        $repository->shouldReceive('getRequest')->with(self::LOOKUP_ID)->andReturn([
            'id' => self::LOOKUP_ID, 'collection_id' => self::COLLECTION_ID, 'name' => 'Registrations by ID',
            'method' => 'GET', 'url' => '{{teacher_reg_backend_base_url}}teacher_registrations/{{national_id}}',
            'params' => [],
        ]);
        $repository->shouldReceive('getRequest')->with(self::UPDATE_ID)->andReturn([
            'id' => self::UPDATE_ID, 'collection_id' => self::COLLECTION_ID, 'name' => 'update UAT status',
            'method' => 'PUT', 'url' => '{{teacher_reg_backend_base_url}}teacher_registrations/{{national_id}}',
            'params' => [
                ['key' => 'endorsement_status', 'value' => '{{endorsement_status}}', 'enabled' => true],
                ['key' => 'qr_link', 'value' => '{{qr_link}}', 'enabled' => true],
            ],
        ]);
        return $repository;
    }

    private function service(RequestLabRepository $repository, RequestLabExecutor $executor): IssueLicenseWorkflowService
    {
        return new IssueLicenseWorkflowService(
            $repository,
            $executor,
            new KnowledgeCatalog(),
            new JsonPathExtractor(),
            new CanonicalDigest(),
            new ConfirmationService(),
        );
    }

    private function lookupEvidence(?string $regStatus): array
    {
        return [
            'request_id' => self::LOOKUP_ID,
            'environment_id' => self::ENVIRONMENT_ID,
            'resolved_host' => 'uat.example.test',
            'method' => 'GET',
            'status' => 200,
            'duration_ms' => 20,
            'body' => json_encode(['teacher_registrations' => [
                'national_id' => '436415528',
                'qr_link' => 'https://qr.example.test/license',
                'reg_status' => $regStatus,
            ]], JSON_THROW_ON_ERROR),
        ];
    }

    private function arguments(): array
    {
        return [
            'workspace_id' => self::WORKSPACE_ID,
            'collection_id' => self::COLLECTION_ID,
            'environment_id' => self::ENVIRONMENT_ID,
            'national_id' => '436415528',
        ];
    }

    private function user(): AuthenticatedUser
    {
        return new AuthenticatedUser(self::USER_ID, 'user@example.test', 'user-access-token');
    }
}
