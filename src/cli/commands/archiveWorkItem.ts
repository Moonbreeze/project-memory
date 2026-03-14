import { archiveWorkItem } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `archive-work-item` CLI command.
 */
export const archiveWorkItemCommand: CliCommandHandler = (flags, io) => {
  printJson(
    archiveWorkItem({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
      date: requireFlag(flags, "date"),
    }),
    io,
  );
};
