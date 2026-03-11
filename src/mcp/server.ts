import {
  createMcpResponse,
} from "./dispatch.ts";
import { once } from "node:events";

import { formatResponsePayload, readMessage } from "./stdio.ts";
import { createJsonRpcErrorResponse } from "./types.ts";
import type { JsonRpcResponse } from "./types.ts";
import type { ResponseFormat } from "./stdio.ts";

/**
 * Writes one JSON-RPC response to stdout using the selected transport format.
 */
const writeResponse = async (
  response: JsonRpcResponse,
  responseFormat: ResponseFormat,
): Promise<void> => {
  const framedPayload = formatResponsePayload(response, responseFormat);
  if (!process.stdout.write(framedPayload)) {
    await once(process.stdout, "drain");
  }
};

/**
 * Parses and processes one framed JSON-RPC message body.
 */
const processMessage = async (
  message: string,
  responseFormat: ResponseFormat,
): Promise<void> => {
  try {
    const parsedValue: unknown = JSON.parse(message);
    const response = createMcpResponse(parsedValue);
    if (response) {
      await writeResponse(response, responseFormat);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await writeResponse(
      createJsonRpcErrorResponse(undefined, -32700, messageText),
      responseFormat,
    );
  }
};

let inputBuffer: Buffer = Buffer.alloc(0);
let readPipeline: Promise<void> = Promise.resolve();
let stdinClosedHandled = false;

/**
 * Drains all complete MCP messages currently available in the input buffer.
 */
const drainInputBuffer = async (): Promise<void> => {
  while (true) {
    let parsedMessage: ReturnType<typeof readMessage>;

    try {
      parsedMessage = readMessage(inputBuffer);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await writeResponse(
        createJsonRpcErrorResponse(undefined, -32700, messageText),
        "framed",
      );
      inputBuffer = Buffer.alloc(0);
      break;
    }

    if (!parsedMessage) {
      break;
    }

    inputBuffer = parsedMessage.remaining;
    await processMessage(parsedMessage.message, parsedMessage.responseFormat);
  }
};

process.stdin.on("data", (chunk: string | Buffer) => {
  const nextChunk = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
  readPipeline = readPipeline.then(async () => {
    inputBuffer = Buffer.concat([inputBuffer, nextChunk]);
    await drainInputBuffer();
  });
});

// ESM stdio processes can exit between requests unless one ref'ed handle stays alive.
const keepAliveTimer = setInterval(() => undefined, 1 << 30);

/**
 * Finishes the stdio server after stdin closes.
 */
const handleStdinClosed = (): void => {
  if (stdinClosedHandled) {
    return;
  }

  stdinClosedHandled = true;
  readPipeline = readPipeline.then(async () => {
    if (inputBuffer.byteLength > 0) {
      await writeResponse(
        createJsonRpcErrorResponse(undefined, -32700, "Incomplete MCP message at end of input"),
        "framed",
      );
    }

    clearInterval(keepAliveTimer);
  });
};

process.stdin.on("end", handleStdinClosed);
process.stdin.on("close", handleStdinClosed);

process.stdin.resume();
