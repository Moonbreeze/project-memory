import { createRunbook } from "../../core/index.ts";
import { parseRunbookInput } from "../types.ts";

/**
 * Executes the legacy `create_runbook` MCP alias.
 */
export const createRunbookTool = (params: unknown): unknown => {
  return createRunbook(parseRunbookInput(params));
};
