import { createRepositoryContext, readColdStart } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `read-cold-start` CLI command.
 */
export const readColdStartCommand: CliCommandHandler = (flags, io) => {
  printJson(
    readColdStart({
      project: requireFlag(flags, "project"),
    }, createRepositoryContext()),
    io,
  );
};
