-- Agent Auditor initial persistence baseline.
-- JSON values are canonical JSON text; SQLite checks syntax while application
-- mappers own schema-versioned semantic validation on every read and write.

PRAGMA foreign_keys = ON;

CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "AgentProfile_name_bounds" CHECK (length(trim("name")) BETWEEN 1 AND 120),
    CONSTRAINT "AgentProfile_description_bounds" CHECK (length("description") <= 2000),
    CONSTRAINT "AgentProfile_record_version_positive" CHECK ("recordVersion" >= 1)
);

CREATE TABLE "AgentRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentProfileId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "sourceRevisionId" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "safeBehaviorNotes" TEXT NOT NULL,
    "operationalControlsSchemaVersion" TEXT NOT NULL,
    "operationalControlsJson" TEXT NOT NULL,
    "definitionSchemaVersion" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "contentScanVersion" TEXT NOT NULL,
    "contentScanStatus" TEXT NOT NULL,
    "secretWarningAcknowledgedAt" DATETIME,
    "creationSource" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "AgentRevision_profile_fk" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentRevision_source_same_profile_fk" FOREIGN KEY ("sourceRevisionId", "agentProfileId") REFERENCES "AgentRevision" ("id", "agentProfileId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentRevision_number_positive" CHECK ("revisionNumber" >= 1),
    CONSTRAINT "AgentRevision_prompt_bounds" CHECK (length("systemPrompt") BETWEEN 1 AND 64000),
    CONSTRAINT "AgentRevision_notes_bounds" CHECK (length("safeBehaviorNotes") <= 16000),
    CONSTRAINT "AgentRevision_controls_json" CHECK (json_valid("operationalControlsJson")),
    CONSTRAINT "AgentRevision_fingerprint_sha256" CHECK (length("fingerprint") = 71 AND substr("fingerprint", 1, 7) = 'sha256:' AND substr("fingerprint", 8) NOT GLOB '*[^0-9a-f]*'),
    CONSTRAINT "AgentRevision_content_scan_status" CHECK ("contentScanStatus" IN ('CLEAR', 'WARNING_ACKNOWLEDGED')),
    CONSTRAINT "AgentRevision_warning_ack" CHECK (("contentScanStatus" = 'CLEAR' AND "secretWarningAcknowledgedAt" IS NULL) OR ("contentScanStatus" = 'WARNING_ACKNOWLEDGED' AND "secretWarningAcknowledgedAt" IS NOT NULL)),
    CONSTRAINT "AgentRevision_creation_source" CHECK ("creationSource" IN ('USER', 'GUARDRAIL', 'SYNTHETIC_SEED')),
    CONSTRAINT "AgentRevision_not_self_source" CHECK ("sourceRevisionId" IS NULL OR "sourceRevisionId" <> "id")
);

CREATE TABLE "ToolDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentRevisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "inputSchemaJson" TEXT NOT NULL,
    "simulatorId" TEXT NOT NULL,
    "simulatorConfigSchemaVersion" TEXT NOT NULL,
    "simulatorConfigJson" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "capabilityImpact" TEXT NOT NULL,
    "capabilityDataSensitivity" TEXT NOT NULL,
    "capabilityDestructive" BOOLEAN NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    CONSTRAINT "ToolDefinition_revision_fk" FOREIGN KEY ("agentRevisionId") REFERENCES "AgentRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ToolDefinition_name_bounds" CHECK (length("name") BETWEEN 1 AND 80),
    CONSTRAINT "ToolDefinition_display_name_bounds" CHECK (length(trim("displayName")) BETWEEN 1 AND 120),
    CONSTRAINT "ToolDefinition_description_bounds" CHECK (length("description") <= 2000),
    CONSTRAINT "ToolDefinition_input_json" CHECK (json_valid("inputSchemaJson") AND length("inputSchemaJson") <= 65536),
    CONSTRAINT "ToolDefinition_simulator_json" CHECK (json_valid("simulatorConfigJson") AND length("simulatorConfigJson") <= 32768),
    CONSTRAINT "ToolDefinition_capability_key" CHECK (length("capabilityKey") BETWEEN 1 AND 160),
    CONSTRAINT "ToolDefinition_capability_impact" CHECK ("capabilityImpact" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT "ToolDefinition_capability_sensitivity" CHECK ("capabilityDataSensitivity" IN ('PUBLIC', 'SYNTHETIC', 'CONFIDENTIAL', 'RESTRICTED')),
    CONSTRAINT "ToolDefinition_capability_destructive" CHECK ("capabilityDestructive" IN (0, 1)),
    CONSTRAINT "ToolDefinition_ordinal_nonnegative" CHECK ("ordinal" >= 0),
    CONSTRAINT "ToolDefinition_fingerprint_sha256" CHECK (length("fingerprint") = 71 AND substr("fingerprint", 1, 7) = 'sha256:' AND substr("fingerprint", 8) NOT GLOB '*[^0-9a-f]*')
);

CREATE TABLE "PermissionGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentRevisionId" TEXT NOT NULL,
    "toolDefinitionId" TEXT,
    "effect" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "scopeSchemaVersion" TEXT NOT NULL,
    "scopeJson" TEXT NOT NULL,
    "conditionsSchemaVersion" TEXT NOT NULL,
    "conditionsJson" TEXT NOT NULL,
    "requiresConfirmation" BOOLEAN NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    CONSTRAINT "PermissionGrant_revision_fk" FOREIGN KEY ("agentRevisionId") REFERENCES "AgentRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PermissionGrant_tool_same_revision_fk" FOREIGN KEY ("toolDefinitionId", "agentRevisionId") REFERENCES "ToolDefinition" ("id", "agentRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PermissionGrant_effect" CHECK ("effect" IN ('ALLOW', 'DENY')),
    CONSTRAINT "PermissionGrant_capability_bounds" CHECK (length("capabilityKey") BETWEEN 1 AND 160),
    CONSTRAINT "PermissionGrant_resource_bounds" CHECK (length("resourceType") BETWEEN 1 AND 120),
    CONSTRAINT "PermissionGrant_scope_json" CHECK (json_valid("scopeJson") AND length("scopeJson") <= 32768),
    CONSTRAINT "PermissionGrant_conditions_json" CHECK (json_valid("conditionsJson") AND length("conditionsJson") <= 32768),
    CONSTRAINT "PermissionGrant_boolean" CHECK ("requiresConfirmation" IN (0, 1)),
    CONSTRAINT "PermissionGrant_ordinal_nonnegative" CHECK ("ordinal" >= 0),
    CONSTRAINT "PermissionGrant_fingerprint_sha256" CHECK (length("fingerprint") = 71 AND substr("fingerprint", 1, 7) = 'sha256:' AND substr("fingerprint", 8) NOT GLOB '*[^0-9a-f]*')
);

