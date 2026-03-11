import { listDocuments } from "../../core/index.ts";
import { parseListDocumentsQuery } from "../types.ts";

/**
 * Executes the `list_documents` MCP tool.
 */
export const listDocumentsTool = (params: unknown): unknown => {
  const documents = listDocuments(parseListDocumentsQuery(params));
  return { documents };
};
