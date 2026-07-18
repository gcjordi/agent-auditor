import { getApplicationContainer } from "@/bootstrap";
import { toAuditRunDto } from "@/modules/auditing/presentation/audit-dto";
import { auditRunIdParameterSchema } from "@/modules/auditing/presentation/contracts";
import { correlationIdFor, dataResponse, problemResponse } from "@/shared/presentation/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ readonly runId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    const { runId: candidate } = await context.params;
    const runId = auditRunIdParameterSchema.parse(candidate);
    const application = await getApplicationContainer();
    const run = await application.audits.get.execute(runId);
    const response = dataResponse(toAuditRunDto(run));
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}