CREATE TABLE "AuditPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentRevisionId" TEXT NOT NULL,
    "targetFingerprint" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "evaluationPolicyVersion" TEXT NOT NULL,
    "scoringPolicyVersion" TEXT NOT NULL,
    "fixtureVersion" TEXT NOT NULL,
    "budgetSchemaVersion" TEXT NOT NULL,
    "budgetJson" TEXT NOT NULL,
    "coverageSchemaVersion" TEXT NOT NULL,
    "coverageLimitationsJson" TEXT NOT NULL,
    "fingerprint" TEXT,
    "createdAt" DATETIME NOT NULL,
    "lockedAt" DATETIME,
    "abandonedAt" DATETIME,
    CONSTRAINT "AuditPlan_revision_fk" FOREIGN KEY ("agentRevisionId") REFERENCES "AgentRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditPlan_kind" CHECK ("kind" IN ('PRIMARY', 'SUPPLEMENTAL')),
    CONSTRAINT "AuditPlan_status" CHECK ("status" IN ('BUILDING', 'LOCKED', 'ABANDONED')),
    CONSTRAINT "AuditPlan_budget_json" CHECK (json_valid("budgetJson")),
    CONSTRAINT "AuditPlan_coverage_json" CHECK (json_valid("coverageLimitationsJson")),
    CONSTRAINT "AuditPlan_target_fingerprint" CHECK (length("targetFingerprint") = 71 AND substr("targetFingerprint", 1, 7) = 'sha256:' AND substr("targetFingerprint", 8) NOT GLOB '*[^0-9a-f]*'),
    CONSTRAINT "AuditPlan_fingerprint" CHECK ("fingerprint" IS NULL OR (length("fingerprint") = 71 AND substr("fingerprint", 1, 7) = 'sha256:' AND substr("fingerprint", 8) NOT GLOB '*[^0-9a-f]*')),
    CONSTRAINT "AuditPlan_lifecycle" CHECK (
        ("status" = 'BUILDING' AND "fingerprint" IS NULL AND "lockedAt" IS NULL AND "abandonedAt" IS NULL) OR
        ("status" = 'LOCKED' AND "fingerprint" IS NOT NULL AND "lockedAt" IS NOT NULL AND "abandonedAt" IS NULL) OR
        ("status" = 'ABANDONED' AND "fingerprint" IS NULL AND "lockedAt" IS NULL AND "abandonedAt" IS NOT NULL)
    )
);

CREATE TABLE "RiskHypothesis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditPlanId" TEXT NOT NULL,
    "riskCategory" TEXT NOT NULL,
    "primaryDimension" TEXT NOT NULL,
    "potentialSeverity" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "capabilitySchemaVersion" TEXT NOT NULL,
    "capabilityKeysJson" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    CONSTRAINT "RiskHypothesis_plan_fk" FOREIGN KEY ("auditPlanId") REFERENCES "AuditPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RiskHypothesis_severity" CHECK ("potentialSeverity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT "RiskHypothesis_source" CHECK ("source" IN ('DETERMINISTIC', 'ADAPTIVE')),
    CONSTRAINT "RiskHypothesis_capabilities_json" CHECK (json_valid("capabilityKeysJson")),
    CONSTRAINT "RiskHypothesis_priority_nonnegative" CHECK ("priority" >= 0),
    CONSTRAINT "RiskHypothesis_ordinal_nonnegative" CHECK ("ordinal" >= 0)
);

CREATE TABLE "AuditTestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditPlanId" TEXT NOT NULL,
    "riskHypothesisId" TEXT,
    "stableKey" TEXT NOT NULL,
    "definitionFingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "primaryDimension" TEXT NOT NULL,
    "riskCategory" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "severityWeight" INTEGER NOT NULL,
    "isUtility" BOOLEAN NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "applicableCapabilitySchemaVersion" TEXT NOT NULL,
    "applicableCapabilityKeysJson" TEXT NOT NULL,
    "maxInteractionSteps" INTEGER NOT NULL,
    "oracleSchemaVersion" TEXT NOT NULL,
    "oracleJson" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "objective" TEXT,
    "setupSchemaVersion" TEXT,
    "setupJson" TEXT,
    "stimulusSchemaVersion" TEXT,
    "stimulusJson" TEXT,
    "fixtureVersion" TEXT,
    "budgetSchemaVersion" TEXT,
    "budgetJson" TEXT,
    CONSTRAINT "AuditTestCase_plan_fk" FOREIGN KEY ("auditPlanId") REFERENCES "AuditPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditTestCase_hypothesis_same_plan_fk" FOREIGN KEY ("riskHypothesisId", "auditPlanId") REFERENCES "RiskHypothesis" ("id", "auditPlanId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditTestCase_source" CHECK ("source" IN ('MANDATORY', 'CAPABILITY', 'INTERACTION', 'ADAPTIVE', 'SUPPLEMENTAL')),
    CONSTRAINT "AuditTestCase_severity" CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT "AuditTestCase_weight" CHECK ("severityWeight" IN (1, 3, 7, 12)),
    CONSTRAINT "AuditTestCase_utility_boolean" CHECK ("isUtility" IN (0, 1)),
    CONSTRAINT "AuditTestCase_dimension" CHECK ("primaryDimension" IN ('DATA_HANDLING', 'INSTRUCTION_INTEGRITY', 'OPERATIONAL_CONTROL', 'PERMISSION_CONTROL', 'TOOL_SAFETY', 'UTILITY_PRESERVATION')),
    CONSTRAINT "AuditTestCase_classification_dimension" CHECK (("isUtility" = 1 AND "primaryDimension" = 'UTILITY_PRESERVATION') OR ("isUtility" = 0 AND "primaryDimension" <> 'UTILITY_PRESERVATION')),
    CONSTRAINT "AuditTestCase_capability_json" CHECK (json_valid("applicableCapabilityKeysJson")),
    CONSTRAINT "AuditTestCase_max_steps" CHECK ("maxInteractionSteps" BETWEEN 1 AND 50),
    CONSTRAINT "AuditTestCase_oracle_json" CHECK (json_valid("oracleJson")),
    CONSTRAINT "AuditTestCase_future_contract" CHECK (
        ("objective" IS NULL AND "setupSchemaVersion" IS NULL AND "setupJson" IS NULL AND "stimulusSchemaVersion" IS NULL AND "stimulusJson" IS NULL AND "fixtureVersion" IS NULL AND "budgetSchemaVersion" IS NULL AND "budgetJson" IS NULL)
        OR
        ("objective" IS NOT NULL AND "setupSchemaVersion" IS NOT NULL AND json_valid("setupJson") AND "stimulusSchemaVersion" IS NOT NULL AND json_valid("stimulusJson") AND "fixtureVersion" IS NOT NULL AND "budgetSchemaVersion" IS NOT NULL AND json_valid("budgetJson"))
    ),
    CONSTRAINT "AuditTestCase_fingerprint_sha256" CHECK (length("definitionFingerprint") = 71 AND substr("definitionFingerprint", 1, 7) = 'sha256:' AND substr("definitionFingerprint", 8) NOT GLOB '*[^0-9a-f]*'),
    CONSTRAINT "AuditTestCase_ordinal_nonnegative" CHECK ("ordinal" >= 0)
);

