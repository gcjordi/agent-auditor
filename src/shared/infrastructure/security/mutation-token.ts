import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { MUTATION_TOKEN_HEADER } from "@/shared/application/http-contract";

const mutationToken = randomBytes(32).toString("base64url");

export function getMutationToken(): string {
  return mutationToken;
}

export function isValidMutationToken(candidate: string | null): boolean {
  if (candidate === null) return false;
  const expected = Buffer.from(mutationToken);
  const received = Buffer.from(candidate);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export { MUTATION_TOKEN_HEADER };
