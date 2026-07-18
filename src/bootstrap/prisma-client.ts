import { type PrismaClient } from "@/generated/prisma/client";
import { getServerConfig } from "@/shared/infrastructure/config/server-config";
import { createPrismaClient } from "@/shared/infrastructure/persistence";

let applicationClient: Promise<PrismaClient> | undefined;

export function getPrismaClient(): Promise<PrismaClient> {
  applicationClient ??= createPrismaClient({
    databaseUrl: getServerConfig().databaseUrl,
  });
  return applicationClient;
}
