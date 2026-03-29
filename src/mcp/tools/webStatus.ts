import { createRepositoryContext, getManagedWebServerStatus } from "../../core/index.ts";
import { parseWebServerLifecycleInput } from "../types.ts";

/**
 * Executes the `web_status` MCP tool.
 */
export const webStatusTool = (params: unknown): unknown => {
  return getManagedWebServerStatus(parseWebServerLifecycleInput(params), createRepositoryContext());
};
