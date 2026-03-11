import {
  isDocumentSource,
  isDocumentStatus,
  isDocumentType,
} from "../core/index.ts";
import type {
  CommitPendingChangesInput,
  DecisionInput,
  DocumentSource,
  DocumentStatus,
  DocumentType,
  ProviderNoteInput,
  RunbookInput,
  SearchQuery,
  SessionNoteInput,
  VerificationResultInput,
} from "../core/index.ts";

/**
 * JSON-RPC request identifier.
 */
export type RequestId = string | number | null;

/**
 * One JSON-RPC request accepted by the MCP server.
 */
export type JsonRpcRequest = {
  /** JSON-RPC protocol marker. */
  jsonrpc: "2.0";
  /** Optional request identifier. */
  id?: RequestId;
  /** Requested MCP method name. */
  method: string;
  /** Optional method parameters. */
  params?: Record<string, unknown>;
};

/**
 * One JSON-RPC error object emitted by the MCP server.
 */
export type JsonRpcError = {
  /** JSON-RPC numeric error code. */
  code: number;
  /** Human-readable error message. */
  message: string;
};

const SupportedProtocolVersion = [
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
] as const;
type SupportedProtocolVersion = typeof SupportedProtocolVersion[number];

const isSupportedProtocolVersion = (value: unknown): value is SupportedProtocolVersion => {
  return typeof value === "string" && SupportedProtocolVersion.some((version) => version === value);
};

/**
 * Returns `true` when a value matches MCP's date-based protocol version format.
 */
const isProtocolVersionString = (value: unknown): value is string => {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
};

/**
 * Negotiates the protocol version to use for this session.
 */
const negotiateProtocolVersion = (
  requestedProtocolVersion?: string,
): SupportedProtocolVersion => {
  if (requestedProtocolVersion === undefined) {
    return SupportedProtocolVersion[SupportedProtocolVersion.length - 1];
  }

  const normalizedProtocolVersion = requestedProtocolVersion.trim();
  if (isSupportedProtocolVersion(normalizedProtocolVersion)) {
    return normalizedProtocolVersion;
  }

  if (isProtocolVersionString(normalizedProtocolVersion)) {
    const negotiatedProtocolVersion = [...SupportedProtocolVersion]
      .reverse()
      .find((supportedProtocolVersion) => supportedProtocolVersion <= normalizedProtocolVersion);

    if (negotiatedProtocolVersion) {
      return negotiatedProtocolVersion;
    }
  }

  throw new JsonRpcResponseError(
    -32602,
    `Unsupported MCP protocol version: ${requestedProtocolVersion}`,
  );
};

/**
 * One JSON-RPC response emitted by the MCP server.
 */
export type JsonRpcResponse = {
  /** JSON-RPC protocol marker. */
  jsonrpc: "2.0";
  /** Optional request identifier echoed from the request. */
  id?: RequestId;
  /** Successful result payload. */
  result?: unknown;
  /** Error payload for failed requests. */
  error?: JsonRpcError;
};

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
 * Minimal JSON schema property shape exposed to MCP hosts.
 */
export type JsonSchemaProperty = {
  /** Property JSON schema type. */
  type: "string" | "number" | "array";
  /** Optional property description. */
  description: string;
  /** Optional array item schema. */
  items?: {
    /** Array item JSON schema type. */
    type: "string";
  };
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
 * Initialize result returned by the MCP server.
 */
export type InitializeResult = {
  /** Negotiated MCP protocol version. */
  protocolVersion: string;
  /** Server capability declaration. */
  capabilities: {
    /** Supported server-side tools. */
    tools: Record<string, never>;
  };
  /** Basic server identity. */
  serverInfo: {
    /** Server display name. */
    name: string;
    /** Server version string. */
    version: string;
  };
};

/**
 * One typed JSON-RPC error raised during request validation or dispatch.
 */
export class JsonRpcResponseError extends Error {
  /** JSON-RPC numeric error code to return to the client. */
  code: number;

  /**
   * Creates one typed JSON-RPC error.
   */
  constructor(code: number, message: string) {
    super(message);
    this.name = "JsonRpcResponseError";
    this.code = code;
  }
}

/**
 * Returns `true` when a value is a plain object.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * Reads a required non-empty string field from unknown input.
 */
const readRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid or missing string field: ${fieldName}`);
  }

  return value;
};

/**
 * Reads an optional string field from unknown input.
 */
const readOptionalString = (value: unknown, fieldName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return readRequiredString(value, fieldName);
};

/**
 * Reads a required string-array field from unknown input.
 */
const readStringArray = (value: unknown, fieldName: string): string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Invalid string array field: ${fieldName}`);
  }

  return value;
};

/**
 * Reads an optional finite numeric field from unknown input.
 */
