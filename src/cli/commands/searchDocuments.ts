import { searchDocuments } from "../../core/index.ts";
import {
  parseOptionalDocumentType,
  parseOptionalLimit,
  printJson,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `search-documents` CLI command.
 */
export const searchDocumentsCommand: CliCommandHandler = (flags, io) => {
  printJson(
    searchDocuments({
      project: flags.project,
      type: parseOptionalDocumentType(flags.type),
      text: flags.text,
      limit: parseOptionalLimit(flags.limit),
    }),
    io,
  );
};
