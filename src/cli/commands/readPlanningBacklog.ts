import { createRepositoryContext, readPlanningBacklog } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `read-planning-backlog` CLI command.
 */
export const readPlanningBacklogCommand: CliCommandHandler = (flags, io) => {
  printJson(
    readPlanningBacklog({
      project: requireFlag(flags, "project"),
    }, createRepositoryContext()),
    io,
  );
};
