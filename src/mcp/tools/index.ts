import type { McpToolDefinition } from "../types.ts";

import { registeredMcpTools } from "./registry.ts";

export type { McpToolHandler } from "./toolTypes.ts";

/**
 * Returns the MCP tools advertised through `tools/list`.
 */
export const listMcpTools = (): McpToolDefinition[] => {
  return Object.values(registeredMcpTools).map(({ handler: _handler, ...tool }) => tool);
};

/**
 * Executes one registered MCP tool.
 */
export const executeMcpTool = (name: string, params: unknown): unknown => {
  const tool = registeredMcpTools[name];
  if (!tool) {
    throw new Error(`Unknown MCP tool: ${name}`);
  }

  return tool.handler(params);
};
