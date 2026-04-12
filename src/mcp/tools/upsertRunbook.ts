import { upsertRunbook } from "../../core/index.ts";
import { parseRunbookInput } from "../types.ts";

/**
 * Executes the `upsert_runbook` MCP tool.
 */
export const upsertRunbookTool = (params: unknown): unknown => {
  return upsertRunbook(parseRunbookInput(params));
};