CREATE TABLE "AuditRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentRevisionId" TEXT NOT NULL,
    "agentRevisionFingerprint" TEXT NOT NULL,
    "runPurpose" TEXT NOT NULL,
    "auditPlanId" TEXT,
    "auditPlanFingerprint" TEXT,
    "baselineRunId" TEXT,
    "retryOfRunId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "modelReference" TEXT,
    "modelRequestProfileSchemaVersion" TEXT,
    "modelRequestProfileJson" TEXT,
    "modelRequestProfileDigest" TEXT,
    "liveConsentVersion" TEXT,
    "liveConsentAt" DATETIME,
    "transmissionSummaryDigest" TEXT,
    "status" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL,
    "evaluationPolicyVersion" TEXT NOT NULL,
    "scoringPolicyVersion" TEXT NOT NULL,
    "fixtureVersion" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "budgetSchemaVersion" TEXT NOT NULL,
    "budgetJson" TEXT NOT NULL,
    "plannedCaseCount" INTEGER NOT NULL,
    "completedCaseCount" INTEGER NOT NULL,
    "currentPhase" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "recordVersion" INTEGER NOT NULL,
    "cancellationRequestedAt" DATETIME,
    "failureCode" TEXT,
    "failureSummary" TEXT,
    "createdAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuditRun_revision_fk" FOREIGN KEY ("agentRevisionId") REFERENCES "AgentRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditRun_plan_fk" FOREIGN KEY ("auditPlanId") REFERENCES "AuditPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditRun_baseline_fk" FOREIGN KEY ("baselineRunId") REFERENCES "AuditRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditRun_retry_fk" FOREIGN KEY ("retryOfRunId") REFERENCES "AuditRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditRun_purpose" CHECK ("runPurpose" IN ('BASELINE', 'VERIFICATION', 'SUPPLEMENTAL')),
    CONSTRAINT "AuditRun_mode" CHECK ("mode" IN ('DEMO', 'LIVE')),
    CONSTRAINT "AuditRun_status" CHECK ("status" IN ('QUEUED', 'PLANNING', 'EXECUTING', 'EVALUATING', 'FINALIZING', 'CANCELLING', 'COMPLETED', 'CANCELLED', 'INTERRUPTED', 'FAILED')),
    CONSTRAINT "AuditRun_phase" CHECK ("currentPhase" IN ('QUEUED', 'ANALYZING_SURFACE', 'BUILDING_PLAN', 'RUNNING_TESTS', 'EVALUATING_RESULTS', 'CORRELATING_FINDINGS', 'CALCULATING_SCORES', 'FINALIZING_RESULTS', 'CANCELLING', 'CANCELLED', 'INTERRUPTED', 'COMPLETED', 'FAILED')),
    CONSTRAINT "AuditRun_counts" CHECK ("plannedCaseCount" >= 0 AND "completedCaseCount" >= 0 AND "completedCaseCount" <= "plannedCaseCount"),
    CONSTRAINT "AuditRun_versions" CHECK ("attemptNumber" >= 1 AND "recordVersion" >= 1),
    CONSTRAINT "AuditRun_budget_json" CHECK (json_valid("budgetJson")),
    CONSTRAINT "AuditRun_model_profile_json" CHECK ("modelRequestProfileJson" IS NULL OR json_valid("modelRequestProfileJson")),
    CONSTRAINT "AuditRun_revision_fingerprint" CHECK (length("agentRevisionFingerprint") = 71 AND substr("agentRevisionFingerprint", 1, 7) = 'sha256:' AND substr("agentRevisionFingerprint", 8) NOT GLOB '*[^0-9a-f]*'),
    CONSTRAINT "AuditRun_plan_fingerprint" CHECK ("auditPlanFingerprint" IS NULL OR (length("auditPlanFingerprint") = 71 AND substr("auditPlanFingerprint", 1, 7) = 'sha256:' AND substr("auditPlanFingerprint", 8) NOT GLOB '*[^0-9a-f]*')),
    CONSTRAINT "AuditRun_request_fingerprint" CHECK (length("requestFingerprint") = 71 AND substr("requestFingerprint", 1, 7) = 'sha256:' AND substr("requestFingerprint", 8) NOT GLOB '*[^0-9a-f]*'),
    CONSTRAINT "AuditRun_not_self_reference" CHECK (("baselineRunId" IS NULL OR "baselineRunId" <> "id") AND ("retryOfRunId" IS NULL OR "retryOfRunId" <> "id")),
    CONSTRAINT "AuditRun_baseline_purpose" CHECK (("runPurpose" = 'VERIFICATION' AND "baselineRunId" IS NOT NULL) OR ("runPurpose" <> 'VERIFICATION' AND "baselineRunId" IS NULL)),
    CONSTRAINT "AuditRun_live_configuration" CHECK (
        ("mode" = 'DEMO' AND "modelReference" IS NULL AND "modelRequestProfileSchemaVersion" IS NULL AND "modelRequestProfileJson" IS NULL AND "modelRequestProfileDigest" IS NULL AND "liveConsentVersion" IS NULL AND "liveConsentAt" IS NULL AND "transmissionSummaryDigest" IS NULL) OR
        ("mode" = 'LIVE' AND "modelReference" IS NOT NULL AND "modelRequestProfileSchemaVersion" IS NOT NULL AND "modelRequestProfileJson" IS NOT NULL AND "modelRequestProfileDigest" IS NOT NULL AND "liveConsentVersion" IS NOT NULL AND "liveConsentAt" IS NOT NULL AND "transmissionSummaryDigest" IS NOT NULL)
    ),
    CONSTRAINT "AuditRun_terminal_timestamp" CHECK (("status" IN ('COMPLETED', 'CANCELLED', 'FAILED') AND "completedAt" IS NOT NULL) OR ("status" NOT IN ('COMPLETED', 'CANCELLED', 'FAILED') AND "completedAt" IS NULL))
);

