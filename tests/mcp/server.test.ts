import fs from "node:fs";
import { Buffer } from "node:buffer";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createMcpResponse } from "../../src/mcp/dispatch.ts";
import { formatResponsePayload, readMessage } from "../../src/mcp/stdio.ts";
import {
  createTestRepositoryContext,
  setupTestProjectTaxonomy,
  setupTestRepo,
} from "../fixtures/setupTestRepo.ts";

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

test("MCP bootstrap_project creates the reserved taxonomy registry surface", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;
  try {
    const response = callTool("bootstrap-project", "bootstrap_project", {
      project: "Acme App",
      date: "2026-03-11",
    });
    const toolResult = readToolResult(response);

    assert.notEqual(toolResult.isError, true);

    if (
      !isRecord(toolResult.structuredContent)
      || typeof toolResult.structuredContent.registryRelativePath !== "string"
    ) {
      throw new Error("Expected bootstrap_project structured content");
    }

    assert(fs.existsSync(path.join(rootDir, toolResult.structuredContent.registryRelativePath)));
  } finally {
    delete process.env.PROJECT_MEMORY_ROOT;
  }
});

test("MCP upsert_taxonomy_registry and audit_taxonomy stay consistent", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;
  try {
    const bootstrapResponse = callTool("taxonomy-bootstrap", "bootstrap_project", {
      project: "acme-app",
      date: "2026-03-11",
    });
    assert.notEqual(readToolResult(bootstrapResponse).isError, true);

    const upsertResponse = callTool("taxonomy-upsert", "upsert_taxonomy_registry", {
      project: "acme-app",
      date: "2026-03-11",
      entries: [
        {
          scope: "taxonomy-registry",
          topic: "taxonomy-registry",
          authority: "taxonomy-registry",
          state: "active",
          migration: "create-topic",
          aliases: [],
          mappedScopes: [],
        },
        {
          scope: "resume-flow",
          topic: "resume-flow",
          authority: "resume-flow",
          state: "active",
          migration: "create-topic",
          aliases: [],
          mappedScopes: [],
        },
      ],
    });
    assert.notEqual(readToolResult(upsertResponse).isError, true);

    const auditResponse = callTool("taxonomy-audit", "audit_taxonomy", {
      project: "acme-app",
    });
    const auditResult = readToolResult(auditResponse);

    if (
      !isRecord(auditResult.structuredContent)
      || auditResult.structuredContent.passed !== true
      || auditResult.structuredContent.registryEntryCount !== 2
    ) {
      throw new Error("Expected audit_taxonomy structured content");
    }
  } finally {
    delete process.env.PROJECT_MEMORY_ROOT;
  }
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

  const toolDescriptions = new Map(
    listResult.tools
      .filter((tool): tool is Record<string, unknown> => isRecord(tool))
      .flatMap((tool) => {
        if (typeof tool.name !== "string" || typeof tool.description !== "string") {
          return [];
        }

        return [[tool.name, tool.description] as const];
      }),
  );
  const toolsByName = new Map(
    listResult.tools
      .filter((tool): tool is Record<string, unknown> => isRecord(tool))
      .flatMap((tool) => {
        if (typeof tool.name !== "string") {
          return [];
        }

        return [[tool.name, tool] as const];
      }),
  );

  assert(toolNames.includes("list_documents"));
  assert(toolNames.includes("choose_workflow"));
  assert(toolNames.includes("audit_taxonomy"));
  assert(toolNames.includes("read_cold_start"));
  assert(toolNames.includes("read_planning_backlog"));
  assert(toolNames.includes("read_planning_topic_entry"));
  assert(toolNames.includes("read_topic_entry"));
  assert(toolNames.includes("read_rationale_entry"));
  assert(toolNames.includes("bootstrap_project"));
  assert(toolNames.includes("append_session_note"));
  assert(toolNames.includes("commit_pending_changes"));
  assert(toolNames.includes("archive_document"));
  assert(toolNames.includes("archive_work_item"));
  assert(toolNames.includes("close_work_item"));
  assert(toolNames.includes("upsert_taxonomy_registry"));
  assert(toolNames.includes("upsert_work_item"));

  assert.match(toolDescriptions.get("audit_taxonomy") ?? "", /taxonomy consistency/i);
  assert.match(toolDescriptions.get("list_documents") ?? "", /choose read_cold_start/i);
  assert.match(toolDescriptions.get("choose_workflow") ?? "", /fallback read-only chooser/i);
  assert.match(toolDescriptions.get("choose_workflow") ?? "", /does not route, mutate data/i);
  assert.match(toolDescriptions.get("list_documents") ?? "", /read_planning_backlog/i);
  assert.match(toolDescriptions.get("search_documents") ?? "", /do not use this as the default startup path/i);
  assert.match(toolDescriptions.get("read_document") ?? "", /direct maintenance primitive/i);
  assert.match(toolDescriptions.get("read_cold_start") ?? "", /normal execution flow/i);
  assert.match(toolDescriptions.get("read_cold_start") ?? "", /commit memory-repo changes separately from code-repo changes/i);
  assert.match(toolDescriptions.get("read_planning_backlog") ?? "", /after cold-start/i);
  assert.match(toolDescriptions.get("bootstrap_project") ?? "", /reserved active taxonomy registry/i);
  assert.match(toolDescriptions.get("upsert_work_item") ?? "", /executable backlog slice/i);
  assert.match(toolDescriptions.get("upsert_work_item") ?? "", /visibility status, and execution progress/i);
  assert.match(toolDescriptions.get("append_session_note") ?? "", /chronological execution/i);
  assert.match(toolDescriptions.get("create_decision") ?? "", /durable rationale/i);
  assert.match(toolDescriptions.get("record_verification_result") ?? "", /concrete evidence/i);
  assert.match(toolDescriptions.get("upsert_canonical_doc") ?? "", /current stable guidance/i);
  assert.match(toolDescriptions.get("upsert_taxonomy_registry") ?? "", /reserved active taxonomy registry/i);
  assert.match(toolDescriptions.get("create_runbook") ?? "", /repeatable operational procedure/i);
  assert.match(toolDescriptions.get("upsert_provider_note") ?? "", /provider-specific constraints/i);
  assert.match(toolDescriptions.get("read_topic_entry") ?? "", /same-project topic/i);
  assert.match(toolDescriptions.get("read_rationale_entry") ?? "", /same-project topic/i);
  assert.match(toolDescriptions.get("archive_document") ?? "", /archive one existing managed document/i);
  assert.match(toolDescriptions.get("close_work_item") ?? "", /before the memory-repo commit/i);
  assert.match(toolDescriptions.get("commit_pending_changes") ?? "", /separately from code-repo commits/i);

  const upsertWorkItemTool = toolsByName.get("upsert_work_item");
  if (!isRecord(upsertWorkItemTool) || !isRecord(upsertWorkItemTool.inputSchema) || !isRecord(upsertWorkItemTool.inputSchema.properties)) {
    throw new Error("Expected upsert_work_item schema in tools/list");
  }

  const statusProperty = upsertWorkItemTool.inputSchema.properties.status;
  const workItemStateProperty = upsertWorkItemTool.inputSchema.properties.workItemState;
  if (!isRecord(statusProperty) || !isRecord(workItemStateProperty)) {
    throw new Error("Expected work-item status properties in tools/list schema");
  }

  assert.match(String(statusProperty.description ?? ""), /document lifecycle status controlling managed visibility/i);
  assert.match(String(statusProperty.description ?? ""), /separate from execution progress/i);
  assert.match(String(workItemStateProperty.description ?? ""), /execution lifecycle state controlling planning progress/i);
  assert.match(String(workItemStateProperty.description ?? ""), /separate from document visibility/i);
});

