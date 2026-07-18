import { getApplicationContainer } from "@/bootstrap";
import { toAuditRunDto } from "@/modules/auditing/presentation/audit-dto";
import { auditRunIdParameterSchema } from "@/modules/auditing/presentation/contracts";
import {
  assertSafeMutationRequest,
  correlationIdFor,
  dataResponse,
  problemResponse,
} from "@/shared/presentation/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ readonly runId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    assertSafeMutationRequest(request);
    const { runId: candidate } = await context.params;
    const runId = auditRunIdParameterSchema.parse(candidate);
    const application = await getApplicationContainer();
    const run = await application.audits.cancel.execute(runId);
    application.logger.log("info", "audit_run.cancellation_requested", {
      auditRunId: run.id,
      correlationId,
    });
    const response = dataResponse(toAuditRunDto(run), 202);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}
