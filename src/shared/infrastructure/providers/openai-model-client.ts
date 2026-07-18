import "server-only";

import OpenAI from "openai";

import { ApplicationError } from "@/shared/application/errors";
import type {
  ModelClient,
  StructuredModelRequest,
  StructuredModelResult,
} from "@/shared/application/ports/model-client";
import type { ServerConfig } from "@/shared/infrastructure/config/server-config";

interface OpenAiModelClientOptions {
  readonly apiKey: string;
  readonly maxRetries?: number;
  readonly model: string;
}

export class OpenAiModelClient implements ModelClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAiModelClientOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      maxRetries: options.maxRetries ?? 2,
    });
    this.model = options.model;
  }

  async generateStructured<Output>(
    request: StructuredModelRequest<Output>,
  ): Promise<StructuredModelResult<Output>> {
    try {
      const response = await this.client.responses.create(
        {
          input: request.input,
          instructions: request.instructions,
          max_output_tokens: request.outputBudget,
          model: this.model,
        },
        { signal: request.abortSignal, timeout: request.timeoutMs },
      );

      try {
        const parsed: unknown = JSON.parse(response.output_text);
        const usage =
          response.usage === undefined
            ? undefined
            : {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                totalTokens: response.usage.total_tokens,
              };
        return {
          kind: "success",
          output: request.validate(parsed),
          providerRequestId: response.id,
          ...(usage === undefined ? {} : { usage }),
        };
      } catch {
        const usage =
          response.usage === undefined
            ? undefined
            : {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                totalTokens: response.usage.total_tokens,
              };
        return {
          kind: "malformed-output",
          safeErrorCode: "PROVIDER_MALFORMED_OUTPUT",
          ...(usage === undefined ? {} : { usage }),
        };
      }
    } catch (error: unknown) {
      if (error instanceof OpenAI.APIError) {
        const status = typeof error.status === "number" ? error.status : 0;
        return {
          kind: "provider-error",
          retryable: status === 408 || status === 409 || status === 429 || status >= 500,
          safeErrorCode: mapProviderError(status),
        };
      }
      return {
        kind: "provider-error",
        retryable: true,
        safeErrorCode: "PROVIDER_UNAVAILABLE",
      };
    }
  }
}

function mapProviderError(status: number): string {
  if (status === 401 || status === 403) return "PROVIDER_AUTHORIZATION_FAILED";
  if (status === 408) return "PROVIDER_TIMEOUT";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "PROVIDER_REQUEST_REJECTED";
}

export function createOpenAiModelClient(config: ServerConfig): OpenAiModelClient {
  if (config.openAi === undefined) {
    throw new ApplicationError(
      "LIVE_MODE_UNAVAILABLE",
      "Live Mode is not configured. Demo Mode remains available.",
    );
  }

  return new OpenAiModelClient({
    apiKey: config.openAi.apiKey,
    model: config.openAi.model,
  });
}
