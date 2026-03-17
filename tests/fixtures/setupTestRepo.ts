import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRepositoryContext } from "../../src/core/config/index.ts";
import {
  ReservedTaxonomyRegistryScope,
  ReservedTaxonomyRegistryTopic,
  bootstrapProject,
  upsertTaxonomyRegistry,
} from "../../src/core/index.ts";
import type { RepositoryContext } from "../../src/core/types/index.ts";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const toolRootDir = path.resolve(fixtureDir, "../..");

/**
 * Creates a temporary test memory repository.
 */
export const setupTestRepo = (): string => {
  const memoryRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-"));

  for (const relativeDir of ["projects", "archives"]) {
    fs.mkdirSync(path.join(memoryRootDir, relativeDir), { recursive: true });
  }

  return memoryRootDir;
};

/**
 * Creates a repository context that keeps the tool repo local and memory external.
 */
export const createTestRepositoryContext = (memoryRootDir: string): RepositoryContext => {
  return createRepositoryContext({ toolRootDir, memoryRootDir });
};

/**
 * Bootstraps one managed test project and optionally seeds additional taxonomy scopes.
 */
export const setupTestProjectTaxonomy = (
  context: RepositoryContext,
  project: string,
  scopes: string[] = [],
): void => {
  bootstrapProject({ project, date: "2026-03-11" }, context);

  if (scopes.length === 0) {
    return;
  }

  upsertTaxonomyRegistry(
    {
      project,
      date: "2026-03-11",
      entries: [
        {
          scope: ReservedTaxonomyRegistryScope,
          topic: ReservedTaxonomyRegistryTopic,
          state: "active",
          migration: "create-topic",
          aliases: [],
          mappedScopes: [],
        },
        ...scopes.map((scope) => ({
          scope,
          topic: scope,
          state: "active" as const,
          migration: "create-topic" as const,
          aliases: [],
          mappedScopes: [],
        })),
      ],
    },
    context,
  );
};