test("MCP choose_workflow recommends bounded startup reads and lifecycle next steps", () => {
  const startupResponse = callTool("workflow-1", "choose_workflow", {
    goal: "I need startup context before I decide what to work on in this project.",
  });
  const startupResult = readToolResult(startupResponse);

  if (!isRecord(startupResult.structuredContent) || !Array.isArray(startupResult.structuredContent.recommendedTools)) {
    throw new Error("Expected choose_workflow startup payload");
  }

  assert.equal(startupResult.structuredContent.route, "bounded-read-cold-start");
  assert.equal(startupResult.structuredContent.lifecyclePosition, "bounded-context");
  assert.equal(startupResult.structuredContent.recommendedTools[0]?.name, "read_cold_start");
  assert.match(String(startupResult.structuredContent.nextStep ?? ""), /read_cold_start/);
  assert(Array.isArray(startupResult.structuredContent.lifecycleGuide));
  assert.equal(startupResult.structuredContent.lifecycleGuide.length, 9);

  const nextStepResponse = callTool("workflow-2", "choose_workflow", {
    goal: "I implemented the fix and I already appended the session note. What should I do next?",
    currentStep: "Implemented the fix and appended the session note for the work-item.",
  });
  const nextStepResult = readToolResult(nextStepResponse);

  if (!isRecord(nextStepResult.structuredContent) || !Array.isArray(nextStepResult.structuredContent.recommendedTools)) {
    throw new Error("Expected choose_workflow lifecycle payload");
  }

  assert.equal(nextStepResult.structuredContent.route, "lifecycle-next-step");
  assert.equal(nextStepResult.structuredContent.lifecyclePosition, "post-session-note-pre-verification");
  assert.equal(nextStepResult.structuredContent.recommendedTools[0]?.name, "record_verification_result");
  assert.match(String(nextStepResult.structuredContent.nextStep ?? ""), /record_verification_result/);
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
  if (!isRecord(appendResult.structuredContent) || !isRecord(appendResult.structuredContent.metadata)) {
    throw new Error("Expected structured append_session_note result");
  }

  assert.equal("body" in appendResult.structuredContent, false);
  assert.match(appendResult.content[0]?.text ?? "", /Updated session-note at projects\/acme-app\/session-log\//);
  assert.doesNotMatch(appendResult.content[0]?.text ?? "", /Verified MCP write path|Wrote a document through MCP tools\/call/);

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

test("MCP list_documents ideas preset returns newest draft decisions only", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  callTool("ideas-10", "create_decision", {
    project: "acme-app",
    topic: "older idea",
    date: "2026-03-10",
    context: "Need an older draft idea.",
    decision: "Keep this draft visible.",
    consequences: ["Older idea stays in the inbox"],
    status: "draft",
  });

  callTool("ideas-11", "create_decision", {
    project: "acme-app",
    topic: "newer idea",
    date: "2026-03-12",
    context: "Need a newer draft idea.",
    decision: "Keep newer draft ideas first.",
    consequences: ["Newer item should sort first"],
    status: "draft",
  });

  callTool("ideas-12", "create_decision", {
    project: "acme-app",
    topic: "accepted idea",
    date: "2026-03-13",
    context: "Need a non-draft decision.",
    decision: "Accepted decisions should stay out of the ideas inbox.",
    consequences: ["Should be filtered"],
    status: "active",
  });

  const response = callTool("ideas-13", "list_documents", {
    project: "acme-app",
    preset: "ideas",
  });
  const toolResult = readToolResult(response);
  if (
    !isRecord(toolResult.structuredContent) ||
    !Array.isArray(toolResult.structuredContent.documents) ||
    !isRecord(toolResult.structuredContent.appliedQuery)
  ) {
    throw new Error("Expected structured ideas list result");
  }

  const documents = toolResult.structuredContent.documents;
  assert.deepEqual(
    documents.map((document) => {
      if (!isRecord(document) || !isRecord(document.metadata) || typeof document.metadata.topic !== "string") {
        throw new Error("Expected listed idea metadata");
      }

      return document.metadata.topic;
    }),
    ["newer-idea", "older-idea"],
  );
  assert.equal(toolResult.structuredContent.appliedQuery.status, "draft");
  assert.equal(toolResult.structuredContent.appliedQuery.type, "decision");

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP upsert_work_item feeds the project backlog planning view", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const createResponse = callTool("work-1", "upsert_work_item", {
    project: "acme-app",
    topic: "resume slice",
    summary: "Implement the first resumable work slice.",
    outcome: "Backlog planning can read a real work-item document.",
    originKind: "ad-hoc",
    originNote: "MCP coverage.",
    verification: ["Run MCP integration coverage."],
    date: "2026-03-11",
  });
  const createResult = readToolResult(createResponse);
  assert.equal(createResult.isError, false);

  const backlogResponse = callTool("work-2", "list_documents", {
    project: "acme-app",
    preset: "backlog",
  });
  const backlogResult = readToolResult(backlogResponse);
  if (
    !isRecord(backlogResult.structuredContent)
    || !Array.isArray(backlogResult.structuredContent.documents)
    || !isRecord(backlogResult.structuredContent.appliedQuery)
  ) {
    throw new Error("Expected structured work-item backlog result");
  }

  const [document] = backlogResult.structuredContent.documents;
  if (!isRecord(document) || !isRecord(document.metadata)) {
    throw new Error("Expected one listed work-item payload");
  }

  assert.equal(document.metadata.topic, "resume-slice");
  assert.equal(document.metadata.work_item_state, "open");
  assert.equal(document.planningState, "ready");
  assert.equal(document.unresolvedDependencyCount, 0);
  assert.equal(backlogResult.structuredContent.appliedQuery.type, "work-item");

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP close_work_item closes a work item and removes it from the active backlog", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const createResponse = callTool("work-close-1", "upsert_work_item", {
    project: "acme-app",
    topic: "closeable slice",
    summary: "Implement the closeable work slice.",
    outcome: "A dedicated lifecycle helper can finish the item.",
    originKind: "ad-hoc",
    originNote: "MCP close coverage.",
    verification: ["Run MCP close coverage."],
    date: "2026-03-11",
    workItemState: "in_progress",
  });
  assert.equal(readToolResult(createResponse).isError, false);

  const closeResponse = callTool("work-close-2", "close_work_item", {
    project: "acme-app",
    topic: "closeable slice",
    date: "2026-03-11",
    state: "done",
  });
  const closeResult = readToolResult(closeResponse);
  if (!isRecord(closeResult.structuredContent) || !isRecord(closeResult.structuredContent.metadata)) {
    throw new Error("Expected structured close_work_item result");
  }

  assert.equal("body" in closeResult.structuredContent, false);
  assert.equal(closeResult.structuredContent.metadata.work_item_state, "done");
  assert.match(closeResult.content[0]?.text ?? "", /Updated work-item at .*closeable-slice\.md to done\./);

  const backlogResponse = callTool("work-close-3", "list_documents", {
    project: "acme-app",
    preset: "backlog",
  });
  const backlogResult = readToolResult(backlogResponse);
  if (
    !isRecord(backlogResult.structuredContent)
    || !Array.isArray(backlogResult.structuredContent.documents)
  ) {
    throw new Error("Expected structured backlog result after close_work_item");
  }

  assert.equal(backlogResult.structuredContent.documents.length, 0);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP archive_work_item archives a terminal work item and removes it from the active backlog", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const createResponse = callTool("work-archive-1", "upsert_work_item", {
    project: "acme-app",
    topic: "archivable slice",
    summary: "Implement the archivable work slice.",
    outcome: "A dedicated lifecycle helper can archive the finished item.",
    originKind: "ad-hoc",
    originNote: "MCP archive coverage.",
    verification: ["Run MCP archive coverage."],
    date: "2026-03-11",
    workItemState: "done",
  });
  assert.equal(readToolResult(createResponse).isError, false);

  const archiveResponse = callTool("work-archive-2", "archive_work_item", {
    project: "acme-app",
    topic: "archivable slice",
    date: "2026-03-11",
  });
  const archiveResult = readToolResult(archiveResponse);
  if (!isRecord(archiveResult.structuredContent) || !isRecord(archiveResult.structuredContent.metadata)) {
    throw new Error("Expected structured archive_work_item result");
  }

  assert.equal("body" in archiveResult.structuredContent, false);
  assert.equal(archiveResult.structuredContent.metadata.status, "archived");
  assert.equal(archiveResult.structuredContent.metadata.work_item_state, "done");
  assert.match(archiveResult.content[0]?.text ?? "", /Archived work-item at .*archivable-slice\.md\./);

  const backlogResponse = callTool("work-archive-3", "list_documents", {
    project: "acme-app",
    preset: "backlog",
  });
  const backlogResult = readToolResult(backlogResponse);
  if (
    !isRecord(backlogResult.structuredContent)
    || !Array.isArray(backlogResult.structuredContent.documents)
  ) {
    throw new Error("Expected structured backlog result after archive_work_item");
  }

  assert.equal(backlogResult.structuredContent.documents.length, 0);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP archive_document archives canonical docs in place", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;
  setupTestProjectTaxonomy(createTestRepositoryContext(rootDir), "acme-app", ["resume-flow"]);

  const createResponse = callTool("doc-archive-1", "upsert_canonical_doc", {
    project: "acme-app",
    topic: "resume policy",
    registryScope: "resume-flow",
    summary: "Keep resume behavior explicit.",
    guidance: ["Use bounded reads."],
    references: ["decision: resume-architecture"],
    date: "2026-03-11",
  });
  const createResult = readToolResult(createResponse);
  if (!isRecord(createResult.structuredContent) || typeof createResult.structuredContent.relativePath !== "string") {
    throw new Error("Expected structured canonical doc result");
  }

  assert.equal("body" in createResult.structuredContent, false);
  const archiveResponse = callTool("doc-archive-2", "archive_document", {
    path: createResult.structuredContent.relativePath,
  });
  const archiveResult = readToolResult(archiveResponse);
  if (!isRecord(archiveResult.structuredContent) || !isRecord(archiveResult.structuredContent.metadata)) {
    throw new Error("Expected structured archive_document result");
  }

  assert.equal("body" in archiveResult.structuredContent, false);
  assert.equal(archiveResult.structuredContent.relativePath, createResult.structuredContent.relativePath);
  assert.equal(archiveResult.structuredContent.metadata.status, "archived");
  assert.match(archiveResult.content[0]?.text ?? "", /Archived canonical-doc at .*resume-policy\.md\./);

  const backlogResponse = callTool("doc-archive-3", "list_documents", {
    project: "acme-app",
    preset: "backlog",
  });
  const backlogResult = readToolResult(backlogResponse);
  if (
    !isRecord(backlogResult.structuredContent)
    || !Array.isArray(backlogResult.structuredContent.documents)
  ) {
    throw new Error("Expected structured backlog result after archive_document");
  }

  assert.equal(backlogResult.structuredContent.documents.length, 0);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP archive_document rejects work-item paths", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const createResponse = callTool("doc-archive-work-item-1", "upsert_work_item", {
    project: "acme-app",
    topic: "archive via wrong mcp",
    summary: "Verify MCP archive helper boundaries.",
    outcome: "Generic archive flow rejects work-item paths.",
    originKind: "ad-hoc",
    originNote: "MCP negative archive coverage.",
    verification: ["Expect archive_document to reject work-item paths."],
    date: "2026-03-11",
    workItemState: "done",
  });
  assert.equal(readToolResult(createResponse).isError, false);

  const archiveResponse = callTool("doc-archive-work-item-2", "archive_document", {
    path: "projects/acme-app/work-items/2026/2026-03-11-archive-via-wrong-mcp.md",
  });
  const archiveResult = readToolResult(archiveResponse);
  assert.equal(archiveResult.isError, true);
  assert.match(archiveResult.content[0]?.text ?? "", /Use archiveWorkItem to archive work-item documents/);

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
  assert.match(toolResult.content[0]?.text ?? "", /docs\(<project>\/<scope>\): <summary>/);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP server rejects pending managed changes from multiple projects", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  callTool("multi-project-1", "append_session_note", {
    project: "acme-app",
    topic: "cross project one",
    date: "2026-03-11",
    summary: "Prepared the first project change.",
    actions: ["Created acme note"],
    followUp: ["Commit separately"],
  });

  callTool("multi-project-2", "create_decision", {
    project: "beta-app",
    topic: "cross project two",
    date: "2026-03-11",
    context: "Prepared a second project change in the same worktree.",
    decision: "Reject multi-project commits by default.",
    consequences: ["Commit per project"],
  });

  const response = callTool("multi-project-3", "commit_pending_changes", {
    message: "docs(acme-app/mixed): invalid cross-project batch",
  });
  const toolResult = readToolResult(response);

  assert.equal(toolResult.isError, true);
  assert.match(toolResult.content[0]?.text ?? "", /multiple projects|one project at a time|special-case path/);

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
  setupTestProjectTaxonomy(createTestRepositoryContext(rootDir), "acme-app", ["resume-flow"]);

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

  assert.equal(listResult.structuredContent.documents.length, 2);
  const resumePolicyDocument = listResult.structuredContent.documents.find((document) => {
    return isRecord(document) && isRecord(document.metadata) && document.metadata.registry_scope === "resume-flow";
  });
  if (!isRecord(resumePolicyDocument) || !isRecord(resumePolicyDocument.metadata)) {
    throw new Error("Expected resume-flow canonical-doc list payload");
  }

  assert.equal(resumePolicyDocument.metadata.registry_scope, "resume-flow");

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