CREATE TABLE "AuditJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditRunId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "leaseOwner" TEXT,
    "leaseExpiresAt" DATETIME,
    "nextAttemptAt" DATETIME,
    "attemptCount" INTEGER NOT NULL,
    "recordVersion" INTEGER NOT NULL,
    "lastErrorCode" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuditJob_run_fk" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditJob_status" CHECK ("status" IN ('QUEUED', 'LEASED', 'WAITING_RETRY', 'TERMINAL')),
    CONSTRAINT "AuditJob_counts" CHECK ("attemptCount" >= 0 AND "recordVersion" >= 1),
    CONSTRAINT "AuditJob_lease_shape" CHECK (("status" = 'LEASED' AND "leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL) OR ("status" <> 'LEASED' AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL)),
    CONSTRAINT "AuditJob_retry_shape" CHECK (("status" = 'WAITING_RETRY' AND "nextAttemptAt" IS NOT NULL) OR ("status" <> 'WAITING_RETRY' AND "nextAttemptAt" IS NULL))
);

CREATE TABLE "TestExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditRunId" TEXT NOT NULL,
    "auditPlanId" TEXT NOT NULL,
    "auditTestCaseId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "outcome" TEXT,
    "skipReasonCode" TEXT,
    "isEffective" BOOLEAN NOT NULL,
    "seed" TEXT NOT NULL,
    "stepCount" INTEGER NOT NULL,
    "toolAttemptCount" INTEGER NOT NULL,
    "usageSchemaVersion" TEXT NOT NULL,
    "usageJson" TEXT NOT NULL,
    "terminalReason" TEXT,
    "errorCode" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "TestExecution_plan_fk" FOREIGN KEY ("auditPlanId") REFERENCES "AuditPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestExecution_case_same_plan_fk" FOREIGN KEY ("auditTestCaseId", "auditPlanId") REFERENCES "AuditTestCase" ("id", "auditPlanId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestExecution_run_same_plan_fk" FOREIGN KEY ("auditRunId", "auditPlanId") REFERENCES "AuditRun" ("id", "auditPlanId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestExecution_attempt_positive" CHECK ("attemptNumber" >= 1),
    CONSTRAINT "TestExecution_status" CHECK ("status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'ERRORED', 'INTERRUPTED', 'SKIPPED', 'CANCELLED')),
    CONSTRAINT "TestExecution_outcome" CHECK ("outcome" IS NULL OR "outcome" IN ('PASS', 'WARNING', 'FAIL', 'INCONCLUSIVE')),
    CONSTRAINT "TestExecution_skip_reason" CHECK ("skipReasonCode" IS NULL OR "skipReasonCode" IN ('NON_APPLICABLE', 'BUDGET_EXHAUSTED', 'DEPENDENCY_UNAVAILABLE')),
    CONSTRAINT "TestExecution_boolean" CHECK ("isEffective" IN (0, 1)),
    CONSTRAINT "TestExecution_effective_terminal" CHECK ("isEffective" = 0 OR "status" IN ('COMPLETED', 'ERRORED', 'INTERRUPTED', 'SKIPPED', 'CANCELLED')),
    CONSTRAINT "TestExecution_counts" CHECK ("stepCount" >= 0 AND "toolAttemptCount" >= 0),
    CONSTRAINT "TestExecution_usage_json" CHECK (json_valid("usageJson")),
    CONSTRAINT "TestExecution_result_shape" CHECK (
        ("status" = 'COMPLETED' AND "outcome" IS NOT NULL AND "skipReasonCode" IS NULL AND "completedAt" IS NOT NULL) OR
        ("status" = 'SKIPPED' AND "outcome" IS NULL AND "skipReasonCode" IS NOT NULL AND "completedAt" IS NOT NULL) OR
        ("status" IN ('ERRORED', 'INTERRUPTED', 'CANCELLED') AND "outcome" IS NULL AND "skipReasonCode" IS NULL AND "completedAt" IS NOT NULL) OR
        ("status" IN ('PENDING', 'RUNNING') AND "outcome" IS NULL AND "skipReasonCode" IS NULL AND "completedAt" IS NULL)
    )
);

CREATE TABLE "TraceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testExecutionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "payloadSchemaVersion" TEXT NOT NULL,
    "sanitizedPayloadJson" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "TraceEvent_execution_fk" FOREIGN KEY ("testExecutionId") REFERENCES "TestExecution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TraceEvent_sequence_positive" CHECK ("sequence" >= 1),
    CONSTRAINT "TraceEvent_type" CHECK ("eventType" IN ('ASSERTION_RESULT', 'ERROR', 'EVALUATOR_DECISION', 'MESSAGE', 'MODEL_RESPONSE', 'PERMISSION_DECISION', 'REDACTION_EVENT', 'SIMULATOR_OUTCOME', 'TOOL_CALL_ATTEMPT')),
    CONSTRAINT "TraceEvent_actor" CHECK ("actor" IN ('AUDITOR', 'MODEL', 'POLICY', 'SIMULATOR', 'SYSTEM', 'TARGET', 'USER')),
    CONSTRAINT "TraceEvent_payload_json" CHECK (json_valid("sanitizedPayloadJson") AND length("sanitizedPayloadJson") <= 65536),
    CONSTRAINT "TraceEvent_digest_sha256" CHECK (length("contentDigest") = 71 AND substr("contentDigest", 1, 7) = 'sha256:' AND substr("contentDigest", 8) NOT GLOB '*[^0-9a-f]*')
);

CREATE TABLE "EvidenceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditRunId" TEXT NOT NULL,
    "testExecutionId" TEXT,
    "kind" TEXT NOT NULL,
    "sourceSequenceStart" INTEGER,
    "sourceSequenceEnd" INTEGER,
    "contentDigest" TEXT NOT NULL,
    "sanitizedExcerpt" TEXT NOT NULL,
    "redactionApplied" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "EvidenceRecord_run_fk" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvidenceRecord_execution_same_run_fk" FOREIGN KEY ("testExecutionId", "auditRunId") REFERENCES "TestExecution" ("id", "auditRunId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvidenceRecord_kind" CHECK ("kind" IN ('ASSERTION_RESULT', 'EVALUATOR_DECISION', 'PERMISSION_DECISION', 'REDACTION_EVENT', 'SIMULATOR_OUTCOME', 'TOOL_CALL_ATTEMPT', 'TRANSCRIPT_OBSERVATION')),
    CONSTRAINT "EvidenceRecord_excerpt_bounds" CHECK (length("sanitizedExcerpt") BETWEEN 1 AND 2000),
    CONSTRAINT "EvidenceRecord_digest_sha256" CHECK (length("contentDigest") = 71 AND substr("contentDigest", 1, 7) = 'sha256:' AND substr("contentDigest", 8) NOT GLOB '*[^0-9a-f]*'),
    CONSTRAINT "EvidenceRecord_redaction_boolean" CHECK ("redactionApplied" IN (0, 1)),
    CONSTRAINT "EvidenceRecord_provenance" CHECK (
        ("testExecutionId" IS NULL AND "sourceSequenceStart" IS NULL AND "sourceSequenceEnd" IS NULL)
        OR
        ("testExecutionId" IS NOT NULL AND "sourceSequenceStart" >= 1 AND "sourceSequenceEnd" >= "sourceSequenceStart")
    )
);

CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditRunId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "evaluationPolicyVersion" TEXT NOT NULL,
    "failureMechanism" TEXT NOT NULL,
    "riskCategory" TEXT NOT NULL,
    "primaryDimension" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "affectedTestKeysSchemaVersion" TEXT NOT NULL,
    "affectedTestKeysJson" TEXT NOT NULL,
    "capabilityKeysSchemaVersion" TEXT NOT NULL,
    "capabilityKeysJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "Finding_run_fk" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Finding_severity" CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT "Finding_confidence" CHECK ("confidence" IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT "Finding_affected_tests_json" CHECK (json_valid("affectedTestKeysJson") AND json_type("affectedTestKeysJson") = 'array' AND json_array_length("affectedTestKeysJson") >= 1),
    CONSTRAINT "Finding_capability_json" CHECK (json_valid("capabilityKeysJson")),
    CONSTRAINT "Finding_fingerprint_sha256" CHECK (length("fingerprint") = 71 AND substr("fingerprint", 1, 7) = 'sha256:' AND substr("fingerprint", 8) NOT GLOB '*[^0-9a-f]*')
);

CREATE TABLE "FindingEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditRunId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "evidenceRecordId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    CONSTRAINT "FindingEvidence_finding_same_run_fk" FOREIGN KEY ("findingId", "auditRunId") REFERENCES "Finding" ("id", "auditRunId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FindingEvidence_evidence_same_run_fk" FOREIGN KEY ("evidenceRecordId", "auditRunId") REFERENCES "EvidenceRecord" ("id", "auditRunId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FindingEvidence_ordinal_nonnegative" CHECK ("ordinal" >= 0)
);

CREATE TABLE "Scorecard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditRunId" TEXT NOT NULL,
    "scoringPolicyVersion" TEXT NOT NULL,
    "overallSecurityScoreBps" INTEGER,
    "utilityScoreBps" INTEGER,
    "securityCoverageBps" INTEGER,
    "utilityCoverageBps" INTEGER,
    "highImpactSurfaceCoverageBps" INTEGER,
    "applicableHighImpactCapabilityCount" INTEGER NOT NULL,
    "coveredHighImpactCapabilityCount" INTEGER NOT NULL,
    "unresolvedHighImpactLimitationCount" INTEGER NOT NULL,
    "readiness" TEXT NOT NULL,
    "securityProvisional" BOOLEAN NOT NULL,
    "utilityProvisional" BOOLEAN NOT NULL,
    "securityApplicableWeight" INTEGER NOT NULL,
    "securityScorableWeight" INTEGER NOT NULL,
    "utilityApplicableWeight" INTEGER NOT NULL,
    "utilityScorableWeight" INTEGER NOT NULL,
    "calculationSchemaVersion" TEXT NOT NULL,
    "calculationJson" TEXT NOT NULL,
    "calculationDigest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "Scorecard_run_fk" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Scorecard_security_score" CHECK ("overallSecurityScoreBps" IS NULL OR "overallSecurityScoreBps" BETWEEN 0 AND 10000),
    CONSTRAINT "Scorecard_utility_score" CHECK ("utilityScoreBps" IS NULL OR "utilityScoreBps" BETWEEN 0 AND 10000),
    CONSTRAINT "Scorecard_security_coverage" CHECK ("securityCoverageBps" IS NULL OR "securityCoverageBps" BETWEEN 0 AND 10000),
    CONSTRAINT "Scorecard_utility_coverage" CHECK ("utilityCoverageBps" IS NULL OR "utilityCoverageBps" BETWEEN 0 AND 10000),
    CONSTRAINT "Scorecard_surface_coverage" CHECK ("highImpactSurfaceCoverageBps" IS NULL OR "highImpactSurfaceCoverageBps" BETWEEN 0 AND 10000),
    CONSTRAINT "Scorecard_capability_counts" CHECK ("applicableHighImpactCapabilityCount" >= 0 AND "coveredHighImpactCapabilityCount" >= 0 AND "coveredHighImpactCapabilityCount" <= "applicableHighImpactCapabilityCount" AND "unresolvedHighImpactLimitationCount" >= 0),
    CONSTRAINT "Scorecard_readiness" CHECK ("readiness" IN ('BLOCKED', 'REVIEW_REQUIRED', 'NO_BLOCKING_FAILURE_OBSERVED')),
    CONSTRAINT "Scorecard_provisional_booleans" CHECK ("securityProvisional" IN (0, 1) AND "utilityProvisional" IN (0, 1)),
    CONSTRAINT "Scorecard_security_weights" CHECK ("securityApplicableWeight" >= 0 AND "securityScorableWeight" >= 0 AND "securityScorableWeight" <= "securityApplicableWeight"),
    CONSTRAINT "Scorecard_utility_weights" CHECK ("utilityApplicableWeight" >= 0 AND "utilityScorableWeight" >= 0 AND "utilityScorableWeight" <= "utilityApplicableWeight"),
    CONSTRAINT "Scorecard_calculation_json" CHECK (json_valid("calculationJson")),
    CONSTRAINT "Scorecard_digest_sha256" CHECK (length("calculationDigest") = 71 AND substr("calculationDigest", 1, 7) = 'sha256:' AND substr("calculationDigest", 8) NOT GLOB '*[^0-9a-f]*'),
    CONSTRAINT "Scorecard_readiness_limit" CHECK ("readiness" <> 'NO_BLOCKING_FAILURE_OBSERVED' OR "unresolvedHighImpactLimitationCount" = 0)
);

CREATE TABLE "DimensionScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scorecardId" TEXT NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "isUtility" BOOLEAN NOT NULL,
    "scoreBps" INTEGER,
    "coverageBps" INTEGER,
    "applicableWeight" INTEGER NOT NULL,
    "scorableWeight" INTEGER NOT NULL,
    "observedRiskUnits" INTEGER NOT NULL,
    "possibleRiskUnits" INTEGER NOT NULL,
    "resultSchemaVersion" TEXT NOT NULL,
    "resultCountsJson" TEXT NOT NULL,
    "calculationDigest" TEXT NOT NULL,
    CONSTRAINT "DimensionScore_scorecard_fk" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DimensionScore_boolean" CHECK ("isUtility" IN (0, 1)),
    CONSTRAINT "DimensionScore_score" CHECK ("scoreBps" IS NULL OR "scoreBps" BETWEEN 0 AND 10000),
    CONSTRAINT "DimensionScore_coverage" CHECK ("coverageBps" IS NULL OR "coverageBps" BETWEEN 0 AND 10000),
    CONSTRAINT "DimensionScore_weights" CHECK ("applicableWeight" >= 0 AND "scorableWeight" >= 0 AND "scorableWeight" <= "applicableWeight"),
    CONSTRAINT "DimensionScore_risk_units" CHECK ("observedRiskUnits" >= 0 AND "possibleRiskUnits" >= 0 AND "observedRiskUnits" <= "possibleRiskUnits"),
    CONSTRAINT "DimensionScore_result_json" CHECK (json_valid("resultCountsJson")),
    CONSTRAINT "DimensionScore_digest_sha256" CHECK (length("calculationDigest") = 71 AND substr("calculationDigest", 1, 7) = 'sha256:' AND substr("calculationDigest", 8) NOT GLOB '*[^0-9a-f]*')
);

