import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly license?: string | { readonly type?: string };
  readonly licenses?: readonly (string | { readonly type?: string })[];
  readonly name?: string;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>;
  readonly version?: string;
}

interface InstalledPackage {
  readonly directory: string;
  readonly license: string;
  readonly name: string;
  readonly version: string;
}

const repositoryRoot = resolve(process.cwd());
const allowedLicenseIdentifiers = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
  "WTFPL",
]);
const allowedLicenseExceptions = new Set(["Classpath-exception-2.0", "LLVM-exception"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  for (const entry of Object.values(value)) {
    if (typeof entry !== "string") {
      return undefined;
    }
  }
  return value as Readonly<Record<string, string>>;
}

function readPackageManifest(path: string): PackageManifest {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(
      `${relative(repositoryRoot, path)} does not contain a package manifest object.`,
    );
  }

  const licenseValue = parsed["license"];
  const licensesValue = parsed["licenses"];
  const peerMetadataValue = parsed["peerDependenciesMeta"];
  const dependencies = asStringRecord(parsed["dependencies"]);
  const optionalDependencies = asStringRecord(parsed["optionalDependencies"]);
  const peerDependencies = asStringRecord(parsed["peerDependencies"]);

  return {
    ...(typeof parsed["name"] === "string" ? { name: parsed["name"] } : {}),
    ...(typeof parsed["version"] === "string" ? { version: parsed["version"] } : {}),
    ...(typeof licenseValue === "string" || isRecord(licenseValue)
      ? { license: licenseValue as string | { readonly type?: string } }
      : {}),
    ...(Array.isArray(licensesValue)
      ? {
          licenses: licensesValue.filter(
            (entry): entry is string | { readonly type?: string } =>
              typeof entry === "string" || isRecord(entry),
          ),
        }
      : {}),
    ...(dependencies === undefined ? {} : { dependencies }),
    ...(optionalDependencies === undefined ? {} : { optionalDependencies }),
    ...(peerDependencies === undefined ? {} : { peerDependencies }),
    ...(isRecord(peerMetadataValue)
      ? {
          peerDependenciesMeta: Object.fromEntries(
            Object.entries(peerMetadataValue)
              .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
              .map(([name, metadata]) => [name, { optional: metadata["optional"] === true }]),
          ),
        }
      : {}),
  };
}

function licenseFromManifest(manifest: PackageManifest): string | undefined {
  if (typeof manifest.license === "string") {
    return manifest.license.trim();
  }
  if (manifest.license?.type !== undefined) {
    return manifest.license.type.trim();
  }

  const licenses = manifest.licenses
    ?.map((license) => (typeof license === "string" ? license : license.type))
    .filter((license): license is string => license !== undefined && license.length > 0);
  return licenses === undefined || licenses.length === 0 ? undefined : licenses.join(" OR ");
}

function licenseFromIncludedFile(packageDirectory: string): string | undefined {
  const licenseFileName = readdirSync(packageDirectory).find((entry) =>
    /^(?:licen[cs]e|copying)(?:\.[a-z0-9_-]+)?$/i.test(entry),
  );
  if (licenseFileName === undefined) {
    return undefined;
  }

  const licenseText = readFileSync(join(packageDirectory, licenseFileName), "utf8");
  if (/Permission is hereby granted, free of charge/i.test(licenseText)) {
    return "MIT";
  }
  if (/Apache License\s+Version 2\.0/i.test(licenseText)) {
    return "Apache-2.0";
  }
  if (
    /Permission to use, copy, modify, and distribute this software for any purpose/i.test(
      licenseText,
    )
  ) {
    return "ISC";
  }
  if (/Redistribution and use in source and binary forms/i.test(licenseText)) {
    return /Neither the name of .* nor the names of its contributors/i.test(licenseText)
      ? "BSD-3-Clause"
      : "BSD-2-Clause";
  }

  return undefined;
}

