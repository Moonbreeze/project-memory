import { bootstrapProject } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `bootstrap` CLI command.
 */
export const bootstrapCommand: CliCommandHandler = (flags, io) => {
  printJson(bootstrapProject({ project: requireFlag(flags, "project") }), io);
};