const readOptionalNumber = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid numeric field: ${fieldName}`);
  }

  return value;
};

/**
 * Reads an optional validated document source from unknown input.
 */
const readOptionalDocumentSource = (value: unknown): DocumentSource | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isDocumentSource(value)) {
    throw new Error("Invalid document source");
  }

  return value;
};

/**
 * Reads an optional validated document status from unknown input.
 */
const readOptionalDocumentStatus = (value: unknown): DocumentStatus | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isDocumentStatus(value)) {
    throw new Error("Invalid document status");
  }

  return value;
};

/**
 * Reads an optional validated document type from unknown input.
 */
const readOptionalDocumentType = (value: unknown): DocumentType | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isDocumentType(value)) {
    throw new Error("Invalid document type");
  }

  return value;
};

/**
 * Normalizes unknown params into a plain record.
 */
const readParams = (value: unknown): Record<string, unknown> => {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("MCP params must be an object");
  }

  return value;
};

/**
 * Returns `true` when `value` is a valid JSON-RPC request shape.
 */
export const isJsonRpcRequest = (value: unknown): value is JsonRpcRequest => {
  if (!isRecord(value)) {
    return false;
  }

  const id = value.id;
  const validId =
    id === undefined || id === null || typeof id === "string" || typeof id === "number";

  return (
    value.jsonrpc === "2.0" &&
    validId &&
    typeof value.method === "string" &&
    (value.params === undefined || isRecord(value.params))
  );
};

/**
 * Parses one raw request value into a validated JSON-RPC request.
 */
export const parseJsonRpcRequest = (value: unknown): JsonRpcRequest => {
  if (!isJsonRpcRequest(value)) {
    throw new JsonRpcResponseError(-32600, "Invalid MCP JSON-RPC request");
  }

  return value;
};

/**
 * Parses `tools/call` params into a validated tool invocation.
 */
export const parseToolCallRequest = (value: unknown): ToolCallRequest => {
  try {
    const params = readParams(value);

    return {
      name: readRequiredString(params.name, "name"),
      arguments: readParams(params.arguments),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JsonRpcResponseError(-32602, message);
  }
};

/**
 * Builds a successful JSON-RPC response.
 */
export const createJsonRpcSuccessResponse = (
  id: RequestId | undefined,
  result: unknown,
): JsonRpcResponse => {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
};

/**
 * Builds one JSON-RPC error response.
 */
export const createJsonRpcErrorResponse = (
  id: RequestId | undefined,
  code: number,
  message: string,
): JsonRpcResponse => {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
};

/**
 * Formats one successful tool result for MCP clients.
 */
export const createToolCallResult = (value: unknown): ToolCallResult => {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value,
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

/**
 * Returns the static MCP initialize payload for this server.
 */
export const createInitializeResult = (
  requestedProtocolVersion?: string,
): InitializeResult => {
  return {
    protocolVersion: negotiateProtocolVersion(requestedProtocolVersion),
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: "project-memory",
      version: "0.1.0",
    },
  };
};

/**
 * Parses params for `append_session_note`.
 */
export const parseSessionNoteInput = (value: unknown): SessionNoteInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    summary: readRequiredString(params.summary, "summary"),
    actions: readStringArray(params.actions, "actions"),
    followUp: readStringArray(params.followUp, "followUp"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
    projectCommit: readOptionalString(params.projectCommit, "projectCommit"),
  };
};

/**
 * Parses params for `record_verification_result`.
 */
export const parseVerificationResultInput = (
  value: unknown,
): VerificationResultInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    scope: readRequiredString(params.scope, "scope"),
    steps: readStringArray(params.steps, "steps"),
    result: readRequiredString(params.result, "result"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
    projectCommit: readOptionalString(params.projectCommit, "projectCommit"),
  };
};

/**
 * Parses params for `upsert_provider_note`.
 */
export const parseProviderNoteInput = (value: unknown): ProviderNoteInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readOptionalString(params.topic, "topic") ?? readRequiredString(params.provider, "provider"),
    provider: readRequiredString(params.provider, "provider"),
    overview: readRequiredString(params.overview, "overview"),
    constraints: readStringArray(params.constraints, "constraints"),
    guidance: readStringArray(params.guidance, "guidance"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
    projectCommit: readOptionalString(params.projectCommit, "projectCommit"),
  };
};

/**
 * Parses params for `create_decision`.
 */
export const parseDecisionInput = (value: unknown): DecisionInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    context: readRequiredString(params.context, "context"),
    decision: readRequiredString(params.decision, "decision"),
    consequences: readStringArray(params.consequences, "consequences"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
    projectCommit: readOptionalString(params.projectCommit, "projectCommit"),
  };
};

/**
 * Parses params for `create_runbook`.
 */
export const parseRunbookInput = (value: unknown): RunbookInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    purpose: readRequiredString(params.purpose, "purpose"),
    procedure: readStringArray(params.procedure, "procedure"),
    verification: readStringArray(params.verification, "verification"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
    projectCommit: readOptionalString(params.projectCommit, "projectCommit"),
  };
};

/**
 * Parses params for `list_documents`.
 */
export const parseListDocumentsQuery = (value: unknown): Omit<SearchQuery, "text"> => {
  const params = readParams(value);

  return {
    project: readOptionalString(params.project, "project"),
    type: readOptionalDocumentType(params.type),
    limit: readOptionalNumber(params.limit, "limit"),
  };
};

/**
 * Parses params for `search_documents`.
 */
export const parseSearchDocumentsQuery = (value: unknown): SearchQuery => {
  const params = readParams(value);

  return {
    project: readOptionalString(params.project, "project"),
    text: readOptionalString(params.text, "text"),
    type: readOptionalDocumentType(params.type),
    limit: readOptionalNumber(params.limit, "limit"),
  };
};

/**
 * Parses params for `read_document`.
 */
export const parseReadDocumentPath = (value: unknown): string => {
  const params = readParams(value);
  return readRequiredString(params.path, "path");
};

/**
 * Parses params for `commit_pending_changes`.
 */
export const parseCommitPendingChangesInput = (
  value: unknown,
): CommitPendingChangesInput => {
  const params = readParams(value);

  return {
    message: readRequiredString(params.message, "message"),
  };
};
