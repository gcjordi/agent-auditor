import "server-only";

import { getServerConfig } from "@/shared/infrastructure/config";

export function getPublicServerCapabilities() {
  const config = getServerConfig();
  return {
    demoModeAvailable: true as const,
    liveModeConfigured: config.openAi !== undefined,
    maximumCases: config.audit.maximumTestCases,
  };
}
