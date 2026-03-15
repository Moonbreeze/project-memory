import type { McpToolDefinition, ToolResultMode } from "../types.ts";

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
  /** Controls whether successful results should be compacted before returning to MCP hosts. */
  resultMode?: ToolResultMode;
};
