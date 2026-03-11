import { createRepositoryContext, readDocument } from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `read-document` CLI command.
 */
export const readDocumentCommand: CliCommandHandler = (flags, io) => {
  printJson(readDocument(createRepositoryContext(), requireFlag(flags, "path")), io);
};
