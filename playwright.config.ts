import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const databasePath = join(tmpdir(), `agent-auditor-e2e-${process.pid}.db`);
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;

process.env["AGENT_AUDITOR_E2E_DATABASE_PATH"] = databasePath;
process.env["APP_HOST"] = "127.0.0.1";
process.env["APP_PORT"] = String(port);
process.env["AUDIT_PROVIDER"] = "demo";
process.env["DATABASE_URL"] = databaseUrl;
process.env["DEMO_SEED"] = "build-week";
process.env["NEXT_TELEMETRY_DISABLED"] = "1";
process.env["OPENAI_API_KEY"] = "";
process.env["OPENAI_MODEL"] = "";

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 2 : 0,
  workers: 1,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
