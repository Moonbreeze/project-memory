import fs from "node:fs";
import { Buffer } from "node:buffer";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createMcpResponse } from "../../src/mcp/dispatch.ts";
import { formatResponsePayload, readMessage } from "../../src/mcp/stdio.ts";
import { setupTestRepo } from "../fixtures/setupTestRepo.ts";

const rawDumpText = Array.from({ length: 18 }, (_value, index) => `$ command ${index + 1}`).join("\n");

/**
 * Returns `true` when a value is a plain object.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * Reads one JSON-RPC error payload from a response.
 */
const readError = (
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
const readResult = (response: unknown): unknown => {
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
const readToolResult = (
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
const callTool = (id: string, name: string, args: Record<string, unknown>): unknown => {
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

test("MCP server requires PROJECT_MEMORY_ROOT for document access", () => {
  delete process.env.PROJECT_MEMORY_ROOT;

  const response = callTool("0", "list_documents", {
    project: "acme-app",
  });

  const toolResult = readToolResult(response);
  assert.equal(toolResult.isError, true);
  assert.match(toolResult.content[0]?.text ?? "", /PROJECT_MEMORY_ROOT is required/);
});

test("MCP server negotiates down for newer unsupported protocol versions during initialize", () => {
  const response = createMcpResponse({
    jsonrpc: "2.0",
    id: "init-unsupported",
    method: "initialize",
    params: {
      protocolVersion: "2099-01-01",
      capabilities: {},
      clientInfo: {
        name: "tests",
        version: "1.0.0",
      },
    },
  });
  const initializeResult = readResult(response);

  if (!isRecord(initializeResult)) {
    throw new Error("Unexpected initialize result shape");
  }

  assert.equal(initializeResult.protocolVersion, "2025-11-25");
});

test("MCP server accepts the latest supported protocol version during initialize", () => {
  const response = createMcpResponse({
    jsonrpc: "2.0",
    id: "init-latest-supported",
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: {
        name: "tests",
        version: "1.0.0",
      },
    },
  });
  const initializeResult = readResult(response);

  if (!isRecord(initializeResult)) {
    throw new Error("Unexpected initialize result shape");
  }

  assert.equal(initializeResult.protocolVersion, "2025-11-25");
});

test("MCP server negotiates to the nearest supported older protocol revision", () => {
  const response = createMcpResponse({
    jsonrpc: "2.0",
    id: "init-nearest-supported",
    method: "initialize",
    params: {
      protocolVersion: "2025-08-01",
      capabilities: {},
      clientInfo: {
        name: "tests",
        version: "1.0.0",
      },
    },
  });
  const initializeResult = readResult(response);

  if (!isRecord(initializeResult)) {
    throw new Error("Unexpected initialize result shape");
  }

  assert.equal(initializeResult.protocolVersion, "2025-06-18");
});

test("MCP server rejects older unsupported protocol versions during initialize", () => {
  const response = createMcpResponse({
    jsonrpc: "2.0",
    id: "init-too-old",
    method: "initialize",
    params: {
      protocolVersion: "2024-01-01",
      capabilities: {},
      clientInfo: {
        name: "tests",
        version: "1.0.0",
      },
    },
  });
  const error = readError(response);

  assert.equal(error.code, -32602);
  assert.match(error.message, /Unsupported MCP protocol version/);
});

test("MCP server rejects malformed protocol versions during initialize", () => {
  const response = createMcpResponse({
    jsonrpc: "2.0",
    id: "init-malformed",
    method: "initialize",
    params: {
      protocolVersion: "latest",
      capabilities: {},
      clientInfo: {
        name: "tests",
        version: "1.0.0",
      },
    },
  });
  const error = readError(response);

  assert.equal(error.code, -32602);
  assert.match(error.message, /Unsupported MCP protocol version/);
});

test("MCP server returns JSON-RPC invalid-request errors for malformed requests", () => {
  const response = createMcpResponse({
    id: "invalid-1",
    method: "initialize",
  });
  const error = readError(response);

  assert.equal(error.code, -32600);
  assert.match(error.message, /Invalid MCP JSON-RPC request/);
});

test("MCP server returns JSON-RPC method-not-found errors for unknown methods", () => {
  const response = createMcpResponse({
    jsonrpc: "2.0",
    id: "missing-method-1",
    method: "documents/list",
  });
  const error = readError(response);

  assert.equal(error.code, -32601);
  assert.match(error.message, /Unknown MCP method/);
});

test("MCP server completes initialize and tools/list handshake", () => {
  const initializeResponse = createMcpResponse({
    jsonrpc: "2.0",
    id: "init-1",
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "tests",
        version: "1.0.0",
      },
    },
  });
  const initializeResult = readResult(initializeResponse);

  if (!isRecord(initializeResult) || !isRecord(initializeResult.capabilities) || !isRecord(initializeResult.serverInfo)) {
    throw new Error("Unexpected initialize result shape");
  }

  assert.equal(initializeResult.protocolVersion, "2024-11-05");
  assert(isRecord(initializeResult.capabilities.tools));
  assert.equal(initializeResult.serverInfo.name, "project-memory");

  const listResponse = createMcpResponse({
    jsonrpc: "2.0",
    id: "tools-1",
    method: "tools/list",
  });
  const listResult = readResult(listResponse);

  if (!isRecord(listResult) || !Array.isArray(listResult.tools)) {
    throw new Error("Expected a tools/list result");
  }

  const toolNames = listResult.tools
    .filter((tool): tool is Record<string, unknown> => isRecord(tool))
    .map((tool) => tool.name)
    .filter((name): name is string => typeof name === "string");

  assert(toolNames.includes("list_documents"));
  assert(toolNames.includes("append_session_note"));
  assert(toolNames.includes("commit_pending_changes"));
});

test("MCP stdio framing carries one initialize exchange", () => {
  const initializeRequest = {
    jsonrpc: "2.0",
    id: "stdio-init-1",
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "tests",
        version: "1.0.0",
      },
    },
  };
  const requestPayload = JSON.stringify(initializeRequest);
  const framedRequest = Buffer.from(
    `Content-Length: ${Buffer.byteLength(requestPayload, "utf8")}\r\n\r\n${requestPayload}`,
    "utf8",
  );
  const parsedRequest = readMessage(framedRequest);
  if (!parsedRequest) {
    throw new Error("Expected one framed initialize request");
  }

  assert.equal(parsedRequest.responseFormat, "framed");

  const response = createMcpResponse(JSON.parse(parsedRequest.message));
  if (!response) {
    throw new Error("Expected dispatcher to return one initialize response");
  }

  const framedResponse = formatResponsePayload(response, parsedRequest.responseFormat);
  const parsedResponse = readMessage(Buffer.from(framedResponse, "utf8"));
  if (!parsedResponse) {
    throw new Error("Expected one framed initialize response");
  }

  const initializeResult = readResult(JSON.parse(parsedResponse.message));
  if (!isRecord(initializeResult) || !isRecord(initializeResult.serverInfo)) {
    throw new Error("Expected framed initialize result");
  }

  assert.equal(initializeResult.protocolVersion, "2024-11-05");
  assert.equal(initializeResult.serverInfo.name, "project-memory");
});

