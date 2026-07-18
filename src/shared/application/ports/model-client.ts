export type ModelPurpose =
  "EVIDENCE_EVALUATION" | "GUARDRAIL_DRAFT" | "SURFACE_ANALYSIS" | "TEST_PLANNING";

export interface ModelUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface StructuredModelRequest<Output> {
  readonly abortSignal?: AbortSignal;
  readonly input: string;
  readonly instructions: string;
  readonly outputBudget: number;
  readonly purpose: ModelPurpose;
  readonly timeoutMs: number;
  readonly validate: (value: unknown) => Output;
}

export type StructuredModelResult<Output> =
  | {
      readonly kind: "malformed-output";
      readonly safeErrorCode: "PROVIDER_MALFORMED_OUTPUT";
      readonly usage?: ModelUsage;
    }
  | {
      readonly kind: "provider-error";
      readonly retryable: boolean;
      readonly safeErrorCode: string;
    }
  | {
      readonly kind: "success";
      readonly output: Output;
      readonly providerRequestId?: string;
      readonly usage?: ModelUsage;
    };

export interface ModelClient {
  generateStructured<Output>(
    request: StructuredModelRequest<Output>,
  ): Promise<StructuredModelResult<Output>>;
}
