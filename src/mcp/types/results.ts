import { isRecord } from "../../core/index.ts";

/**
 * One MCP text content item returned from a tool call.
 */
export type ToolTextContent = {
  /** Content discriminant. */
  type: "text";
  /** Human-readable payload. */
  text: string;
};

/**
 * One structured MCP tool result.
 */
export type ToolCallResult = {
  /** Human-readable content returned to the MCP host. */
  content: ToolTextContent[];
  /** Optional structured payload for machine consumers. */
  structuredContent?: unknown;
  /** Indicates a handled tool error. */
  isError?: boolean;
};

/**
 * Controls how one successful MCP tool result should be shaped.
 */
export type ToolResultMode = "default-json" | "compact-document";

/**
 * Minimal JSON schema property shape exposed to MCP hosts.
 */
export type JsonSchemaProperty = {
  /** Property JSON schema type. */
  type: "string" | "number" | "array" | "boolean";
  /** Optional property description. */
  description: string;
  /** Optional array item schema. */
  items?: {
    /** Array item JSON schema type. */
    type: "string";
  } | JsonSchemaObject;
  /** Optional enum values for string fields. */
  enum?: string[];
};

/**
 * Minimal JSON schema object shape exposed to MCP hosts.
 */
export type JsonSchemaObject = {
  /** Schema root type. */
  type: "object";
  /** Tool input property definitions. */
  properties: Record<string, JsonSchemaProperty>;
  /** Required property names. */
  required?: string[];
  /** Reject undeclared properties. */
  additionalProperties: boolean;
};

/**
 * One MCP tool definition advertised through `tools/list`.
 */
export type McpToolDefinition = {
  /** Stable tool name exposed to clients. */
  name: string;
  /** Human-readable tool description. */
  description: string;
  /** JSON schema for tool arguments. */
  inputSchema: JsonSchemaObject;
};

/**
 * One validated `tools/call` payload.
 */
export type ToolCallRequest = {
  /** Target tool name. */
  name: string;
  /** Tool arguments object. */
  arguments: Record<string, unknown>;
};

/**
 * Returns `true` when a value looks like one parsed document result.
 */
const isParsedDocumentResult = (
  value: unknown,
): value is {
  path: string;
  relativePath: string;
  type: string;
  metadata: Record<string, unknown>;
  body: string;
} => {
  if (!isRecord(value) || !isRecord(value.metadata)) {
    return false;
  }

  return (
    typeof value.path === "string"
    && typeof value.relativePath === "string"
    && typeof value.type === "string"
    && typeof value.body === "string"
  );
};

/**
 * Removes large document bodies from compact MCP write results.
 */
const compactToolCallValue = (value: unknown, mode: ToolResultMode): unknown => {
  if (mode !== "compact-document" || !isParsedDocumentResult(value)) {
    return value;
  }

  const { body: _body, ...compactDocument } = value;
  return compactDocument;
};

/**
 * Builds a concise human-readable summary for compact document tool results.
 */
const createCompactDocumentText = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.relativePath !== "string" || typeof value.type !== "string") {
    return null;
  }

  const metadata = isRecord(value.metadata) ? value.metadata : null;
  const status = metadata && typeof metadata.status === "string" ? metadata.status : null;
  const workItemState =
    metadata && typeof metadata.work_item_state === "string" ? metadata.work_item_state : null;

  if (status === "archived") {
    return `Archived ${value.type} at ${value.relativePath}.`;
  }

  if (value.type === "work-item" && (workItemState === "done" || workItemState === "canceled")) {
    return `Updated work-item at ${value.relativePath} to ${workItemState}.`;
  }

  return `Updated ${value.type} at ${value.relativePath}.`;
};

/**
 * Formats one successful tool result for MCP clients.
 */
export const createToolCallResult = (
  value: unknown,
  mode: ToolResultMode = "default-json",
): ToolCallResult => {
  const structuredContent = compactToolCallValue(value, mode);
  const text =
    mode === "compact-document"
      ? createCompactDocumentText(structuredContent) ?? JSON.stringify(structuredContent, null, 2)
      : JSON.stringify(structuredContent, null, 2);

  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    structuredContent,
  };
};

/**
 * Formats one handled tool error for MCP clients.
 */
export const createToolCallErrorResult = (message: string): ToolCallResult => {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError: true,
  };
};