CREATE TABLE "GuardrailSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceAuditRunId" TEXT NOT NULL,
    "sourceAgentRevisionId" TEXT NOT NULL,
    "sourceRevisionFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "appliedAgentRevisionId" TEXT,
    "recordVersion" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "appliedAt" DATETIME,
    CONSTRAINT "GuardrailSet_run_fk" FOREIGN KEY ("sourceAuditRunId") REFERENCES "AuditRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuardrailSet_source_revision_fk" FOREIGN KEY ("sourceAgentRevisionId") REFERENCES "AgentRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuardrailSet_applied_revision_fk" FOREIGN KEY ("appliedAgentRevisionId") REFERENCES "AgentRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuardrailSet_status" CHECK ("status" IN ('PROPOSED', 'IN_REVIEW', 'READY', 'REJECTED', 'APPLIED')),
    CONSTRAINT "GuardrailSet_record_version" CHECK ("recordVersion" >= 1),
    CONSTRAINT "GuardrailSet_fingerprint_sha256" CHECK (length("sourceRevisionFingerprint") = 71 AND substr("sourceRevisionFingerprint", 1, 7) = 'sha256:' AND substr("sourceRevisionFingerprint", 8) NOT GLOB '*[^0-9a-f]*'),
    CONSTRAINT "GuardrailSet_applied_shape" CHECK (("status" = 'APPLIED' AND "appliedAgentRevisionId" IS NOT NULL AND "appliedAt" IS NOT NULL) OR ("status" <> 'APPLIED' AND "appliedAgentRevisionId" IS NULL AND "appliedAt" IS NULL))
);

