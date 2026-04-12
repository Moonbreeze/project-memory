import assert from "node:assert/strict";
import test from "node:test";

import { callTool, readToolResult } from "../fixtures/mcpTestSupport.ts";
import { setupTestRepo } from "../fixtures/setupTestRepo.ts";
import { findFreePort, isRecord } from "../fixtures/testSupport.ts";

test("MCP web_start/web_status/web_stop manage the shared Web runtime", async () => {
  const rootDir = setupTestRepo();
  const port = await findFreePort();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  try {
    const startResponse = callTool("web-start", "web_start", {
      host: "127.0.0.1",
      port,
      publicBaseUrl: "https://example.com/project-memory",
    });
    const startResult = readToolResult(startResponse);
    if (
      !isRecord(startResult.structuredContent)
      || startResult.structuredContent.state !== "running"
      || startResult.structuredContent.outcome !== "started"
      || !isRecord(startResult.structuredContent.timelineLinks)
    ) {
      throw new Error("Expected web_start structured content");
    }

    assert.equal(
      startResult.structuredContent.timelineLinks.public,
      "https://example.com/project-memory/timeline",
    );

    const statusResponse = callTool("web-status", "web_status", {
      host: "127.0.0.1",
      port,
    });
    const statusResult = readToolResult(statusResponse);
    if (
      !isRecord(statusResult.structuredContent)
      || statusResult.structuredContent.state !== "running"
    ) {
      throw new Error("Expected web_status structured content");
    }

    const stopResponse = callTool("web-stop", "web_stop", {
      host: "127.0.0.1",
      port,
    });
    const stopResult = readToolResult(stopResponse);
    if (
      !isRecord(stopResult.structuredContent)
      || stopResult.structuredContent.outcome !== "stopped"
    ) {
      throw new Error("Expected web_stop structured content");
    }
  } finally {
    callTool("web-stop-cleanup", "web_stop", {
      host: "127.0.0.1",
      port,
    });
    delete process.env.PROJECT_MEMORY_ROOT;
  }
});
