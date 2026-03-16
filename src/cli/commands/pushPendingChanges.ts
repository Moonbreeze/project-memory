import { pushPendingChanges } from "../../core/index.ts";
import { printJson } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `push-pending-changes` CLI command.
 */
export const pushPendingChangesCommand: CliCommandHandler = (flags, io) => {
  printJson(
    pushPendingChanges({
      remote: flags.remote,
      branch: flags.branch,
    }),
    io,
  );
};