CREATE TABLE "GuardrailProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guardrailSetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "defenseInDepthRationale" TEXT,
    "expectedEffect" TEXT NOT NULL,
    "tradeOffs" TEXT NOT NULL,
    "riskOfBehaviorChange" TEXT NOT NULL,
    "changeSchemaVersion" TEXT NOT NULL,
    "proposedChangeJson" TEXT NOT NULL,
    "expectedSourceFingerprint" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GuardrailProposal_set_fk" FOREIGN KEY ("guardrailSetId") REFERENCES "GuardrailSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuardrailProposal_status" CHECK ("status" IN ('PROPOSED', 'ACCEPTED', 'REJECTED', 'EDITED', 'APPLIED')),
    CONSTRAINT "GuardrailProposal_risk" CHECK ("riskOfBehaviorChange" IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT "GuardrailProposal_change_json" CHECK (json_valid("proposedChangeJson")),
    CONSTRAINT "GuardrailProposal_fingerprint_sha256" CHECK (length("expectedSourceFingerprint") = 71 AND substr("expectedSourceFingerprint", 1, 7) = 'sha256:' AND substr("expectedSourceFingerprint", 8) NOT GLOB '*[^0-9a-f]*'),
    CONSTRAINT "GuardrailProposal_order" CHECK ("priority" >= 0 AND "ordinal" >= 0)
);

CREATE TABLE "GuardrailFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guardrailProposalId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    CONSTRAINT "GuardrailFinding_proposal_fk" FOREIGN KEY ("guardrailProposalId") REFERENCES "GuardrailProposal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuardrailFinding_finding_fk" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AuditComparison" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "baselineRunId" TEXT NOT NULL,
    "verificationRunId" TEXT NOT NULL,
    "supplementalRunId" TEXT,
    "supplementalPlanFingerprint" TEXT,
    "compatibilityStatus" TEXT NOT NULL,
    "compatibilitySchemaVersion" TEXT NOT NULL,
    "compatibilityReasonsJson" TEXT NOT NULL,
    "baselinePairedSecurityScoreBps" INTEGER,
    "verificationPairedSecurityScoreBps" INTEGER,
    "securityDeltaBps" INTEGER,
    "pairedSecurityCoverageBps" INTEGER,
    "pairedSecurityProvisional" BOOLEAN,
    "fullRunCoverageDeltaBps" INTEGER,
    "baselinePairedUtilityScoreBps" INTEGER,
    "verificationPairedUtilityScoreBps" INTEGER,
    "pairedUtilityCoverageBps" INTEGER,
    "pairedUtilityProvisional" BOOLEAN,
    "utilityDeltaBps" INTEGER,
    "readinessChange" TEXT,
    "summarySchemaVersion" TEXT NOT NULL,
    "supplementalSummaryJson" TEXT,
    "calculationDigest" TEXT,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "AuditComparison_baseline_fk" FOREIGN KEY ("baselineRunId") REFERENCES "AuditRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditComparison_verification_fk" FOREIGN KEY ("verificationRunId") REFERENCES "AuditRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditComparison_supplemental_fk" FOREIGN KEY ("supplementalRunId") REFERENCES "AuditRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditComparison_distinct_runs" CHECK ("baselineRunId" <> "verificationRunId" AND ("supplementalRunId" IS NULL OR ("supplementalRunId" <> "baselineRunId" AND "supplementalRunId" <> "verificationRunId"))),
    CONSTRAINT "AuditComparison_compatibility" CHECK ("compatibilityStatus" IN ('COMPATIBLE', 'INCOMPATIBLE') AND json_valid("compatibilityReasonsJson") AND json_type("compatibilityReasonsJson") = 'array' AND (("compatibilityStatus" = 'COMPATIBLE' AND json_array_length("compatibilityReasonsJson") = 0) OR ("compatibilityStatus" = 'INCOMPATIBLE' AND json_array_length("compatibilityReasonsJson") > 0))),
    CONSTRAINT "AuditComparison_supplemental_shape" CHECK (("supplementalRunId" IS NULL AND "supplementalPlanFingerprint" IS NULL AND "supplementalSummaryJson" IS NULL) OR ("supplementalRunId" IS NOT NULL AND "supplementalPlanFingerprint" IS NOT NULL AND "supplementalSummaryJson" IS NOT NULL AND json_valid("supplementalSummaryJson"))),
    CONSTRAINT "AuditComparison_supplemental_fingerprint" CHECK ("supplementalPlanFingerprint" IS NULL OR (length("supplementalPlanFingerprint") = 71 AND substr("supplementalPlanFingerprint", 1, 7) = 'sha256:' AND substr("supplementalPlanFingerprint", 8) NOT GLOB '*[^0-9a-f]*')),
    CONSTRAINT "AuditComparison_security_scores" CHECK (("baselinePairedSecurityScoreBps" IS NULL OR "baselinePairedSecurityScoreBps" BETWEEN 0 AND 10000) AND ("verificationPairedSecurityScoreBps" IS NULL OR "verificationPairedSecurityScoreBps" BETWEEN 0 AND 10000)),
    CONSTRAINT "AuditComparison_utility_scores" CHECK (("baselinePairedUtilityScoreBps" IS NULL OR "baselinePairedUtilityScoreBps" BETWEEN 0 AND 10000) AND ("verificationPairedUtilityScoreBps" IS NULL OR "verificationPairedUtilityScoreBps" BETWEEN 0 AND 10000)),
    CONSTRAINT "AuditComparison_coverages" CHECK (("pairedSecurityCoverageBps" IS NULL OR "pairedSecurityCoverageBps" BETWEEN 0 AND 10000) AND ("pairedUtilityCoverageBps" IS NULL OR "pairedUtilityCoverageBps" BETWEEN 0 AND 10000) AND ("fullRunCoverageDeltaBps" IS NULL OR "fullRunCoverageDeltaBps" BETWEEN -10000 AND 10000)),
    CONSTRAINT "AuditComparison_deltas" CHECK (("securityDeltaBps" IS NULL OR "securityDeltaBps" BETWEEN -10000 AND 10000) AND ("utilityDeltaBps" IS NULL OR "utilityDeltaBps" BETWEEN -10000 AND 10000)),
    CONSTRAINT "AuditComparison_compatible_shape" CHECK (
        ("compatibilityStatus" = 'COMPATIBLE' AND "pairedSecurityCoverageBps" IS NOT NULL AND "pairedSecurityProvisional" IS NOT NULL AND "pairedUtilityCoverageBps" IS NOT NULL AND "pairedUtilityProvisional" IS NOT NULL AND "readinessChange" IS NOT NULL AND "calculationDigest" IS NOT NULL) OR
        ("compatibilityStatus" = 'INCOMPATIBLE' AND "baselinePairedSecurityScoreBps" IS NULL AND "verificationPairedSecurityScoreBps" IS NULL AND "securityDeltaBps" IS NULL AND "pairedSecurityCoverageBps" IS NULL AND "pairedSecurityProvisional" IS NULL AND "fullRunCoverageDeltaBps" IS NULL AND "baselinePairedUtilityScoreBps" IS NULL AND "verificationPairedUtilityScoreBps" IS NULL AND "pairedUtilityCoverageBps" IS NULL AND "pairedUtilityProvisional" IS NULL AND "utilityDeltaBps" IS NULL AND "readinessChange" IS NULL AND "calculationDigest" IS NULL AND "supplementalRunId" IS NULL)
    ),
    CONSTRAINT "AuditComparison_digest_sha256" CHECK ("calculationDigest" IS NULL OR (length("calculationDigest") = 71 AND substr("calculationDigest", 1, 7) = 'sha256:' AND substr("calculationDigest", 8) NOT GLOB '*[^0-9a-f]*'))
);

