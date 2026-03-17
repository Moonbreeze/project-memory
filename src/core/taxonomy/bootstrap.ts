import fs from "node:fs";
import path from "node:path";

import { createRepositoryContext } from "../config/index.ts";
import { ensureKebabCaseProject } from "../documents/index.ts";

import { ReservedTaxonomyRegistryScope, ReservedTaxonomyRegistryTopic } from "./constants.ts";
import { upsertTaxonomyRegistry } from "./registry.ts";
import type {
  BootstrapProjectInput,
  BootstrapProjectResult,
  TaxonomyRegistryEntry,
} from "./types.ts";

/**
 * Creates the shared project directory layout and reserved taxonomy registry surface.
 */
export const bootstrapProject = (
  input: BootstrapProjectInput,
  context = createRepositoryContext(),
): BootstrapProjectResult => {
  const project = ensureKebabCaseProject(input.project);
  const year = new Date().toISOString().slice(0, 4);
  const directories = [
    path.join(context.projectsDir, project, "canonical-docs"),
    path.join(context.projectsDir, project, "decisions", year),
    path.join(context.projectsDir, project, "provider-notes"),
    path.join(context.projectsDir, project, "runbooks"),
    path.join(context.projectsDir, project, "session-log"),
    path.join(context.projectsDir, project, "verification"),
    path.join(context.projectsDir, project, "work-items", year),
    path.join(context.archivesDir, project, "session-log"),
    path.join(context.archivesDir, project, "verification"),
  ];
  const created = new Set<string>();

  for (const directory of directories) {
    const alreadyExists = fs.existsSync(directory);
    fs.mkdirSync(directory, { recursive: true });
    if (!alreadyExists) {
      created.add(path.relative(context.memoryRootDir, directory));
    }
  }

  const registryRelativePath = path.join(
    "projects",
    project,
    "canonical-docs",
    ReservedTaxonomyRegistryScope,
    `${ReservedTaxonomyRegistryTopic}.md`,
  );
  const registryAbsolutePath = path.join(context.memoryRootDir, registryRelativePath);
  let registryCreated = false;

  if (!fs.existsSync(registryAbsolutePath)) {
    const bootstrapEntry: TaxonomyRegistryEntry = {
      scope: ReservedTaxonomyRegistryScope,
      topic: ReservedTaxonomyRegistryTopic,
      state: "active",
      migration: "create-topic",
      aliases: [],
      mappedScopes: [],
    };

    upsertTaxonomyRegistry(
      {
        project,
        date: input.date,
        source: input.source ?? "tool",
        entries: [bootstrapEntry],
        summary: `Active taxonomy registry for the ${project} project.`,
      },
      context,
    );
    created.add(registryRelativePath);
    registryCreated = true;
  }

  return {
    project,
    created: [...created].sort(),
    registryRelativePath,
    registryCreated,
  };
};
