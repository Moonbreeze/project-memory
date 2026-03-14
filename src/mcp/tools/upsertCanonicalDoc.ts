import { upsertCanonicalDoc } from "../../core/index.ts";
import { parseCanonicalDocInput } from "../types.ts";

/**
 * Executes the `upsert_canonical_doc` MCP tool.
 */
export const upsertCanonicalDocTool = (params: unknown): unknown => {
  return upsertCanonicalDoc(parseCanonicalDocInput(params));
};