CREATE TABLE "ComparisonCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditComparisonId" TEXT NOT NULL,
    "stableTestKey" TEXT NOT NULL,
    "definitionFingerprint" TEXT NOT NULL,
    "baselineExecutionId" TEXT NOT NULL,
    "verificationExecutionId" TEXT NOT NULL,
    "baselineOutcome" TEXT NOT NULL,
    "verificationOutcome" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "includedInPairedScore" BOOLEAN NOT NULL,
    "severityWeight" INTEGER NOT NULL,
    "baselineRiskUnits" INTEGER NOT NULL,
    "verificationRiskUnits" INTEGER NOT NULL,
    "isUtility" BOOLEAN NOT NULL,
    "ordinal" INTEGER NOT NULL,
    CONSTRAINT "ComparisonCase_comparison_fk" FOREIGN KEY ("auditComparisonId") REFERENCES "AuditComparison" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComparisonCase_baseline_execution_fk" FOREIGN KEY ("baselineExecutionId") REFERENCES "TestExecution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComparisonCase_verification_execution_fk" FOREIGN KEY ("verificationExecutionId") REFERENCES "TestExecution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComparisonCase_outcomes" CHECK ("baselineOutcome" IN ('PASS', 'WARNING', 'FAIL', 'INCONCLUSIVE') AND "verificationOutcome" IN ('PASS', 'WARNING', 'FAIL', 'INCONCLUSIVE')),
    CONSTRAINT "ComparisonCase_classification" CHECK ("classification" IN ('IMPROVED', 'UNCHANGED', 'REGRESSED', 'INCONCLUSIVE', 'UNPAIRED')),
    CONSTRAINT "ComparisonCase_booleans" CHECK ("includedInPairedScore" IN (0, 1) AND "isUtility" IN (0, 1)),
    CONSTRAINT "ComparisonCase_weights" CHECK ("severityWeight" IN (1, 3, 7, 12) AND "baselineRiskUnits" >= 0 AND "verificationRiskUnits" >= 0),
    CONSTRAINT "ComparisonCase_fingerprint_sha256" CHECK (length("definitionFingerprint") = 71 AND substr("definitionFingerprint", 1, 7) = 'sha256:' AND substr("definitionFingerprint", 8) NOT GLOB '*[^0-9a-f]*'),
    CONSTRAINT "ComparisonCase_ordinal_nonnegative" CHECK ("ordinal" >= 0)
);

CREATE TABLE "FindingMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditComparisonId" TEXT NOT NULL,
    "baselineFindingId" TEXT,
    "verificationFindingId" TEXT,
    "classification" TEXT NOT NULL,
    "matchConfidence" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    CONSTRAINT "FindingMatch_comparison_fk" FOREIGN KEY ("auditComparisonId") REFERENCES "AuditComparison" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FindingMatch_baseline_finding_fk" FOREIGN KEY ("baselineFindingId") REFERENCES "Finding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FindingMatch_verification_finding_fk" FOREIGN KEY ("verificationFindingId") REFERENCES "Finding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FindingMatch_has_finding" CHECK ("baselineFindingId" IS NOT NULL OR "verificationFindingId" IS NOT NULL),
    CONSTRAINT "FindingMatch_classification" CHECK ("classification" IN ('RESOLVED', 'PERSISTING', 'REGRESSED', 'NEW', 'NOT_OBSERVED')),
    CONSTRAINT "FindingMatch_confidence" CHECK ("matchConfidence" IN ('LOW', 'MEDIUM', 'HIGH'))
);

CREATE UNIQUE INDEX "AgentRevision_agentProfileId_revisionNumber_key" ON "AgentRevision" ("agentProfileId", "revisionNumber");
CREATE UNIQUE INDEX "AgentRevision_id_agentProfileId_key" ON "AgentRevision" ("id", "agentProfileId");
CREATE UNIQUE INDEX "ToolDefinition_agentRevisionId_name_key" ON "ToolDefinition" ("agentRevisionId", "name");
CREATE UNIQUE INDEX "ToolDefinition_agentRevisionId_capabilityKey_key" ON "ToolDefinition" ("agentRevisionId", "capabilityKey");
CREATE UNIQUE INDEX "ToolDefinition_agentRevisionId_ordinal_key" ON "ToolDefinition" ("agentRevisionId", "ordinal");
CREATE UNIQUE INDEX "ToolDefinition_agentRevisionId_fingerprint_key" ON "ToolDefinition" ("agentRevisionId", "fingerprint");
CREATE UNIQUE INDEX "ToolDefinition_id_agentRevisionId_key" ON "ToolDefinition" ("id", "agentRevisionId");
CREATE UNIQUE INDEX "PermissionGrant_agentRevisionId_ordinal_key" ON "PermissionGrant" ("agentRevisionId", "ordinal");
CREATE UNIQUE INDEX "PermissionGrant_agentRevisionId_fingerprint_key" ON "PermissionGrant" ("agentRevisionId", "fingerprint");
CREATE UNIQUE INDEX "AuditPlan_agentRevisionId_fingerprint_key" ON "AuditPlan" ("agentRevisionId", "fingerprint");
CREATE UNIQUE INDEX "RiskHypothesis_auditPlanId_ordinal_key" ON "RiskHypothesis" ("auditPlanId", "ordinal");
CREATE UNIQUE INDEX "RiskHypothesis_id_auditPlanId_key" ON "RiskHypothesis" ("id", "auditPlanId");
CREATE UNIQUE INDEX "AuditTestCase_auditPlanId_stableKey_key" ON "AuditTestCase" ("auditPlanId", "stableKey");
CREATE UNIQUE INDEX "AuditTestCase_auditPlanId_ordinal_key" ON "AuditTestCase" ("auditPlanId", "ordinal");
CREATE UNIQUE INDEX "AuditTestCase_id_auditPlanId_key" ON "AuditTestCase" ("id", "auditPlanId");
CREATE UNIQUE INDEX "AuditRun_idempotencyKey_key" ON "AuditRun" ("idempotencyKey");
CREATE UNIQUE INDEX "AuditRun_id_auditPlanId_key" ON "AuditRun" ("id", "auditPlanId");
CREATE UNIQUE INDEX "AuditJob_auditRunId_key" ON "AuditJob" ("auditRunId");
CREATE UNIQUE INDEX "TestExecution_auditRunId_auditTestCaseId_attemptNumber_key" ON "TestExecution" ("auditRunId", "auditTestCaseId", "attemptNumber");
CREATE UNIQUE INDEX "TestExecution_id_auditRunId_key" ON "TestExecution" ("id", "auditRunId");
CREATE UNIQUE INDEX "TestExecution_one_active_per_case" ON "TestExecution" ("auditRunId", "auditTestCaseId") WHERE "status" IN ('PENDING', 'RUNNING');
CREATE UNIQUE INDEX "TestExecution_one_effective_per_case" ON "TestExecution" ("auditRunId", "auditTestCaseId") WHERE "isEffective" = 1;
CREATE UNIQUE INDEX "TraceEvent_testExecutionId_sequence_key" ON "TraceEvent" ("testExecutionId", "sequence");
CREATE UNIQUE INDEX "EvidenceRecord_id_auditRunId_key" ON "EvidenceRecord" ("id", "auditRunId");
CREATE UNIQUE INDEX "Finding_auditRunId_fingerprint_key" ON "Finding" ("auditRunId", "fingerprint");
CREATE UNIQUE INDEX "Finding_id_auditRunId_key" ON "Finding" ("id", "auditRunId");
CREATE UNIQUE INDEX "FindingEvidence_findingId_evidenceRecordId_key" ON "FindingEvidence" ("findingId", "evidenceRecordId");
CREATE UNIQUE INDEX "FindingEvidence_findingId_ordinal_key" ON "FindingEvidence" ("findingId", "ordinal");
CREATE UNIQUE INDEX "Scorecard_auditRunId_key" ON "Scorecard" ("auditRunId");
CREATE UNIQUE INDEX "DimensionScore_scorecardId_dimensionKey_key" ON "DimensionScore" ("scorecardId", "dimensionKey");
CREATE UNIQUE INDEX "GuardrailProposal_guardrailSetId_ordinal_key" ON "GuardrailProposal" ("guardrailSetId", "ordinal");
CREATE UNIQUE INDEX "GuardrailFinding_guardrailProposalId_findingId_key" ON "GuardrailFinding" ("guardrailProposalId", "findingId");
CREATE UNIQUE INDEX "AuditComparison_baselineRunId_verificationRunId_key" ON "AuditComparison" ("baselineRunId", "verificationRunId");
CREATE UNIQUE INDEX "ComparisonCase_auditComparisonId_stableTestKey_key" ON "ComparisonCase" ("auditComparisonId", "stableTestKey");
CREATE UNIQUE INDEX "ComparisonCase_auditComparisonId_ordinal_key" ON "ComparisonCase" ("auditComparisonId", "ordinal");

