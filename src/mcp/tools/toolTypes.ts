import type { McpToolDefinition } from "../types.ts";

/**
 * MCP tool handler signature.
 */
export type McpToolHandler = (params: unknown) => unknown;

/**
 * One registered MCP tool and its runtime handler.
 */
export type RegisteredMcpTool = McpToolDefinition & {
  /** Runtime handler invoked through `tools/call`. */
  handler: McpToolHandler;
};
