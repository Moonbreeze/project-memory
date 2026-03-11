import { createRepositoryContext, readDocument } from "../../core/index.ts";
import { parseReadDocumentPath } from "../types.ts";

/**
 * Executes the `read_document` MCP tool.
 */
export const readDocumentTool = (params: unknown): unknown => {
  return readDocument(createRepositoryContext(), parseReadDocumentPath(params));
};
