import { createMcpResponse } from "../../src/mcp/dispatch.ts";

import { isRecord } from "./testSupport.ts";

/**
 * Reads one JSON-RPC error payload from a response.
 */
export const readError = (
  response: unknown,
): {
  code: number;
  message: string;
} => {
  if (!isRecord(response) || !isRecord(response.error)) {
    throw new Error("Expected a JSON-RPC error response object");
  }

  if (typeof response.error.code !== "number" || typeof response.error.message !== "string") {
    throw new Error("Expected a JSON-RPC error payload");
  }

  return {
    code: response.error.code,
    message: response.error.message,
  };
};

/**
 * Reads one successful JSON-RPC result payload from a response.
 */
export const readResult = (response: unknown): unknown => {
  if (!isRecord(response)) {
    throw new Error("Expected a JSON-RPC response object");
  }

  if ("error" in response && response.error !== undefined) {
    throw new Error(`Expected success response, received error: ${JSON.stringify(response.error)}`);
  }

  return response.result;
};

/**
 * Reads one tool-call result payload from a JSON-RPC response.
 */
export const readToolResult = (
  response: unknown,
): {
  content: { type: string; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
} => {
  const result = readResult(response);
  if (!isRecord(result) || !Array.isArray(result.content)) {
    throw new Error("Expected a tool result payload");
  }

  return {
    content: result.content.map((entry) => {
      if (!isRecord(entry) || typeof entry.type !== "string" || typeof entry.text !== "string") {
        throw new Error("Expected text content items");
      }

      return {
        type: entry.type,
        text: entry.text,
      };
    }),
    structuredContent: result.structuredContent,
    isError: result.isError === true,
  };
};

/**
 * Sends one standard MCP `tools/call` request through the dispatcher.
 */
export const callTool = (id: string, name: string, args: Record<string, unknown>): unknown => {
  return createMcpResponse({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name,
      arguments: args,
    },
  });
};
