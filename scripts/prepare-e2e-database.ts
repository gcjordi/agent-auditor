import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || !databaseUrl.startsWith("file:")) {
  throw new Error("The browser smoke server requires an explicit temporary SQLite URL.");
}

const databasePath = resolve(databaseUrl.slice("file:".length));
const temporaryRoot = resolve(tmpdir());
if (
  dirname(databasePath) !== temporaryRoot ||
  !basename(databasePath).startsWith("agent-auditor-e2e-") ||
  !databasePath.endsWith(".db")
) {
  throw new Error("Refusing to prepare a browser database outside the expected temporary path.");
}

for (const suffix of ["", "-journal", "-shm", "-wal"]) {
  await rm(`${databasePath}${suffix}`, { force: true });
}

// Prisma's Windows schema engine expects the SQLite file to exist before
// applying migrations when the repository is stored on a reparse-point path.
await writeFile(databasePath, "", { encoding: "utf8", flag: "wx" });