test("MCP server exposes bounded read entrypoints", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;
  setupTestProjectTaxonomy(createTestRepositoryContext(rootDir), "acme-app", ["resume-flow"]);

  callTool("bounded-runbook", "create_runbook", {
    project: "acme-app",
    topic: "architecture overview",
    date: "2026-03-11",
    purpose: "Describe the current architecture.",
    procedure: ["Read the overview"],
    verification: ["Confirm the overview is current"],
  });
  callTool("bounded-canonical", "upsert_canonical_doc", {
    project: "acme-app",
    topic: "resume policy",
    registryScope: "resume-flow",
    date: "2026-03-11",
    summary: "Canonical resume guidance.",
    guidance: ["Prefer resumable jobs"],
    references: ["decision: resume-architecture", "runbook: architecture-overview"],
  });
  callTool("bounded-decision", "create_decision", {
    project: "acme-app",
    topic: "resume-architecture",
    date: "2026-03-12",
    context: "Need rationale coverage.",
    decision: "Keep resume architecture explicit.",
    consequences: ["Bounded reads can follow the rationale source"],
  });
  callTool("bounded-evidence-session", "append_session_note", {
    project: "acme-app",
    topic: "resume evidence",
    date: "2026-03-13",
    summary: "Captured planning evidence in a session note.",
    actions: ["Saved explicit evidence note"],
    followUp: ["Read it through planning topic entry"],
  });
  callTool("bounded-evidence-verification", "record_verification_result", {
    project: "acme-app",
    topic: "resume check",
    date: "2026-03-13",
    scope: "Planning topic entry",
    steps: ["Run explicit evidence coverage"],
    result: "Pass",
  });
  callTool("bounded-prerequisite-work-item", "upsert_work_item", {
    project: "acme-app",
    topic: "resume prerequisite",
    date: "2026-03-12",
    summary: "Complete the prerequisite slice.",
    outcome: "Main planning work can depend on a bounded prerequisite.",
    originKind: "ad-hoc",
    originNote: "MCP bounded planning dependency coverage.",
    verification: ["Confirm the prerequisite stays readable."],
    workItemState: "done",
  });
  callTool("bounded-work-item", "upsert_work_item", {
    project: "acme-app",
    topic: "resume slice",
    date: "2026-03-13",
    summary: "Implement the planning slice.",
    outcome: "Dedicated planning reads can return work-item-only context.",
    originKind: "ad-hoc",
    originNote: "MCP bounded planning coverage.",
    dependencies: ["work-item:acme-app:2026-03-12:resume-prerequisite"],
    context: [
      "canonical-doc:acme-app:resume-flow:resume-policy",
      "decision:acme-app:2026-03-12:resume-architecture",
    ],
    evidence: [
      "verification-result:acme-app:2026-03-13:resume-check",
      "session-note:acme-app:2026-03-13:resume-evidence",
    ],
    verification: ["Run planning backlog coverage."],
  });

  const coldStartResponse = callTool("bounded-cold", "read_cold_start", {
    project: "acme-app",
  });
  const coldStartResult = readToolResult(coldStartResponse);
  if (!isRecord(coldStartResult.structuredContent) || !Array.isArray(coldStartResult.structuredContent.documents)) {
    throw new Error("Expected read_cold_start payload");
  }

  assert.equal(coldStartResult.structuredContent.entrypoint, "cold-start");
  assert.equal(coldStartResult.structuredContent.documents.length, 3);

  const planningResponse = callTool("bounded-planning", "read_planning_backlog", {
    project: "acme-app",
  });
  const planningResult = readToolResult(planningResponse);
  if (!isRecord(planningResult.structuredContent) || !Array.isArray(planningResult.structuredContent.documents)) {
    throw new Error("Expected read_planning_backlog payload");
  }

  assert.equal(planningResult.structuredContent.entrypoint, "planning-backlog");
  assert.deepEqual(
    planningResult.structuredContent.documents.map((document) => {
      if (!isRecord(document) || !isRecord(document.metadata) || typeof document.metadata.topic !== "string") {
        throw new Error("Expected read_planning_backlog document metadata");
      }

      return document.metadata.topic;
    }),
    ["resume-slice"],
  );
  if (
    !Array.isArray(planningResult.structuredContent.planningExplainability)
    || planningResult.structuredContent.planningExplainability.length !== 1
  ) {
    throw new Error("Expected read_planning_backlog planning explainability");
  }

  const planningTopicResponse = callTool("bounded-planning-topic", "read_planning_topic_entry", {
    project: "acme-app",
    topic: "resume slice",
  });
  const planningTopicResult = readToolResult(planningTopicResponse);
  if (
    !isRecord(planningTopicResult.structuredContent)
    || !Array.isArray(planningTopicResult.structuredContent.documents)
  ) {
    throw new Error("Expected read_planning_topic_entry payload");
  }

  assert.equal(planningTopicResult.structuredContent.entrypoint, "planning-topic-entry");
  assert.equal(planningTopicResult.structuredContent.topic, "resume-slice");
  assert.deepEqual(
    planningTopicResult.structuredContent.documents.map((document) => {
      if (!isRecord(document) || !isRecord(document.metadata) || typeof document.metadata.topic !== "string") {
        throw new Error("Expected read_planning_topic_entry document metadata");
      }

      return document.metadata.topic;
    }),
    [
      "resume-slice",
      "resume-prerequisite",
      "resume-policy",
      "resume-architecture",
      "resume-check",
      "resume-evidence",
    ],
  );
  if (
    !Array.isArray(planningTopicResult.structuredContent.planningExplainability)
    || planningTopicResult.structuredContent.planningExplainability.length !== 1
  ) {
    throw new Error("Expected read_planning_topic_entry planning explainability");
  }

  const topicResponse = callTool("bounded-topic", "read_topic_entry", {
    project: "acme-app",
    topic: "resume policy",
  });
  const topicResult = readToolResult(topicResponse);
  if (!isRecord(topicResult.structuredContent) || !Array.isArray(topicResult.structuredContent.documents)) {
    throw new Error("Expected read_topic_entry payload");
  }

  assert.equal(topicResult.structuredContent.entrypoint, "topic-entry");
  assert.equal(topicResult.structuredContent.topic, "resume-policy");

  const rationaleResponse = callTool("bounded-rationale", "read_rationale_entry", {
    project: "acme-app",
    topic: "resume policy",
  });
  const rationaleResult = readToolResult(rationaleResponse);
  if (!isRecord(rationaleResult.structuredContent) || !Array.isArray(rationaleResult.structuredContent.documents)) {
    throw new Error("Expected read_rationale_entry payload");
  }

  assert.equal(rationaleResult.structuredContent.entrypoint, "rationale-entry");
  assert.equal(rationaleResult.structuredContent.documents.length, 3);

  delete process.env.PROJECT_MEMORY_ROOT;
});
