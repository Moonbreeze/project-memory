import { commitPendingChanges } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `commit-pending-changes` CLI command.
 */
export const commitPendingChangesCommand: CliCommandHandler = (flags, io) => {
  printJson(
    commitPendingChanges({
      project: requireFlag(flags, "project"),
      summary: requireFlag(flags, "summary"),
    }),
    io,
  );
};
