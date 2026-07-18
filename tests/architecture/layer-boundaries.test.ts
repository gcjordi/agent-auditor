import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve("src");

async function sourceFiles(directory = sourceRoot): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(fullPath);
      return /\.(?:ts|tsx)$/u.test(entry.name) ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

async function violations(
  select: (file: string) => boolean,
  forbidden: RegExp,
): Promise<readonly string[]> {
  const files = (await sourceFiles()).filter(select);
  const results = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(file, "utf8");
      return forbidden.test(content) ? path.relative(sourceRoot, file) : undefined;
    }),
  );
  return results.filter((value): value is string => value !== undefined);
}

describe("architecture boundaries", () => {
  it("keeps Domain free of frameworks, environment access, and Node infrastructure", async () => {
    const found = await violations(
      (file) => file.includes(`${path.sep}domain${path.sep}`),
      /(?:from\s+["'](?:next|react|zod|@prisma|openai|node:)|process\.env)/u,
    );
    expect(found).toEqual([]);
  });

  it("keeps presentation free of Prisma", async () => {
    const found = await violations(
      (file) =>
        file.includes(`${path.sep}presentation${path.sep}`) ||
        file.includes(`${path.sep}app${path.sep}`),
      /(?:from\s+["'](?:@prisma|.*generated\/prisma)|PrismaClient)/u,
    );
    expect(found).toEqual([]);
  });

  it("forbids execution-capable imports in simulator infrastructure", async () => {
    const found = await violations(
      (file) =>
        file.includes(`${path.sep}simulation${path.sep}`) ||
        file.includes(`${path.sep}simulator${path.sep}`),
      /(?:child_process|node:child_process|node:fs|["']fs["']|node:http|node:https|node:net|node:tls|node:vm|worker_threads)/u,
    );
    expect(found).toEqual([]);
  });

  it("does not use console or raw HTML in application source", async () => {
    const found = await violations(
      () => true,
      /(?:console\.(?:debug|error|info|log|warn)|dangerouslySetInnerHTML)/u,
    );
    expect(found).toEqual([]);
  });
});
