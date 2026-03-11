import { listDocuments } from "../../core/index.ts";
import {
  parseOptionalDocumentType,
  parseOptionalLimit,
  printJson,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `list-documents` CLI command.
 */
export const listDocumentsCommand: CliCommandHandler = (flags, io) => {
  printJson(
    listDocuments({
      project: flags.project,
      type: parseOptionalDocumentType(flags.type),
      limit: parseOptionalLimit(flags.limit),
    }),
    io,
  );
};
