import { createRepositoryContext, readTopicEntry } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `read-topic-entry` CLI command.
 */
export const readTopicEntryCommand: CliCommandHandler = (flags, io) => {
  printJson(
    readTopicEntry({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
    }, createRepositoryContext()),
    io,
  );
};
