import { createHash } from "node:crypto";

import { type Fingerprint, fingerprint, type FingerprintService } from "../../domain";

export class Sha256FingerprintService implements FingerprintService {
  sha256(canonicalContent: string): Fingerprint {
    const hexDigest = createHash("sha256").update(canonicalContent, "utf8").digest("hex");

    return fingerprint(`sha256:${hexDigest}`);
  }
}
