import { archiveDocument } from "../../core/index.ts";
import { parseArchiveDocumentInput } from "../types.ts";

/**
 * Executes the `archive_document` MCP tool.
 */
export const archiveDocumentTool = (params: unknown): unknown => {
  return archiveDocument(parseArchiveDocumentInput(params));
};