test("MCP server appends and lists documents through standard tools/call", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const appendResponse = callTool("1", "append_session_note", {
    project: "acme-app",
    topic: "mcp flow",
    date: "2026-03-11",
    summary: "Verified MCP write path.",
    actions: ["Wrote a document through MCP tools/call"],
    followUp: ["List it back"],
  });

  const appendResult = readToolResult(appendResponse);
  assert.equal(appendResult.isError, false);

  const listResponse = callTool("2", "list_documents", {
    project: "acme-app",
  });
  const listResult = readToolResult(listResponse);
  if (
    !isRecord(listResult.structuredContent) ||
    !Array.isArray(listResult.structuredContent.documents) ||
    !isRecord(listResult.structuredContent.appliedQuery)
  ) {
    throw new Error("Expected structured list result to be an object with documents array");
  }

  const documents = listResult.structuredContent.documents;
  const firstResult = documents[0];
  if (!isRecord(firstResult) || typeof firstResult.relativePath !== "string") {
    throw new Error("Expected MCP list result items to contain relativePath");
  }

  assert.equal(documents.length, 1);
  assert.match(firstResult.relativePath, /projects\/acme-app\/session-log\//);
  assert.equal("body" in firstResult, false);
  assert.equal(listResult.structuredContent.appliedQuery.includeBody, false);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP list_documents backlog preset returns newest current decisions first", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  callTool("10", "create_decision", {
    project: "acme-app",
    topic: "older active",
    date: "2026-03-10",
    context: "Need an older active decision.",
    decision: "Keep older decisions visible.",
    consequences: ["Older item stays in backlog"],
    status: "active",
  });

  callTool("11", "create_decision", {
    project: "acme-app",
    topic: "newer draft",
    date: "2026-03-12",
    context: "Need a newer draft decision.",
    decision: "Keep draft decisions visible.",
    consequences: ["Newer item should sort first"],
    status: "draft",
  });

  callTool("12", "create_decision", {
    project: "acme-app",
    topic: "superseded hidden",
    date: "2026-03-13",
    context: "Need a hidden decision.",
    decision: "Superseded decisions should stay out of backlog.",
    consequences: ["Should be filtered"],
    status: "superseded",
  });

  const response = callTool("13", "list_documents", {
    project: "acme-app",
    preset: "backlog",
  });
  const toolResult = readToolResult(response);
  if (
    !isRecord(toolResult.structuredContent) ||
    !Array.isArray(toolResult.structuredContent.documents) ||
    !isRecord(toolResult.structuredContent.appliedQuery)
  ) {
    throw new Error("Expected structured backlog list result");
  }

  const documents = toolResult.structuredContent.documents;
  assert.deepEqual(
    documents.map((document) => {
      if (!isRecord(document) || !isRecord(document.metadata) || typeof document.metadata.topic !== "string") {
        throw new Error("Expected listed document metadata");
      }

      return document.metadata.topic;
    }),
    ["newer-draft", "older-active"],
  );
  assert.deepEqual(toolResult.structuredContent.appliedQuery.excludeStatuses, ["superseded", "archived"]);
  assert.equal(toolResult.structuredContent.appliedQuery.sort, "date");
  assert.equal(toolResult.structuredContent.appliedQuery.order, "desc");

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP server rejects reading unmanaged document paths", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  fs.mkdirSync(path.join(rootDir, "projects", "acme-app", "scratch"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "projects", "acme-app", "scratch", "unmanaged.md"),
    "---\ndate: 2026-03-11\nproject: acme-app\ntopic: unmanaged\nsource: manual\nstatus: active\n---\n\nscratch\n",
    "utf8",
  );

  const response = callTool("3", "read_document", {
    path: "projects/acme-app/scratch/unmanaged.md",
  });
  const toolResult = readToolResult(response);

  assert.equal(toolResult.isError, true);
  assert.match(toolResult.content[0]?.text ?? "", /approved project-memory document paths/);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP server rejects commit messages that do not match the enforced format", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  callTool("4", "append_session_note", {
    project: "acme-app",
    topic: "mcp invalid commit",
    date: "2026-03-11",
    summary: "Prepared invalid MCP commit message coverage.",
    actions: ["Created a managed document"],
    followUp: ["Reject invalid commit format"],
  });

  const response = callTool("5", "commit_pending_changes", {
    message: "invalid commit message",
  });
  const toolResult = readToolResult(response);

  assert.equal(toolResult.isError, true);
  assert.match(toolResult.content[0]?.text ?? "", /docs\(<scope>\): <summary>/);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP server rejects secret-like content for upsert_provider_note", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const response = callTool("6", "upsert_provider_note", {
    project: "acme-app",
    provider: "claude",
    date: "2026-03-11",
    overview: "Uses token sk-1234567890abcdefghijklmnop internally.",
    constraints: ["needs context"],
    guidance: ["do not store secrets"],
  });
  const toolResult = readToolResult(response);

  assert.equal(toolResult.isError, true);
  assert.match(toolResult.content[0]?.text ?? "", /secret-like content/);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP server upserts canonical docs and returns them through list_documents", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const writeResponse = callTool("canonical-write", "upsert_canonical_doc", {
    project: "acme-app",
    topic: "resume policy",
    registryScope: "resume-flow",
    date: "2026-03-11",
    summary: "Canonical guidance for the resume scope.",
    guidance: ["Prefer registry-backed scope names"],
    references: ["taxonomy-registry-baseline"],
  });
  const writeResult = readToolResult(writeResponse);

  assert.notEqual(writeResult.isError, true);

  const listResponse = callTool("canonical-list", "list_documents", {
    project: "acme-app",
    type: "canonical-doc",
    includeBody: true,
  });
  const listResult = readToolResult(listResponse);

  if (
    !isRecord(listResult.structuredContent) ||
    !Array.isArray(listResult.structuredContent.documents) ||
    !isRecord(listResult.structuredContent.documents[0]) ||
    !isRecord(listResult.structuredContent.documents[0].metadata)
  ) {
    throw new Error("Expected canonical-doc list payload");
  }

  assert.equal(listResult.structuredContent.documents.length, 1);
  assert.equal(listResult.structuredContent.documents[0].metadata.registry_scope, "resume-flow");

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP server rejects env-style content for create_decision", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const response = callTool("7", "create_decision", {
    project: "acme-app",
    topic: "unsafe decision",
    date: "2026-03-11",
    context: "Need a storage policy.",
    decision: "FEATURE_FLAG=enabled",
    consequences: ["rotate credentials"],
  });
  const toolResult = readToolResult(response);

  assert.equal(toolResult.isError, true);
  assert.match(toolResult.content[0]?.text ?? "", /\.env-style content/);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP server rejects raw dump content for create_runbook", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const response = callTool("8", "create_runbook", {
    project: "acme-app",
    topic: "unsafe runbook",
    date: "2026-03-11",
    purpose: rawDumpText,
    procedure: ["step one"],
    verification: ["step two"],
  });
  const toolResult = readToolResult(response);

  assert.equal(toolResult.isError, true);
  assert.match(toolResult.content[0]?.text ?? "", /raw command output or an unreviewed dump/);

  delete process.env.PROJECT_MEMORY_ROOT;
});
