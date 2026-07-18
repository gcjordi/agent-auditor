import type {
  ModelClient,
  ModelPurpose,
  StructuredModelRequest,
  StructuredModelResult,
} from "@/shared/application/ports/model-client";

export type DemoFixtureFactory = (purpose: ModelPurpose) => unknown;

/**
 * A deterministic structured-output provider for Demo Mode foundations.
 * It returns only caller-supplied synthetic fixtures and never performs I/O.
 */
export class DemoModelClient implements ModelClient {
  constructor(private readonly fixtureFactory: DemoFixtureFactory) {}

  async generateStructured<Output>(
    request: StructuredModelRequest<Output>,
  ): Promise<StructuredModelResult<Output>> {
    if (request.abortSignal?.aborted === true) {
      return {
        kind: "provider-error",
        retryable: false,
        safeErrorCode: "REQUEST_ABORTED",
      };
    }

    try {
      return {
        kind: "success",
        output: request.validate(this.fixtureFactory(request.purpose)),
      };
    } catch {
      return {
        kind: "malformed-output",
        safeErrorCode: "PROVIDER_MALFORMED_OUTPUT",
      };
    }
  }
}
