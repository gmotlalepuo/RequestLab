<?php

namespace Tests\Feature;

use App\Mcp\Auth\AuthenticatedUser;
use App\Mcp\Execution\ApprovedWorkflowExecutor;
use App\Mcp\Execution\ConfirmationService;
use App\Mcp\Execution\ExecutionLedger;
use App\Mcp\Execution\RequestLabExecutor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\TestCase;

class ApprovedWorkflowExecutorTest extends TestCase
{
    use RefreshDatabase;

    private const USER_ID = 'd7537b93-f733-4c6f-bdb7-d75cacb8802a';
    private const WORKSPACE_ID = 'c730595e-9010-4b04-a90c-69edca895ac2';
    private const COLLECTION_ID = '789a28c0-8094-4f7e-9d7c-ba6ba602caeb';
    private const ENVIRONMENT_ID = 'c951fa51-33d4-471a-b2bd-9749c96b2d27';
    private const UPDATE_ID = '105b8b1a-cee9-4e95-81c7-0b9f879f2f60';
    private const LOOKUP_ID = 'a9758cea-ef5b-4527-aa2b-3140f36f4524';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'mcp.execution.enabled' => true,
            'mcp.execution.confirmation_ttl_seconds' => 300,
        ]);
    }

    public function test_explicit_approval_executes_once_and_replays_redacted_audit_result(): void
    {
        $digest = str_repeat('a', 64);
        $confirmation = (new ConfirmationService())->issue(
            self::USER_ID,
            $digest,
            ['method' => 'PUT', 'qr_link' => '[REDACTED]'],
            $this->payload(),
        );
        $gateway = Mockery::mock(RequestLabExecutor::class);
        $gateway->shouldReceive('execute')->once()
            ->withArgs(fn ($user, $requestId, $environmentId, $collectionId, $method, $overrides) =>
                $requestId === self::UPDATE_ID
                && $environmentId === self::ENVIRONMENT_ID
                && $collectionId === self::COLLECTION_ID
                && $method === 'PUT'
                && $overrides['national_id'] === '436415528'
                && $overrides['endorsement_status'] === 'Endorsement-Complete'
                && $overrides['qr_link'] === 'https://qr.example.test/license')
            ->andReturn([
                'request_id' => self::UPDATE_ID,
                'environment_id' => self::ENVIRONMENT_ID,
                'resolved_host' => 'uat.example.test',
                'method' => 'PUT',
                'status' => 200,
                'duration_ms' => 30,
                'size_bytes' => 120,
                'body' => '{"message":"updated"}',
            ]);
        $service = new ApprovedWorkflowExecutor(new ConfirmationService(), new ExecutionLedger(), $gateway, new \App\Mcp\Execution\RolloutPolicy());
        $user = new AuthenticatedUser(self::USER_ID, 'user@example.test', 'user-access-token');

        $first = $service->execute($user, $confirmation['confirmation_id'], $digest, 'issue-license:436415528:1');
        $second = $service->execute($user, $confirmation['confirmation_id'], $digest, 'issue-license:436415528:1');

        $this->assertSame('succeeded', $first['status']);
        $this->assertFalse($first['replayed']);
        $this->assertTrue($second['replayed']);
        $this->assertSame($first['execution_id'], $second['execution_id']);
        $audit = DB::table('mcp_executions')->where('id', $first['execution_id'])->first();
        $this->assertStringNotContainsString('436415528', $audit->outcome_summary);
        $this->assertStringNotContainsString('https://qr.example.test/license', $audit->outcome_summary);
    }

    private function payload(): array
    {
        return [
            'plan' => [
                'workflow' => ['name' => 'issue_license', 'version' => '1.0.0'],
                'request_ids' => [self::LOOKUP_ID, self::UPDATE_ID],
            ],
            'lookup_host' => 'uat.example.test',
            'update_request_id' => self::UPDATE_ID,
            'environment_id' => self::ENVIRONMENT_ID,
            'collection_id' => self::COLLECTION_ID,
            'workspace_id' => self::WORKSPACE_ID,
            'national_id' => '436415528',
            'qr_link' => 'https://qr.example.test/license',
            'reg_status' => 'Pending-Assessment',
            'update_definition_digest' => str_repeat('d', 64),
        ];
    }
}
