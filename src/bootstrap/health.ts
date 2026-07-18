import { getPrismaClient } from "./prisma-client";

export interface HealthStatus {
  readonly database: "reachable" | "unreachable";
  readonly status: "degraded" | "ok";
}

export async function checkHealth(): Promise<HealthStatus> {
  try {
    const client = await getPrismaClient();
    await client.$queryRaw`SELECT 1 AS healthy`;
    return { database: "reachable", status: "ok" };
  } catch {
    return { database: "unreachable", status: "degraded" };
  }
}
