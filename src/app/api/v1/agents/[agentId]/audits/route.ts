import { getApplicationContainer } from "@/bootstrap";
import { agentIdParameterSchema } from "@/modules/agent-catalog/presentation/contracts";
import { toAuditRunDto } from "@/modules/auditing/presentation/audit-dto";
import {
  createAuditRequestSchema,
  idempotencyKeySchema,
} from "@/modules/auditing/presentation/contracts";
import {
  assertSafeMutationRequest,
  correlationIdFor,
  dataResponse,
  HttpProblem,
  parseJsonBody,
  problemResponse,
} from "@/shared/presentation/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ readonly agentId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    assertSafeMutationRequest(request);
    const { agentId: candidate } = await context.params;
    const agentId = agentIdParameterSchema.parse(candidate);
    const body = await parseJsonBody(request, createAuditRequestSchema);
    const idempotencyCandidate = request.headers.get("idempotency-key");
    if (idempotencyCandidate === null) {
      throw new HttpProblem(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "An Idempotency-Key header is required.",
      );
    }
    const idempotencyKey = idempotencyKeySchema.parse(idempotencyCandidate);
    const application = await getApplicationContainer();
    const queued = await application.audits.create.execute({
      agentRevisionId: body.agentRevisionId,
      expectedAgentProfileId: agentId,
      idempotencyKey,
      mode: body.mode,
    });
    application.logger.log("info", "audit_run.queued", {
      auditRunId: queued.run.id,
      correlationId,
    });
    const response = dataResponse(
      {
        ...toAuditRunDto(queued.run),
        idempotentReplay: !queued.created,
      },
      202,
    );
    response.headers.set("location", `/api/v1/audits/${queued.run.id}`);
    response.headers.set("x-correlation-id", correlationId);
    if (!queued.created) response.headers.set("x-idempotent-replay", "true");
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}
