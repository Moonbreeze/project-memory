import { once } from "node:events";

import { createMcpResponse } from "./dispatch.ts";
import { formatResponsePayload, readMessage } from "./stdio.ts";
import { createJsonRpcErrorResponse } from "./types.ts";
import type { ResponseFormat } from "./stdio.ts";
import type { JsonRpcResponse } from "./types.ts";

/**
 * Mutable runtime state for the MCP stdio server.
 */
type ServerRuntimeState = {
  /** Buffered stdin bytes not yet parsed into a full message. */
  inputBuffer: Buffer;
  /** Serialized stdin work queue. */
  queuedReads: Array<() => Promise<void>>;
  /** Indicates whether the queue drain loop is active. */
  isDrainingReadQueue: boolean;
  /** Prevents duplicate shutdown handling after stdin closes. */
  stdinClosedHandled: boolean;
  /** Ref'ed timer that keeps the process alive between requests. */
  keepAliveTimer: ReturnType<typeof setInterval>;
};

/**
 * Creates the mutable stdio runtime state container.
 */
const createServerRuntimeState = (): ServerRuntimeState => {
  return {
    inputBuffer: Buffer.alloc(0),
    queuedReads: [],
    isDrainingReadQueue: false,
    stdinClosedHandled: false,
    keepAliveTimer: setInterval(() => undefined, 1 << 30),
  };
};

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

/**
 * Drains all complete MCP messages currently available in the input buffer.
 */
const drainInputBuffer = async (state: ServerRuntimeState): Promise<void> => {
  while (true) {
    let parsedMessage: ReturnType<typeof readMessage>;

    try {
      parsedMessage = readMessage(state.inputBuffer);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await writeResponse(
        createJsonRpcErrorResponse(undefined, -32700, messageText),
        "framed",
      );
      state.inputBuffer = Buffer.alloc(0);
      break;
    }

    if (!parsedMessage) {
      break;
    }

    state.inputBuffer = parsedMessage.remaining;
    await processMessage(parsedMessage.message, parsedMessage.responseFormat);
  }
};

/**
 * Reports one unexpected queued-read failure and marks the process as failed.
 */
const reportQueueError = (error: unknown): void => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};

/**
 * Drains queued stdin work in arrival order using `async`/`await`.
 */
const drainReadQueue = async (state: ServerRuntimeState): Promise<void> => {
  if (state.isDrainingReadQueue) {
    return;
  }

  state.isDrainingReadQueue = true;

  try {
    while (state.queuedReads.length > 0) {
      const nextRead = state.queuedReads.shift();
      if (!nextRead) {
        continue;
      }

      try {
        await nextRead();
      } catch (error) {
        reportQueueError(error);
      }
    }
  } finally {
    state.isDrainingReadQueue = false;

    if (state.queuedReads.length > 0) {
      void drainReadQueue(state);
    }
  }
};

/**
 * Appends one stdin processing task to the serialized read queue.
 */
const enqueueRead = (
  state: ServerRuntimeState,
  readTask: () => Promise<void>,
): void => {
  state.queuedReads.push(readTask);
  void drainReadQueue(state);
};

/**
 * Processes one incoming stdin chunk in queue order.
 */
const handleChunk = (
  state: ServerRuntimeState,
  chunk: string | Buffer,
): void => {
  const nextChunk = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);

  enqueueRead(state, async () => {
    state.inputBuffer = Buffer.concat([state.inputBuffer, nextChunk]);
    await drainInputBuffer(state);
  });
};

/**
 * Finishes the stdio server after stdin closes.
 */
const handleStdinClosed = (state: ServerRuntimeState): void => {
  if (state.stdinClosedHandled) {
    return;
  }

  state.stdinClosedHandled = true;

  enqueueRead(state, async () => {
    if (state.inputBuffer.byteLength > 0) {
      await writeResponse(
        createJsonRpcErrorResponse(undefined, -32700, "Incomplete MCP message at end of input"),
        "framed",
      );
    }

    clearInterval(state.keepAliveTimer);
  });
};

/**
 * Starts the MCP stdio server and attaches stdin lifecycle handlers.
 */
export const startMcpServer = (): void => {
  const state = createServerRuntimeState();

  process.stdin.on("data", (chunk: string | Buffer) => {
    handleChunk(state, chunk);
  });
  process.stdin.on("end", () => {
    handleStdinClosed(state);
  });
  process.stdin.on("close", () => {
    handleStdinClosed(state);
  });

  process.stdin.resume();
};
