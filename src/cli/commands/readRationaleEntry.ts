import { createRepositoryContext, readRationaleEntry } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `read-rationale-entry` CLI command.
 */
export const readRationaleEntryCommand: CliCommandHandler = (flags, io) => {
  printJson(
    readRationaleEntry({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
    }, createRepositoryContext()),
    io,
  );
};
