import { checkHealth } from "@/bootstrap/health";
import { getServerConfig } from "@/shared/infrastructure/config/server-config";
import { correlationIdFor, dataResponse, problemResponse } from "@/shared/presentation/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    const config = getServerConfig();
    const health = await checkHealth();
    const response = dataResponse(
      {
        applicationVersion: config.applicationVersion,
        database: health.database,
        demoModeAvailable: true,
        liveModeConfigured: config.openAi !== undefined,
        service: "agent-auditor",
        status: health.status,
      },
      health.status === "ok" ? 200 : 503,
    );
    response.headers.set("cache-control", "no-store");
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}
