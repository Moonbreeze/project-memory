import assert from "node:assert/strict";
import test from "node:test";

import { appendSessionNote, createDecision } from "../../src/core/index.ts";
import { handleWebRequest, resolveWebRuntimeConfig } from "../../src/web/server.ts";
import {
  createTestRepositoryContext,
  setupTestProjectTaxonomy,
  setupTestRepo,
} from "../fixtures/setupTestRepo.ts";

test("Web timeline route lists managed documents using shared core reads", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);

  const sessionNote = appendSessionNote(
    {
      project: "acme-app",
      topic: "web baseline",
      date: "2026-03-22",
      summary: "Seed Web timeline coverage.",
      actions: ["Capture one timeline row for the Web shell."],
      followUp: ["Keep exact document routing reachable from the timeline."],
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "timeline ordering",
      date: "2026-03-21",
      context: "Need a second document for the latest-first listing.",
      decision: "Keep the newest document first in the Web shell.",
      consequences: ["Timeline output can reuse shared core ordering."],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );

  const response = await handleWebRequest(
    {
      method: "GET",
      url: "/timeline",
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Latest Documents/);
  assert.match(response.body, /web-baseline/);
  assert.match(response.body, /timeline-ordering/);
  assert.match(response.body, new RegExp(encodeURIComponent(sessionNote.relativePath)));
});

test("Web document route reads one managed document by relative path", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);

  const sessionNote = appendSessionNote(
    {
      project: "acme-app",
      topic: "open exact document",
      date: "2026-03-22",
      summary: "Seed exact document routing coverage.",
      actions: ["Create a managed document for route lookup."],
      followUp: ["Retain raw markdown rendering until the markdown slice lands."],
    },
    context,
  );

  const response = await handleWebRequest(
    {
      method: "GET",
      url: `/documents/${encodeURIComponent(sessionNote.relativePath)}`,
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /open-exact-document/);
  assert.match(response.body, /Seed exact document routing coverage\./);
  assert.match(response.body, new RegExp(sessionNote.relativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Web document route returns not found for unmanaged paths", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);

  const response = await handleWebRequest(
    {
      method: "GET",
      url: `/documents/${encodeURIComponent("scratch/unmanaged.md")}`,
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 404);
  assert.match(response.body, /outside managed routes/i);
});

test("resolveWebRuntimeConfig prefers project-memory-specific host and port overrides", () => {
  const memoryRootDir = setupTestRepo();
  const originalProjectMemoryRoot = process.env.PROJECT_MEMORY_ROOT;
  const originalProjectMemoryWebHost = process.env.PROJECT_MEMORY_WEB_HOST;
  const originalProjectMemoryWebPort = process.env.PROJECT_MEMORY_WEB_PORT;
  const originalHost = process.env.HOST;
  const originalPort = process.env.PORT;

  process.env.PROJECT_MEMORY_ROOT = memoryRootDir;
  process.env.PROJECT_MEMORY_WEB_HOST = "0.0.0.0";
  process.env.PROJECT_MEMORY_WEB_PORT = "4510";
  process.env.HOST = "127.9.9.9";
  process.env.PORT = "9999";

  try {
    const config = resolveWebRuntimeConfig();

    assert.equal(config.host, "0.0.0.0");
    assert.equal(config.port, 4510);
    assert.equal(config.context.memoryRootDir, memoryRootDir);
  } finally {
    process.env.PROJECT_MEMORY_ROOT = originalProjectMemoryRoot;
    process.env.PROJECT_MEMORY_WEB_HOST = originalProjectMemoryWebHost;
    process.env.PROJECT_MEMORY_WEB_PORT = originalProjectMemoryWebPort;
    process.env.HOST = originalHost;
    process.env.PORT = originalPort;
  }
});
