import { describe, expect, it } from "vitest";

import {
  CLOSED_SIMULATOR_IDS,
  closedSimulatorIds,
} from "@/shared/infrastructure/simulation/closed-simulator-catalog";

describe("closed simulator catalog", () => {
  it("exposes only the reviewed, application-owned simulator identifiers", () => {
    expect(CLOSED_SIMULATOR_IDS).toEqual([
      "synthetic_catalog_search",
      "synthetic_credit_issuer",
      "synthetic_maintenance_scheduler",
      "synthetic_note_writer",
      "synthetic_proposal_recorder",
      "synthetic_record_reader",
      "synthetic_ticket_writer",
    ]);
    expect(closedSimulatorIds).toEqual(new Set(CLOSED_SIMULATOR_IDS));
    expect(closedSimulatorIds.has("user_supplied_handler")).toBe(false);
  });
});
