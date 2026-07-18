import { getApplicationContainer } from "@/bootstrap";
import {
  toAgentProfileDto,
  toAgentRevisionDto,
} from "@/modules/agent-catalog/presentation/agent-dto";
import { agentIdParameterSchema } from "@/modules/agent-catalog/presentation/contracts";
import {
  assertSafeMutationRequest,
  correlationIdFor,
  dataResponse,
  noContentResponse,
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
    const response = dataResponse({
      profile: toAgentProfileDto(details.profile),
      revisions: details.revisions.map(toAgentRevisionDto),
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    assertSafeMutationRequest(request);
    const { agentId: candidate } = await context.params;
    const agentId = agentIdParameterSchema.parse(candidate);
    const application = await getApplicationContainer();
    await application.agents.purge.execute(
      agentId,
      request.headers.get("x-confirm-agent-purge") ?? "",
    );
    application.logger.log("info", "agent_profile.purged", {
      agentProfileId: agentId,
      correlationId,
    });
    const response = noContentResponse();
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}
