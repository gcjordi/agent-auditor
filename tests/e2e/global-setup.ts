import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { FullConfig } from "@playwright/test";
import next from "next";

import cleanupDatabase from "./cleanup-database";

const execFileAsync = promisify(execFile);

async function applyMigrations(): Promise<void> {
  const prismaCliPath = fileURLToPath(import.meta.resolve("prisma/build/index.js"));
  const result = await execFileAsync(process.execPath, [prismaCliPath, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });

  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error): void => {
      reject(error);
    };
    server.once("error", handleError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", handleError);
      resolve();
    });
  });
}

async function close(server: Server): Promise<void> {
  server.closeIdleConnections();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) reject(error);
      else resolve();
    });
  });
}

export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  const port = Number(process.env["APP_PORT"]);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("The browser smoke test requires a valid APP_PORT.");
  }

  await import("../../scripts/prepare-e2e-database");
  await applyMigrations();
  await import("../../prisma/seed");

  const application = next({
    dev: false,
    dir: process.cwd(),
    hostname: "127.0.0.1",
    port,
  });

  try {
    await application.prepare();
    const requestHandler = application.getRequestHandler();
    const upgradeHandler = application.getUpgradeHandler();
    const server = createServer((request, response) => {
      void requestHandler(request, response).catch(() => {
        response.destroy();
      });
    });
    server.on("upgrade", (request, socket, head) => {
      void upgradeHandler(request, socket, head).catch(() => {
        socket.destroy();
      });
    });
    await listen(server, port);

    return async (): Promise<void> => {
      await close(server);
      await application.close();
      await cleanupDatabase();
    };
  } catch (error: unknown) {
    await application.close();
    await cleanupDatabase();
    throw error;
  }
}
