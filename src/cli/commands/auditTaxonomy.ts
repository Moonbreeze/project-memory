import { auditTaxonomyConsistency } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `audit-taxonomy` CLI command.
 */
export const auditTaxonomyCommand: CliCommandHandler = (flags, io) => {
  printJson(
    auditTaxonomyConsistency({
      project: requireFlag(flags, "project"),
    }),
    io,
  );
};
