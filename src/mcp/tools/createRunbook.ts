import { createRunbook } from "../../core/index.ts";
import { parseRunbookInput } from "../types.ts";

/**
 * Executes the `create_runbook` MCP tool.
 */
export const createRunbookTool = (params: unknown): unknown => {
  return createRunbook(parseRunbookInput(params));
};
