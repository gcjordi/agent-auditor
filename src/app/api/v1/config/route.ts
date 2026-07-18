import { getServerConfig, toPublicConfig } from "@/shared/infrastructure/config/server-config";
import { getMutationToken } from "@/shared/infrastructure/security/mutation-token";
import { correlationIdFor, dataResponse, problemResponse } from "@/shared/presentation/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request): Response {
  const correlationId = correlationIdFor(request);
  try {
    const response = dataResponse(toPublicConfig(getServerConfig(), getMutationToken()));
    response.headers.set("x-correlation-id", correlationId);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}
