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
 * Writes one raw invalid done work-item fixture that violates the session-note evidence invariant.
 */
export const writeRawInvalidDoneWorkItem = (
  memoryRootDir: string,
  project: string,
  topic: string,
  date: string,
): string => {
  const year = date.slice(0, 4);
  const relativePath = path.join("projects", project, "work-items", year, `${date}-${topic}.md`);
  const absolutePath = path.join(memoryRootDir, relativePath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(
    absolutePath,
    [
      "---",
      `date: ${date}`,
      `project: ${project}`,
      `topic: ${topic}`,
      "source: agent",
      "status: active",
      "work_item_state: done",
      "---",
      "",
      "# Work Item",
      "",
      "## Summary",
      "",
      "Invalid done work-item fixture.",
      "",
      "## Outcome",
      "",
      "Mass-read paths should not abort because of this fixture.",
      "",
      "## Provenance",
      "",
      "- ad-hoc: Test fixture for fail-soft mass-read coverage.",
      "",
      "## Dependencies",
      "",
      "- none",
      "",
      "## Context",
      "",
      "- none",
      "",
      "## Verification",
      "",
      "- Confirm invalid work-item handling stays diagnostic-only for mass reads.",
      "",
      "## Evidence",
      "",
      "- none",
      "",
    ].join("\n"),
    "utf8",
  );

  return relativePath;
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
