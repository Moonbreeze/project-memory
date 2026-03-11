import { archiveDocument } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `archive-document` CLI command.
 */
export const archiveDocumentCommand: CliCommandHandler = (flags, io) => {
  printJson(archiveDocument({ relativePath: requireFlag(flags, "path") }), io);
};
