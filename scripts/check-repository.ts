import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";

const repositoryRoot = resolve(process.cwd());
const maximumScannableFileBytes = 5 * 1024 * 1024;
const exactVersionPattern =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const privateKeyHeaderPattern = new RegExp(
  ["-----BEGIN", "(?:EC |OPENSSH |PGP |RSA )?PRIVATE", "KEY-----"].join(" "),
);

const intentionalSyntheticValues = new Set([
  ["internal", "path", "and", "secret", "canary"].join("-"),
  ["sk", "proj", "never", "return", "this", "value"].join("-"),
  ["sk", "proj", "abcdefghijklmnopqrstuv"].join("-"),
  ["sk", "1234567890abcdefghijkl"].join("-"),
  ["very", "secret"].join("-"),
  ["credential", "material"].join("-"),
  ["not", "a", "credential"].join("-"),
  ["unit", "test", "placeholder"].join("-"),
]);

const findings: string[] = [];

function listGitFiles(arguments_: readonly string[]): string[] {
  const output = execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return output
    .toString("utf8")
    .split("\0")
    .filter((path) => path.length > 0);
}

function normalizedRepositoryPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isForbiddenTrackedArtifact(path: string): boolean {
  const fileName = basename(path).toLowerCase();
  const isEnvironmentFile =
    fileName === ".env" || (fileName.startsWith(".env.") && fileName !== ".env.example");
  const isSqliteFile = /\.(?:db|sqlite|sqlite3)(?:-.+)?$/i.test(fileName);

  return isEnvironmentFile || isSqliteFile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonRecord(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${relative(repositoryRoot, path)} must contain a JSON object.`);
  }

  return parsed;
}

function checkExactDependencyVersions(): void {
  const packageJson = readJsonRecord(resolve(repositoryRoot, "package.json"));
  const dependencyGroups = ["dependencies", "devDependencies", "optionalDependencies"] as const;

  for (const groupName of dependencyGroups) {
    const group = packageJson[groupName];
    if (group === undefined) {
      continue;
    }
    if (!isRecord(group)) {
      findings.push(`package.json: ${groupName} must be an object.`);
      continue;
    }

    for (const [dependencyName, specifier] of Object.entries(group)) {
      if (typeof specifier !== "string" || !exactVersionPattern.test(specifier)) {
        findings.push(
          `package.json: ${groupName}.${dependencyName} must use an exact semantic version.`,
        );
      }
    }
  }

  const packageManager = packageJson["packageManager"];
  if (
    typeof packageManager !== "string" ||
    !packageManager.startsWith("pnpm@") ||
    !exactVersionPattern.test(packageManager.slice("pnpm@".length))
  ) {
    findings.push("package.json: packageManager must pin an exact pnpm semantic version.");
  }
}

function checkLockfileSources(): void {
  const lockfilePath = resolve(repositoryRoot, "pnpm-lock.yaml");
  const lockfile = readFileSync(lockfilePath, "utf8");
  const unsafeSourcePatterns: readonly {
    readonly description: string;
    readonly pattern: RegExp;
  }[] = [
    {
      description: "a Git-hosted dependency",
      pattern:
        /(?:git\+(?:https?|ssh|file)|(?:https?|ssh):\/\/(?:www\.)?(?:github|gitlab|bitbucket)\.com\/|git@(?:github|gitlab|bitbucket)\.com:|github:|gitlab:|bitbucket:)/i,
    },
    {
      description: "an explicit tarball source",
      pattern: /^\s*tarball\s*:/im,
    },
    {
      description: "a remote archive URL",
      pattern: /https?:\/\/[^\s}"']+\.(?:tgz|tar\.gz)(?:[?#][^\s}"']*)?/i,
    },
  ];

  for (const { description, pattern } of unsafeSourcePatterns) {
    if (pattern.test(lockfile)) {
      findings.push(`pnpm-lock.yaml: contains ${description}; registry artifacts are required.`);
    }
  }
}

function isIntentionalSyntheticValue(value: string): boolean {
  const normalized = value.trim();
  return (
    intentionalSyntheticValues.has(normalized) ||
    /^<[^>]+>$/.test(normalized) ||
    /^\$\{[A-Z][A-Z0-9_]*\}$/.test(normalized) ||
    /^(?:redacted|not-set|replace-me)$/i.test(normalized)
  );
}

function addSecretFinding(
  seen: Set<string>,
  path: string,
  lineNumber: number,
  description: string,
): void {
  const fingerprint = `${path}:${lineNumber}:${description}`;
  if (seen.has(fingerprint)) {
    return;
  }
  seen.add(fingerprint);
  findings.push(`${path}:${lineNumber}: possible ${description}; secret values are never printed.`);
}

function scanTextForSecrets(path: string, text: string): void {
  const seen = new Set<string>();
  const normalizedPath = normalizedRepositoryPath(path);
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (privateKeyHeaderPattern.test(line) && !line.includes("canary-private-material")) {
      addSecretFinding(seen, normalizedPath, lineNumber, "private key material");
    }

    for (const match of line.matchAll(/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g)) {
      const value = match[0];
      if (!isIntentionalSyntheticValue(value)) {
        addSecretFinding(seen, normalizedPath, lineNumber, "provider credential");
      }
    }

    for (const match of line.matchAll(/\bAKIA[0-9A-Z]{16}\b/g)) {
      if (!isIntentionalSyntheticValue(match[0])) {
        addSecretFinding(seen, normalizedPath, lineNumber, "cloud access key");
      }
    }

    for (const match of line.matchAll(/\bgh[pousr]_[A-Za-z0-9]{36,}\b/g)) {
      if (!isIntentionalSyntheticValue(match[0])) {
        addSecretFinding(seen, normalizedPath, lineNumber, "source-control token");
      }
    }

    for (const match of line.matchAll(
      /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    )) {
      if (!isIntentionalSyntheticValue(match[0])) {
        addSecretFinding(seen, normalizedPath, lineNumber, "signed web token");
      }
    }

    for (const match of line.matchAll(
      /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|password|passwd|secret|token)\b\s*[:=]\s*(["'])([^"'\r\n]+)\1/gi,
    )) {
      const value = match[2];
      if (value !== undefined && value.length >= 10 && !isIntentionalSyntheticValue(value)) {
        addSecretFinding(seen, normalizedPath, lineNumber, "hard-coded secret assignment");
      }
    }

    const environmentAssignment =
      /^\s*[A-Z][A-Z0-9_]*(?:API_KEY|PASSWORD|SECRET|TOKEN)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*$/.exec(
        line,
      );
    const environmentValue =
      environmentAssignment?.[1] ?? environmentAssignment?.[2] ?? environmentAssignment?.[3];
    if (
      environmentValue !== undefined &&
      environmentValue.length >= 10 &&
      !isIntentionalSyntheticValue(environmentValue)
    ) {
      addSecretFinding(seen, normalizedPath, lineNumber, "environment credential");
    }
  }
}

function scanCandidateFiles(candidatePaths: readonly string[]): void {
  for (const repositoryPath of candidatePaths) {
    const absolutePath = resolve(repositoryRoot, repositoryPath);
    if (absolutePath !== repositoryRoot && !absolutePath.startsWith(`${repositoryRoot}${sep}`)) {
      findings.push(`${normalizedRepositoryPath(repositoryPath)}: path escapes the repository.`);
      continue;
    }

    const metadata = lstatSync(absolutePath);
    if (metadata.isSymbolicLink()) {
      findings.push(
        `${normalizedRepositoryPath(repositoryPath)}: symbolic links are not accepted by the repository guard.`,
      );
      continue;
    }
    if (!metadata.isFile()) {
      continue;
    }
    if (metadata.size > maximumScannableFileBytes) {
      findings.push(
        `${normalizedRepositoryPath(repositoryPath)}: exceeds the 5 MiB repository scan limit.`,
      );
      continue;
    }

    const content = readFileSync(absolutePath);
    if (content.includes(0)) {
      continue;
    }
    scanTextForSecrets(repositoryPath, content.toString("utf8"));
  }
}

function main(): void {
  const trackedPaths = listGitFiles(["ls-files", "--cached", "-z"]);
  const candidatePaths = listGitFiles([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);

  for (const path of trackedPaths) {
    if (isForbiddenTrackedArtifact(path)) {
      findings.push(
        `${normalizedRepositoryPath(path)}: tracked environment and SQLite artifacts are forbidden.`,
      );
    }
  }

  checkExactDependencyVersions();
  checkLockfileSources();
  scanCandidateFiles(candidatePaths);

  if (findings.length > 0) {
    console.error("Repository guard failed:\n");
    for (const finding of findings.sort()) {
      console.error(`- ${finding}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Repository guard passed (${trackedPaths.length} tracked, ${candidatePaths.length} candidate files scanned).`,
  );
}

main();
