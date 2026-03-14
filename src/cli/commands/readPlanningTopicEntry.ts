import { createRepositoryContext, readPlanningTopicEntry } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `read-planning-topic-entry` CLI command.
 */
export const readPlanningTopicEntryCommand: CliCommandHandler = (flags, io) => {
  printJson(
    readPlanningTopicEntry({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
    }, createRepositoryContext()),
    io,
  );
};
