import assert from "node:assert/strict";
import test from "node:test";

import { appendSessionNote, createDecision } from "../../src/core/index.ts";
import { handleWebRequest, resolveWebRuntimeConfig } from "../../src/web/server.ts";
import {
  createTestRepositoryContext,
  setupTestProjectTaxonomy,
  setupTestRepo,
  writeRawInvalidDoneWorkItem,
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
  assert.match(response.body, /Type/);
  assert.match(response.body, /Project/);
  assert.match(response.body, /Status/);
  assert.match(response.body, /Path/);
  assert.match(response.body, /Open document/);
  assert.match(response.body, new RegExp(encodeURIComponent(sessionNote.relativePath)));
});

test("Web timeline route keeps same-day results in shared-core latest-first order", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);

  appendSessionNote(
    {
      project: "acme-app",
      topic: "earlier note",
      date: "2026-03-22",
      recordedAt: "2026-03-22T09:00:00.000Z",
      summary: "Seed the older same-day row.",
      actions: ["Create one same-day timeline row."],
      followUp: ["Keep later rows ahead of this one."],
    },
    context,
  );
  appendSessionNote(
    {
      project: "acme-app",
      topic: "later note",
      date: "2026-03-22",
      recordedAt: "2026-03-22T18:00:00.000Z",
      summary: "Seed the newer same-day row.",
      actions: ["Create one later same-day timeline row."],
      followUp: ["Keep shared-core chronology visible in the Web UI."],
    },
    context,
  );

  const response = await handleWebRequest(
    {
      method: "GET",
      url: "/timeline?project=acme-app&type=session-note",
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Ordered by shared-core latest-first chronology/);
  assert.match(response.body, /Recorded At/);

  const laterIndex = response.body.indexOf("later-note");
  const earlierIndex = response.body.indexOf("earlier-note");

  assert.notEqual(laterIndex, -1);
  assert.notEqual(earlierIndex, -1);
  assert.ok(laterIndex < earlierIndex);
});

test("Web timeline route applies normalized query filters through the read adapter", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);
  setupTestProjectTaxonomy(context, "beta-app", ["docs"]);

  appendSessionNote(
    {
      project: "acme-app",
      topic: "kept row",
      date: "2026-03-22",
      summary: "Seed the row that should survive filtering.",
      actions: ["Create one matching session note."],
      followUp: ["Keep filter parsing in the adapter."],
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "filtered type",
      date: "2026-03-22",
      context: "Seed a non-matching type.",
      decision: "Only session notes should remain under this query.",
      consequences: ["Type filtering stays visible in the shell."],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );
  appendSessionNote(
    {
      project: "beta-app",
      topic: "filtered project",
      date: "2026-03-22",
      summary: "Seed a non-matching project row.",
      actions: ["Create one row outside the selected project."],
      followUp: ["Keep project filters deterministic."],
    },
    context,
  );

  const response = await handleWebRequest(
    {
      method: "GET",
      url: "/timeline?project=acme-app&type=session-note",
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /kept-row/);
  assert.doesNotMatch(response.body, /filtered-type/);
  assert.doesNotMatch(response.body, /filtered-project/);
  assert.match(
    response.body,
    /from=%2Ftimeline%3Fproject%3Dacme-app%26type%3Dsession-note/,
  );
});

test("Web document route renders provenance metadata and preserves timeline context", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);

  const sessionNote = appendSessionNote(
    {
      project: "acme-app",
      topic: "open exact document",
      date: "2026-03-22",
      recordedAt: "2026-03-22T14:30:00.000Z",
      summary: "Seed exact document routing coverage.",
      actions: ["Create a managed document for route lookup."],
      followUp: ["Retain raw markdown rendering until the markdown slice lands."],
    },
    context,
  );

  const response = await handleWebRequest(
    {
      method: "GET",
      url: `/documents/${encodeURIComponent(sessionNote.relativePath)}?from=${encodeURIComponent("/timeline?project=acme-app&type=session-note")}`,
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /open-exact-document/);
  assert.match(response.body, /Document Metadata/);
  assert.match(response.body, /Topic/);
  assert.match(response.body, /Project/);
  assert.match(response.body, /Status/);
  assert.match(response.body, /Date/);
  assert.match(response.body, /Recorded At/);
  assert.match(response.body, /2026-03-22T14:30:00.000Z/);
  assert.match(response.body, /Markdown Source/);
  assert.match(response.body, /Seed exact document routing coverage\./);
  assert.match(response.body, /Back to timeline/);
  assert.match(response.body, /href="\/timeline\?project=acme-app&amp;type=session-note"/);
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
  assert.match(response.body, /Back to timeline/);
});

test("Web document route returns not found for a missing managed document", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);

  const sessionNote = appendSessionNote(
    {
      project: "acme-app",
      topic: "existing document",
      date: "2026-03-22",
      summary: "Seed a valid managed path.",
      actions: ["Create one managed document."],
      followUp: ["Use the path shape for a missing-document check."],
    },
    context,
  );
  const missingRelativePath = sessionNote.relativePath.replace("existing-document", "missing-document");

  const response = await handleWebRequest(
    {
      method: "GET",
      url: `/documents/${encodeURIComponent(missingRelativePath)}`,
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 404);
  assert.match(response.body, /Managed document was not found\./);
});

test("Web document route returns deterministic fallback for invalid managed documents", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  const relativePath = writeRawInvalidDoneWorkItem(
    memoryRootDir,
    "acme-app",
    "broken-work-item",
    "2026-03-22",
  );

  const response = await handleWebRequest(
    {
      method: "GET",
      url: `/documents/${encodeURIComponent(relativePath)}`,
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 500);
  assert.match(response.body, /Read Failed/);
  assert.match(response.body, /Back to timeline/);
});

test("Web timeline route returns invalid query for unsupported filters", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);

  const response = await handleWebRequest(
    {
      method: "GET",
      url: "/timeline?type=unknown-kind",
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /Invalid Query/);
  assert.match(response.body, /Unsupported document type: unknown-kind/);
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
