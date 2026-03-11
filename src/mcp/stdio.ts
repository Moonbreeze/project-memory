import type { JsonRpcResponse } from "./types.ts";

/**
 * Supported transport framing formats for the MCP stdio server.
 */
export type ResponseFormat = "framed" | "line";

/**
 * One parsed stdio message plus any unread trailing bytes.
 */
export type ParsedStdioMessage = {
  /** Decoded JSON-RPC payload. */
  message: string;
  /** Remaining unread bytes after the parsed message. */
  remaining: Buffer;
  /** Transport framing format used for the parsed message. */
  responseFormat: ResponseFormat;
};

/**
 * Serializes one JSON-RPC response using the selected stdio framing.
 */
export const formatResponsePayload = (
  response: JsonRpcResponse,
  responseFormat: ResponseFormat,
): string => {
  const payload = JSON.stringify(response);
  return responseFormat === "framed"
    ? `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`
    : `${payload}\n`;
};

/**
 * Extracts one complete JSON-RPC message from the stdio input buffer.
 */
export const readMessage = (inputBuffer: Buffer): ParsedStdioMessage | undefined => {
  const crlfSeparator = inputBuffer.indexOf("\r\n\r\n");
  const lfSeparator = inputBuffer.indexOf("\n\n");
  let headerSeparator = -1;
  let separatorLength = 0;

  if (crlfSeparator !== -1 && (lfSeparator === -1 || crlfSeparator < lfSeparator)) {
    headerSeparator = crlfSeparator;
    separatorLength = 4;
  } else if (lfSeparator !== -1) {
    headerSeparator = lfSeparator;
    separatorLength = 2;
  } else {
    const newlineIndex = inputBuffer.indexOf("\n");
    const trimmedBuffer = inputBuffer.toString("utf8").trim();
    if (newlineIndex !== -1 && trimmedBuffer.startsWith("{")) {
      return {
        message: inputBuffer.subarray(0, newlineIndex).toString("utf8").trim(),
        remaining: inputBuffer.subarray(newlineIndex + 1),
        responseFormat: "line",
      };
    }

    return undefined;
  }

  const headerText = inputBuffer.subarray(0, headerSeparator).toString("utf8");
  const headerLines = headerText.includes("\r\n")
    ? headerText.split("\r\n")
    : headerText.split("\n");
  const contentLengthHeader = headerLines.find((line) =>
    line.toLowerCase().startsWith("content-length:"),
  );

  if (!contentLengthHeader) {
    throw new Error("Missing Content-Length header");
  }

  const contentLengthValue = contentLengthHeader.slice("content-length:".length).trim();
  const contentLength = Number.parseInt(contentLengthValue, 10);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    throw new Error("Invalid Content-Length header");
  }

  const bodyStart = headerSeparator + separatorLength;
  const bodyEnd = bodyStart + contentLength;
  if (inputBuffer.length < bodyEnd) {
    return undefined;
  }

  return {
    message: inputBuffer.subarray(bodyStart, bodyEnd).toString("utf8"),
    remaining: inputBuffer.subarray(bodyEnd),
    responseFormat: "framed",
  };
};
