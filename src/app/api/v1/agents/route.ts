import { z } from "zod";

import { getApplicationContainer } from "@/bootstrap";
import {
  toAgentProfileDto,
  toAgentProfileSummaryDto,
  toAgentRevisionDto,
} from "@/modules/agent-catalog/presentation/agent-dto";
import { createAgentRequestSchema } from "@/modules/agent-catalog/presentation/contracts";
import {
  assertSafeMutationRequest,
  correlationIdFor,
  dataResponse,
  parseJsonBody,
  problemResponse,
} from "@/shared/presentation/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const listQuerySchema = z.coerce.number().int().min(1).max(100).default(20);
const cursorSchema = z.string().trim().min(1).max(128).optional();

export async function GET(request: Request): Promise<Response> {
  const correlationId = correlationIdFor(request);
  try {
    const url = new URL(request.url);
    const limit = listQuerySchema.parse(url.searchParams.get("limit") ?? undefined);
    const cursor = cursorSchema.parse(url.searchParams.get("cursor") ?? undefined);
    const application = await getApplicationContainer();
    const page = await application.agents.list.execute(limit, cursor);
    const response = dataResponse({
      items: page.items.map(toAgentProfileSummaryDto),
      nextCursor: page.nextCursor ?? null,
    });
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
    const body = await parseJsonBody(request, createAgentRequestSchema);
    const application = await getApplicationContainer();
    const created = await application.agents.create.execute(body);
    application.logger.log("info", "agent_profile.created", {
      agentProfileId: created.profile.id,
      correlationId,
    });
    const response = dataResponse(
      {
        id: created.profile.id,
        profile: toAgentProfileDto(created.profile),
        revision: toAgentRevisionDto(created.revision),
      },
      201,
    );
    response.headers.set("location", `/api/v1/agents/${created.profile.id}`);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: unknown) {
    return problemResponse(error, correlationId);
  }
}
