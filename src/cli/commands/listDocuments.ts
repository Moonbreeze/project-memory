import { listDocuments } from "../../core/index.ts";
import {
  parseOptionalBoolean,
  parseOptionalDocumentStatus,
  parseOptionalDocumentStatusList,
  parseOptionalDocumentType,
  parseOptionalListDocumentsPreset,
  parseOptionalListDocumentsSortField,
  parseOptionalLimit,
  parseOptionalSortOrder,
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
      preset: parseOptionalListDocumentsPreset(flags.preset),
      type: parseOptionalDocumentType(flags.type),
      status: parseOptionalDocumentStatus(flags.status),
      excludeStatuses: parseOptionalDocumentStatusList(flags["exclude-status"]),
      sort: parseOptionalListDocumentsSortField(flags.sort),
      order: parseOptionalSortOrder(flags.order),
      limit: parseOptionalLimit(flags.limit),
      includeBody: parseOptionalBoolean(flags["include-body"], "include-body"),
    }),
    io,
  );
};
