import type { RegisteredMcpTool } from "./toolTypes.ts";

import { lifecycleMcpTools } from "./definitions/lifecycleTools.ts";
import { queryMcpTools } from "./definitions/queryTools.ts";
import { writeMcpTools } from "./definitions/writeTools.ts";

/**
 * Registered MCP tools keyed by tool name.
 */
export const registeredMcpTools: Record<string, RegisteredMcpTool> = {
  ...queryMcpTools,
  ...writeMcpTools,
  ...lifecycleMcpTools,
};
