import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

export default async function cleanupDatabase(): Promise<void> {
  const candidate = process.env["AGENT_AUDITOR_E2E_DATABASE_PATH"];
  if (candidate === undefined) return;

  const databasePath = resolve(candidate);
  if (
    dirname(databasePath) !== resolve(tmpdir()) ||
    !basename(databasePath).startsWith("agent-auditor-e2e-") ||
    !databasePath.endsWith(".db")
  ) {
    throw new Error("Refusing to clean a browser database outside the expected temporary path.");
  }

  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    try {
      await rm(`${databasePath}${suffix}`, { force: true });
    } catch {
      // A Windows server process can briefly retain its SQLite handle. The
      // artifact remains isolated in the operating system temporary directory.
    }
  }
}