function packageManifestPath(baseDirectory: string, packageName: string): string | undefined {
  const packageSegments = packageName.split("/");
  let cursor = resolve(baseDirectory);

  while (
    cursor === repositoryRoot ||
    (cursor.startsWith(`${repositoryRoot}${sep}`) && cursor !== dirname(cursor))
  ) {
    const candidate = join(cursor, "node_modules", ...packageSegments, "package.json");
    if (existsSync(candidate)) {
      const resolvedCandidate = realpathSync(candidate);
      if (
        resolvedCandidate === repositoryRoot ||
        resolvedCandidate.startsWith(`${repositoryRoot}${sep}`)
      ) {
        return resolvedCandidate;
      }
      throw new Error(`Resolved dependency ${packageName} escaped the repository.`);
    }
    if (cursor === repositoryRoot) {
      break;
    }
    cursor = dirname(cursor);
  }

  return undefined;
}

function isAllowedLicenseExpression(expression: string): boolean {
  const identifiers = expression.match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g) ?? [];
  let afterWith = false;

  for (const identifier of identifiers) {
    if (identifier === "AND" || identifier === "OR") {
      afterWith = false;
      continue;
    }
    if (identifier === "WITH") {
      afterWith = true;
      continue;
    }
    if (afterWith) {
      if (!allowedLicenseExceptions.has(identifier)) {
        return false;
      }
      afterWith = false;
      continue;
    }
    if (!allowedLicenseIdentifiers.has(identifier)) {
      return false;
    }
  }

  return identifiers.length > 0 && !afterWith;
}

function collectProductionPackages(): InstalledPackage[] {
  const rootManifest = readPackageManifest(resolve(repositoryRoot, "package.json"));
  const directDependencies = rootManifest.dependencies;
  if (directDependencies === undefined) {
    throw new Error("package.json must define production dependencies.");
  }

  const packages: InstalledPackage[] = [];
  const visitedManifestPaths = new Set<string>();
  const queue = Object.keys(directDependencies).map((name) => ({
    fromDirectory: repositoryRoot,
    name,
    optional: false,
  }));

  while (queue.length > 0) {
    const queued = queue.shift();
    if (queued === undefined) {
      break;
    }
    const manifestPath = packageManifestPath(queued.fromDirectory, queued.name);
    if (manifestPath === undefined) {
      if (queued.optional) {
        continue;
      }
      throw new Error(`Production dependency ${queued.name} is not installed.`);
    }
    if (visitedManifestPaths.has(manifestPath)) {
      continue;
    }
    visitedManifestPaths.add(manifestPath);

    const manifest = readPackageManifest(manifestPath);
    const packageDirectory = dirname(manifestPath);
    const name = manifest.name;
    const version = manifest.version;
    const license = licenseFromManifest(manifest) ?? licenseFromIncludedFile(packageDirectory);
    if (name === undefined || version === undefined || license === undefined) {
      throw new Error(
        `${relative(repositoryRoot, manifestPath)} is missing a name, version, or license declaration.`,
      );
    }

    packages.push({ directory: packageDirectory, license, name, version });

    for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
      queue.push({ fromDirectory: packageDirectory, name: dependencyName, optional: false });
    }
    for (const dependencyName of Object.keys(manifest.optionalDependencies ?? {})) {
      queue.push({ fromDirectory: packageDirectory, name: dependencyName, optional: true });
    }
    for (const dependencyName of Object.keys(manifest.peerDependencies ?? {})) {
      const optional = manifest.peerDependenciesMeta?.[dependencyName]?.optional === true;
      queue.push({ fromDirectory: packageDirectory, name: dependencyName, optional });
    }
  }

  return packages.sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
}

function main(): void {
  if (!isAbsolute(repositoryRoot)) {
    throw new Error("The repository root must resolve to an absolute path.");
  }

  const packages = collectProductionPackages();
  const inventory = new Map<string, string[]>();
  const rejected: InstalledPackage[] = [];

  for (const package_ of packages) {
    const identity = `${package_.name}@${package_.version}`;
    inventory.set(package_.license, [...(inventory.get(package_.license) ?? []), identity]);
    if (!isAllowedLicenseExpression(package_.license)) {
      rejected.push(package_);
    }
  }

  console.log(`Production license inventory (${packages.length} installed package instances):`);
  for (const [license, identities] of [...inventory.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    console.log(`- ${license}: ${identities.length}`);
  }

  if (rejected.length > 0) {
    console.error("\nLicense check failed; review these missing or unapproved declarations:");
    for (const package_ of rejected) {
      console.error(`- ${package_.name}@${package_.version}: ${package_.license}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("License check passed (permissive and approved weak-copyleft declarations only).");
}

main();
