import { z } from "zod";

import { getApplicationContainer } from "@/bootstrap";
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

const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

export async function GET(request: Request): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    const limit = limitSchema.parse(new URL(request.url).searchParams.get("limit") ?? undefined);
    const application = await getApplicationContainer();
    const runs = await application.audits.list.execute(limit);
    const response = dataResponse({ items: runs.map(toAuditRunDto) });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    assertSafeMutationRequest(request);
    const body = await parseJsonBody(request, createAuditRequestSchema);
    const idempotencyCandidate = request.headers.get("idempotency-key");
    if (idempotencyCandidate === null) {
      throw new HttpProblem(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "An Idempotency-Key header is required.",
      );
    }
    const application = await getApplicationContainer();
    const queued = await application.audits.create.execute({
      agentRevisionId: body.agentRevisionId,
      idempotencyKey: idempotencyKeySchema.parse(idempotencyCandidate),
      mode: body.mode,
    });
    const response = dataResponse(
      { ...toAuditRunDto(queued.run), idempotentReplay: !queued.created },
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
