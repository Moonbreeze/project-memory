import { createRepositoryContext, stopManagedWebServer } from "../../core/index.ts";
import { parseWebServerLifecycleInput } from "../types.ts";

/**
 * Executes the `web_stop` MCP tool.
 */
export const webStopTool = (params: unknown): unknown => {
  return stopManagedWebServer(parseWebServerLifecycleInput(params), createRepositoryContext());
};
