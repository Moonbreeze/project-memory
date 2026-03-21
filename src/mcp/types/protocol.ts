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
  return (
    typeof value === "string"
    && SupportedProtocolVersion.some((supportedProtocolVersion) => supportedProtocolVersion === value)
  );
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
 * Returns `true` when `value` is a valid JSON-RPC request shape.
 */
export const isJsonRpcRequest = (value: unknown): value is JsonRpcRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const id = record.id;
  const validId =
    id === undefined || id === null || typeof id === "string" || typeof id === "number";

  return (
    record.jsonrpc === "2.0" &&
    validId &&
    typeof record.method === "string" &&
    (record.params === undefined
      || (typeof record.params === "object" && record.params !== null && !Array.isArray(record.params)))
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
