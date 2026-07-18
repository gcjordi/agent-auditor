import { z } from "zod";

export const createAuditRequestSchema = z
  .object({
    agentRevisionId: z.string().trim().min(1).max(128),
    mode: z.enum(["DEMO", "LIVE"]).default("DEMO"),
  })
  .strict();

export const auditRunIdParameterSchema = z.string().trim().min(1).max(128);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export type CreateAuditRequest = z.output<typeof createAuditRequestSchema>;
