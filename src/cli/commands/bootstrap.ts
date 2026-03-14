import fs from "node:fs";
import path from "node:path";

import { createRepositoryContext } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Creates the initial project and archive directory structure.
 */
const bootstrapProject = (project: string): { project: string; created: string[] } => {
  const context = createRepositoryContext();
  const projectSlug = project
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const directories = [
    path.join(context.projectsDir, projectSlug, "canonical-docs"),
    path.join(context.projectsDir, projectSlug, "decisions", new Date().toISOString().slice(0, 4)),
    path.join(context.projectsDir, projectSlug, "provider-notes"),
    path.join(context.projectsDir, projectSlug, "runbooks"),
    path.join(context.projectsDir, projectSlug, "session-log"),
    path.join(context.projectsDir, projectSlug, "verification"),
    path.join(context.archivesDir, projectSlug, "session-log"),
    path.join(context.archivesDir, projectSlug, "verification"),
  ];

  for (const directory of directories) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return {
    project: projectSlug,
    created: directories.map((directory) => path.relative(context.memoryRootDir, directory)),
  };
};

/**
 * Handles the `bootstrap` CLI command.
 */
export const bootstrapCommand: CliCommandHandler = (flags, io) => {
  printJson(bootstrapProject(requireFlag(flags, "project")), io);
};
