import { z } from "zod";

import { getApplicationContainer } from "@/bootstrap";
import { toAgentRevisionDto } from "@/modules/agent-catalog/presentation/agent-dto";
import { correlationIdFor, dataResponse, problemResponse } from "@/shared/presentation/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const revisionIdSchema = z.string().trim().min(1).max(128);
interface RouteContext {
  readonly params: Promise<{ readonly revisionId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    const { revisionId: candidate } = await context.params;
    const application = await getApplicationContainer();
    const revision = await application.agents.getRevision.execute(
      revisionIdSchema.parse(candidate),
    );
    const response = dataResponse(toAgentRevisionDto(revision));
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}
