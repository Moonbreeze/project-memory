import { createRepositoryContext, readColdStart } from "../../core/index.ts";
import { parseColdStartInput } from "../types.ts";

/**
 * Executes the `read_cold_start` MCP tool.
 */
export const readColdStartTool = (params: unknown): unknown => {
  return readColdStart(parseColdStartInput(params), createRepositoryContext());
};
