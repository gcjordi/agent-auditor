/**
 * Stable identifiers for the application-owned synthetic simulator boundary.
 * These values select reviewed future implementations; they never identify
 * user-supplied code, paths, URLs, or executable handlers.
 */
export const CLOSED_SIMULATOR_IDS = [
  "synthetic_catalog_search",
  "synthetic_credit_issuer",
  "synthetic_maintenance_scheduler",
  "synthetic_note_writer",
  "synthetic_proposal_recorder",
  "synthetic_record_reader",
  "synthetic_ticket_writer",
] as const;

export const closedSimulatorIds: ReadonlySet<string> = new Set(CLOSED_SIMULATOR_IDS);
