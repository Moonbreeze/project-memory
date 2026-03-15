import { executeMcpTool, getRegisteredMcpTool, listMcpTools } from "./tools/index.ts";
import {
  createInitializeResult,
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
  JsonRpcResponseError,
  createToolCallErrorResult,
  createToolCallResult,
  parseJsonRpcRequest,
  parseToolCallRequest,
} from "./types.ts";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.ts";

/**
 * Executes one validated MCP method against the shared core.
 */
export const handleMethod = (request: JsonRpcRequest): unknown => {
  if (request.method === "initialize") {
    const requestedProtocolVersion =
      request.params && typeof request.params.protocolVersion === "string"
        ? request.params.protocolVersion
        : undefined;

    return createInitializeResult(requestedProtocolVersion);
  }

  if (request.method === "notifications/initialized") {
    return null;
  }

  if (request.method === "ping") {
    return {};
  }

  if (request.method === "tools/list") {
    return {
      tools: listMcpTools(),
    };
  }

  if (request.method === "tools/call") {
    const toolCall = parseToolCallRequest(request.params);
    const tool = getRegisteredMcpTool(toolCall.name);

    try {
      return createToolCallResult(executeMcpTool(toolCall.name, toolCall.arguments), tool.resultMode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createToolCallErrorResult(message);
    }
  }

  throw new JsonRpcResponseError(-32601, `Unknown MCP method: ${request.method}`);
};

/**
 * Converts one raw JSON-compatible request value into one JSON-RPC response.
 */
export const createMcpResponse = (rawValue: unknown): JsonRpcResponse | undefined => {
  let requestId: JsonRpcRequest["id"];

  try {
    const request = parseJsonRpcRequest(rawValue);
    requestId = request.id;

    if (request.id === undefined) {
      try {
        handleMethod(request);
      } catch {
        return undefined;
      }

      return undefined;
    }

    return createJsonRpcSuccessResponse(request.id, handleMethod(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof JsonRpcResponseError ? error.code : -32603;
    return createJsonRpcErrorResponse(requestId, code, message);
  }
};
