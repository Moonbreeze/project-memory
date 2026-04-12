import assert from "node:assert/strict";
import test from "node:test";

import { createMcpResponse } from "../../src/mcp/dispatch.ts";
import { setupTestRepo } from "../fixtures/setupTestRepo.ts";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const readResult = (response: unknown): unknown => {
  if (!isRecord(response)) {
    throw new Error("Expected a JSON-RPC response object");
  }

  if ("error" in response && response.error !== undefined) {
    throw new Error(`Expected success response, received error: ${JSON.stringify(response.error)}`);
  }

  return response.result;
};

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

test("MCP tools/list includes upsert_runbook", () => {
  const response = createMcpResponse({
    jsonrpc: "2.0",
    id: "list-tools",
    method: "tools/list",
  });
  const result = readResult(response);

  if (!isRecord(result) || !Array.isArray(result.tools)) {
    throw new Error("Expected a tools/list result");
  }

  const toolNames = result.tools
    .filter((tool): tool is Record<string, unknown> => isRecord(tool))
    .map((tool) => tool.name)
    .filter((name): name is string => typeof name === "string");

  assert(toolNames.includes("upsert_runbook"));
});

test("MCP upsert_runbook writes a runbook document", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const response = callTool("upsert-runbook", "upsert_runbook", {
    project: "acme-app",
    topic: "architecture overview",
    date: "2026-03-11",
    purpose: "Describe the current architecture.",
    procedure: ["Read the overview"],
    verification: ["Confirm the overview is current"],
  });
  const toolResult = readToolResult(response);

  assert.notEqual(toolResult.isError, true);

  if (
    !isRecord(toolResult.structuredContent)
    || !isRecord(toolResult.structuredContent.metadata)
  ) {
    throw new Error("Expected upsert_runbook structured content");
  }

  assert.equal(toolResult.structuredContent.metadata.topic, "architecture-overview");

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("MCP create_runbook remains a backward-compatible alias", () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const response = callTool("legacy-runbook", "create_runbook", {
    project: "acme-app",
    topic: "legacy runbook alias",
    date: "2026-03-11",
    purpose: "Exercise the legacy MCP alias.",
    procedure: ["Call the old tool name"],
    verification: ["Confirm the alias still writes a runbook"],
  });
  const toolResult = readToolResult(response);

  assert.notEqual(toolResult.isError, true);

  if (
    !isRecord(toolResult.structuredContent)
    || !isRecord(toolResult.structuredContent.metadata)
  ) {
    throw new Error("Expected create_runbook alias structured content");
  }

  assert.equal(toolResult.structuredContent.metadata.topic, "legacy-runbook-alias");

  delete process.env.PROJECT_MEMORY_ROOT;
});
