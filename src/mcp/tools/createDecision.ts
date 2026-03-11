import { createDecision } from "../../core/index.ts";
import { parseDecisionInput } from "../types.ts";

/**
 * Executes the `create_decision` MCP tool.
 */
export const createDecisionTool = (params: unknown): unknown => {
  return createDecision(parseDecisionInput(params));
};
