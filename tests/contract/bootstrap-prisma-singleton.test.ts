import { describe, expect, it, vi } from "vitest";

import { getPrismaClient } from "@/bootstrap/prisma-client";

interface SyntheticPrismaClient {
  readonly marker: "synthetic-prisma-client";
}

const prismaBootstrapMocks = vi.hoisted(() => ({
  createPrismaClient:
    vi.fn<(options: { readonly databaseUrl: string }) => Promise<SyntheticPrismaClient>>(),
  getServerConfig: vi.fn<() => { readonly databaseUrl: string }>(),
}));

vi.mock("@/shared/infrastructure/config/server-config", () => ({
  getServerConfig: prismaBootstrapMocks.getServerConfig,
}));

vi.mock("@/shared/infrastructure/persistence", () => ({
  createPrismaClient: prismaBootstrapMocks.createPrismaClient,
}));

describe("Prisma bootstrap", () => {
  it("initializes one client promise with the validated database URL", async () => {
    const client: SyntheticPrismaClient = { marker: "synthetic-prisma-client" };
    prismaBootstrapMocks.getServerConfig.mockReturnValue({
      databaseUrl: "file:./prisma/bootstrap-test.db",
    });
    prismaBootstrapMocks.createPrismaClient.mockResolvedValue(client);

    const first = getPrismaClient();
    const second = getPrismaClient();

    expect(second).toBe(first);
    await expect(first).resolves.toBe(client);
    expect(prismaBootstrapMocks.createPrismaClient).toHaveBeenCalledOnce();
    expect(prismaBootstrapMocks.createPrismaClient).toHaveBeenCalledWith({
      databaseUrl: "file:./prisma/bootstrap-test.db",
    });
  });
});
