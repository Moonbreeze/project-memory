import { searchDocuments } from "../../core/index.ts";
import { parseSearchDocumentsQuery } from "../types.ts";

/**
 * Executes the `search_documents` MCP tool.
 */
export const searchDocumentsTool = (params: unknown): unknown => {
  const documents = searchDocuments(parseSearchDocumentsQuery(params));
  return { documents };
};
