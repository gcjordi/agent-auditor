import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextCliPath = require.resolve("next/dist/bin/next");
const nextArguments = process.argv.slice(2);

if (nextArguments.length === 0) {
  throw new Error("A Next.js command is required.");
}

// Run the CLI in this process so signal ownership remains with the calling
// package script and process supervisors can stop the server without leaving
// an orphaned Next.js child process.
process.env["NEXT_TELEMETRY_DISABLED"] = "1";
require(nextCliPath);
