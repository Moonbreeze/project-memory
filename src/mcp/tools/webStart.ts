import { createRepositoryContext, startManagedWebServer } from "../../core/index.ts";
import { parseWebServerLifecycleInput } from "../types.ts";

/**
 * Executes the `web_start` MCP tool.
 */
export const webStartTool = (params: unknown): unknown => {
  return startManagedWebServer(parseWebServerLifecycleInput(params), createRepositoryContext());
};