CREATE INDEX "AgentProfile_archivedAt_updatedAt_idx" ON "AgentProfile" ("archivedAt", "updatedAt" DESC);
CREATE INDEX "AgentProfile_normalizedName_idx" ON "AgentProfile" ("normalizedName");
CREATE INDEX "AgentRevision_agentProfileId_revisionNumber_idx" ON "AgentRevision" ("agentProfileId", "revisionNumber" DESC);
CREATE INDEX "AgentRevision_agentProfileId_createdAt_idx" ON "AgentRevision" ("agentProfileId", "createdAt" DESC);
CREATE INDEX "AgentRevision_agentProfileId_fingerprint_idx" ON "AgentRevision" ("agentProfileId", "fingerprint");
CREATE INDEX "ToolDefinition_simulatorId_idx" ON "ToolDefinition" ("simulatorId");
CREATE INDEX "PermissionGrant_agentRevisionId_capabilityKey_idx" ON "PermissionGrant" ("agentRevisionId", "capabilityKey");
CREATE INDEX "AuditPlan_agentRevisionId_createdAt_idx" ON "AuditPlan" ("agentRevisionId", "createdAt" DESC);
CREATE INDEX "AuditPlan_kind_status_createdAt_idx" ON "AuditPlan" ("kind", "status", "createdAt");
CREATE INDEX "AuditPlan_status_createdAt_idx" ON "AuditPlan" ("status", "createdAt");
CREATE INDEX "RiskHypothesis_auditPlanId_primaryDimension_idx" ON "RiskHypothesis" ("auditPlanId", "primaryDimension");
CREATE INDEX "AuditTestCase_auditPlanId_primaryDimension_severity_idx" ON "AuditTestCase" ("auditPlanId", "primaryDimension", "severity");
CREATE INDEX "AuditRun_status_updatedAt_idx" ON "AuditRun" ("status", "updatedAt");
CREATE INDEX "AuditRun_agentRevisionId_createdAt_idx" ON "AuditRun" ("agentRevisionId", "createdAt" DESC);
CREATE INDEX "AuditRun_auditPlanId_createdAt_idx" ON "AuditRun" ("auditPlanId", "createdAt");
CREATE INDEX "AuditRun_baselineRunId_idx" ON "AuditRun" ("baselineRunId");
CREATE INDEX "AuditRun_retryOfRunId_idx" ON "AuditRun" ("retryOfRunId");
CREATE INDEX "AuditJob_status_nextAttemptAt_createdAt_idx" ON "AuditJob" ("status", "nextAttemptAt", "createdAt");
CREATE INDEX "AuditJob_leaseExpiresAt_idx" ON "AuditJob" ("leaseExpiresAt");
CREATE INDEX "TestExecution_auditRunId_status_idx" ON "TestExecution" ("auditRunId", "status");
CREATE INDEX "TestExecution_auditTestCaseId_idx" ON "TestExecution" ("auditTestCaseId");
CREATE INDEX "TestExecution_auditRunId_outcome_idx" ON "TestExecution" ("auditRunId", "outcome");
CREATE INDEX "TraceEvent_testExecutionId_eventType_idx" ON "TraceEvent" ("testExecutionId", "eventType");
CREATE INDEX "EvidenceRecord_testExecutionId_idx" ON "EvidenceRecord" ("testExecutionId");
CREATE INDEX "EvidenceRecord_auditRunId_kind_idx" ON "EvidenceRecord" ("auditRunId", "kind");
CREATE INDEX "EvidenceRecord_auditRunId_contentDigest_idx" ON "EvidenceRecord" ("auditRunId", "contentDigest");
CREATE INDEX "Finding_auditRunId_severity_idx" ON "Finding" ("auditRunId", "severity");
CREATE INDEX "Finding_auditRunId_primaryDimension_idx" ON "Finding" ("auditRunId", "primaryDimension");
CREATE INDEX "Finding_riskCategory_severity_idx" ON "Finding" ("riskCategory", "severity");
CREATE INDEX "GuardrailSet_sourceAuditRunId_createdAt_idx" ON "GuardrailSet" ("sourceAuditRunId", "createdAt" DESC);
CREATE INDEX "GuardrailSet_sourceAuditRunId_status_idx" ON "GuardrailSet" ("sourceAuditRunId", "status");
CREATE INDEX "GuardrailProposal_guardrailSetId_status_idx" ON "GuardrailProposal" ("guardrailSetId", "status");
CREATE INDEX "AuditComparison_verificationRunId_idx" ON "AuditComparison" ("verificationRunId");
CREATE INDEX "AuditComparison_supplementalRunId_idx" ON "AuditComparison" ("supplementalRunId");
CREATE INDEX "FindingMatch_auditComparisonId_classification_idx" ON "FindingMatch" ("auditComparisonId", "classification");
