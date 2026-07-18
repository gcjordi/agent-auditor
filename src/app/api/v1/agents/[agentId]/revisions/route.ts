import { getApplicationContainer } from "@/bootstrap";
import { toAgentRevisionDto } from "@/modules/agent-catalog/presentation/agent-dto";
import {
  agentIdParameterSchema,
  createAgentRevisionRequestSchema,
} from "@/modules/agent-catalog/presentation/contracts";
import {
  assertSafeMutationRequest,
  correlationIdFor,
  dataResponse,
  parseJsonBody,
  problemResponse,
} from "@/shared/presentation/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ readonly agentId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    const { agentId: candidate } = await context.params;
    const agentId = agentIdParameterSchema.parse(candidate);
    const application = await getApplicationContainer();
    const details = await application.agents.get.execute(agentId);
    const response = dataResponse({ items: details.revisions.map(toAgentRevisionDto) });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    assertSafeMutationRequest(request);
    const { agentId: candidate } = await context.params;
    const agentId = agentIdParameterSchema.parse(candidate);
    const definition = await parseJsonBody(request, createAgentRevisionRequestSchema);
    const application = await getApplicationContainer();
    const revision = await application.agents.createRevision.execute({
      agentProfileId: agentId,
      definition,
    });
    application.logger.log("info", "agent_revision.created", {
      agentProfileId: agentId,
      correlationId,
    });
    const response = dataResponse(toAgentRevisionDto(revision), 201);
    response.headers.set("location", `/api/v1/agents/${agentId}`);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}
