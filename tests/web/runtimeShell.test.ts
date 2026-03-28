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
      summary: "Seed [Web](https://example.com/web) timeline `coverage`.",
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
  assert.match(response.body, /<h1 class="view-mode">Timeline<\/h1>/);
  assert.match(response.body, /web-baseline/);
  assert.match(response.body, /timeline-ordering/);
  assert.match(response.body, /id="timeline-project-filter" name="project"/);
  assert.match(response.body, /Project Memory/);
  assert.match(response.body, /Read-only latest-first browsing over managed project-memory documents\./);
  assert.match(response.body, /id="timeline-filter-toggle"/);
  assert.match(response.body, /project: acme-app/);
  assert.match(response.body, /Seed Web timeline coverage\./);
  assert.match(response.body, /Capture one timeline row for the Web shell\./);
  assert.match(response.body, /Type/);
  assert.match(response.body, /Project/);
  assert.match(response.body, /Status/);
  assert.doesNotMatch(response.body, /Recorded At/);
  assert.match(response.body, /Path/);
  assert.match(response.body, new RegExp(encodeURIComponent(sessionNote.relativePath)));
  assert.doesNotMatch(response.body, /\[Web\]\(https:\/\/example\.com\/web\)/);
  assert.doesNotMatch(response.body, /`coverage`/);
});

test("Web timeline route defaults to the most recent project while keeping an explicit all-projects option", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);
  setupTestProjectTaxonomy(context, "beta-app", ["docs"]);

  appendSessionNote(
    {
      project: "acme-app",
      topic: "older project row",
      date: "2026-03-21",
      summary: "Seed an older project row.",
      actions: ["Keep one older project row available."],
      followUp: ["Allow manual switching to all projects later."],
    },
    context,
  );
  appendSessionNote(
    {
      project: "beta-app",
      topic: "newer project row",
      date: "2026-03-22",
      summary: "Seed the newest project row.",
      actions: ["Make one project the default timeline scope."],
      followUp: ["Keep all projects available as an explicit option."],
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
  assert.match(response.body, /<option value="\*">All projects<\/option>/);
  assert.match(response.body, /<option value="beta-app" selected="selected">beta-app<\/option>/);
  assert.match(response.body, /newer-project-row/);
  assert.doesNotMatch(response.body, /older-project-row/);
  assert.match(response.body, /from=%2Ftimeline%3Fproject%3Dbeta-app/);
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
  assert.match(response.body, /Read-only latest-first browsing over managed project-memory documents\./);
  assert.match(response.body, /Recorded At/);
  assert.match(response.body, /2026-03-22 18:00 UTC/);
  assert.match(response.body, /2026-03-22 09:00 UTC/);
  assert.doesNotMatch(response.body, /2026-03-22T18:00:00.000Z/);

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
  assert.match(response.body, /<form class="filter-form" method="GET" action="\/timeline" onchange="this\.requestSubmit\(\)">/);
  assert.match(response.body, /id="timeline-project-filter" name="project"/);
  assert.match(response.body, /<option value="\*">All projects<\/option>/);
  assert.match(response.body, /<option value="acme-app" selected="selected">acme-app<\/option>/);
  assert.match(response.body, /<option value="beta-app">beta-app<\/option>/);
  assert.match(response.body, /<option value="session-note" selected="selected">session-note<\/option>/);
  assert.match(response.body, /project: acme-app · type: session-note/);
  assert.match(response.body, /Project/);
  assert.match(response.body, /Type/);
  assert.doesNotMatch(response.body, /Apply filters/);
  assert.match(response.body, /aria-label="Clear filters"/);
});

test("Web timeline route renders a deterministic empty state for unmatched filters", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);

  appendSessionNote(
    {
      project: "acme-app",
      topic: "existing row",
      date: "2026-03-22",
      summary: "Seed one row outside the tested filter combination.",
      actions: ["Create one timeline row."],
      followUp: ["Confirm unmatched filters render a deterministic state."],
    },
    context,
  );

  const response = await handleWebRequest(
    {
      method: "GET",
      url: "/timeline?project=acme-app&type=decision",
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /No Matching Documents/);
  assert.match(response.body, /Project Memory/);
  assert.match(response.body, /<option value="acme-app" selected="selected">acme-app<\/option>/);
  assert.match(response.body, /<option value="decision" selected="selected">decision<\/option>/);
  assert.match(response.body, /project: acme-app/);
  assert.match(response.body, /type: decision/);
  assert.match(response.body, /aria-label="Clear filters"/);
});

test("Web timeline filter controls preserve explicit non-filter query parameters when clearing filters", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);

  appendSessionNote(
    {
      project: "acme-app",
      topic: "limited row",
      date: "2026-03-22",
      summary: "Seed one row for query-preserving filter controls.",
      actions: ["Render one matching row."],
      followUp: ["Keep explicit limit values in the clear-filter URL."],
    },
    context,
  );

  const response = await handleWebRequest(
    {
      method: "GET",
      url: "/timeline?project=acme-app&status=active&limit=10",
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<input type="hidden" name="limit" value="10">/);
  assert.match(response.body, /href="\/timeline\?limit=10"/);
  assert.match(response.body, /<option value="active" selected="selected">active<\/option>/);
});

test("Web timeline route renders a deterministic empty repository state without filters", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);

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
  assert.match(response.body, /No Documents Yet/);
  assert.match(response.body, /No managed documents are available in this repository yet\./);
  assert.doesNotMatch(response.body, /aria-label="Clear filters"/);
});

test("Web timeline route reports invalid managed documents skipped during list reads", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);

  appendSessionNote(
    {
      project: "acme-app",
      topic: "valid row",
      date: "2026-03-22",
      summary: "Seed one valid timeline row.",
      actions: ["Keep one valid document visible."],
      followUp: ["Report invalid managed documents separately."],
    },
    context,
  );
  writeRawInvalidDoneWorkItem(memoryRootDir, "acme-app", "broken-work-item", "2026-03-22");

  const response = await handleWebRequest(
    {
      method: "GET",
      url: "/timeline?project=acme-app",
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Invalid Managed Documents/);
  assert.match(response.body, /broken-work-item/);
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
      summary: [
        "Seed exact document routing coverage with [docs](https://example.com/reference).",
        "",
        "`inline-code` should survive rendering.",
        "",
        "```ts",
        "const value = 1;",
        "```",
        "",
        "<script>alert('xss')</script>",
        "",
        "[unsafe](javascript:alert(1))",
      ].join("\n"),
      actions: ["Create a managed document for route lookup."],
      followUp: ["Ship the safe Markdown renderer in the exact document view."],
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
  assert.match(response.body, /2026-03-22 14:30 UTC/);
  assert.doesNotMatch(response.body, /2026-03-22T14:30:00.000Z/);
  assert.match(response.body, /Rendered Markdown/);
  assert.doesNotMatch(response.body, /Markdown Source/);
  assert.match(response.body, /Baseline safe Markdown rendering supports headings, paragraphs, lists, links, inline code, and fenced code blocks\./);
  assert.match(response.body, /<h1>Session Note<\/h1>/);
  assert.match(response.body, /<h2>Summary<\/h2>/);
  assert.match(response.body, /<a href="https:\/\/example\.com\/reference">docs<\/a>/);
  assert.match(response.body, /<code>inline-code<\/code>/);
  assert.match(response.body, /<pre><code>const value = 1;<\/code><\/pre>/);
  assert.match(response.body, /<ul>\s*<li>Create a managed document for route lookup\.<\/li>\s*<\/ul>/);
  assert.match(response.body, /&lt;script&gt;alert\(&#39;xss&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(response.body, /<script>alert\('xss'\)<\/script>/);
  assert.doesNotMatch(response.body, /href="javascript:alert\(1\)"/);
  assert.match(response.body, /Back to timeline/);
  assert.match(response.body, /href="\/timeline\?project=acme-app&amp;type=session-note"/);
  assert.match(response.body, /Project<\/span>acme-app/);
  assert.match(response.body, /Type<\/span>session-note/);
  assert.match(response.body, new RegExp(sessionNote.relativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Web document route omits Recorded At when only day-level fallback is available", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);

  const sessionNote = appendSessionNote(
    {
      project: "acme-app",
      topic: "day level document",
      date: "2026-03-22",
      summary: "Seed one exact document without precise intra-day recorded_at.",
      actions: ["Keep day-level fallback out of the Web metadata UI."],
      followUp: ["Show only the date when no precise time is available."],
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
  assert.match(response.body, /day-level-document/);
  assert.match(response.body, /Document Metadata/);
  assert.match(response.body, /Date/);
  assert.doesNotMatch(response.body, /Recorded At/);
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
  assert.match(response.body, /Not Found/);
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
  assert.match(response.body, /Invalid Document/);
  assert.match(response.body, /Back to timeline/);
});

test("Web document route returns invalid-document state for malformed route paths", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);

  const response = await handleWebRequest(
    {
      method: "GET",
      url: `/documents?from=${encodeURIComponent("/timeline?project=acme-app&type=session-note")}`,
    },
    {
      context,
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /Invalid Document/);
  assert.match(response.body, /requires an encoded managed relative path/i);
  assert.match(response.body, /href="\/timeline\?project=acme-app&amp;type=session-note"/);
  assert.match(response.body, /Project/);
  assert.match(response.body, /Type/);
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

test("Web routes return a deterministic configuration error state when repository config is missing", async () => {
  const response = await handleWebRequest(
    {
      method: "GET",
      url: "/timeline",
    },
    {
      configurationError: "PROJECT_MEMORY_ROOT is required.",
      host: "127.0.0.1",
      port: 0,
    },
  );

  assert.equal(response.statusCode, 500);
  assert.match(response.body, /Configuration Error/);
  assert.match(response.body, /PROJECT_MEMORY_ROOT is required\./);
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
    assert.ok(config.context);
    assert.equal(config.context.memoryRootDir, memoryRootDir);
  } finally {
    process.env.PROJECT_MEMORY_ROOT = originalProjectMemoryRoot;
    process.env.PROJECT_MEMORY_WEB_HOST = originalProjectMemoryWebHost;
    process.env.PROJECT_MEMORY_WEB_PORT = originalProjectMemoryWebPort;
    process.env.HOST = originalHost;
    process.env.PORT = originalPort;
  }
});

test("resolveWebRuntimeConfig keeps configuration errors in-band for the Web shell", () => {
  const originalProjectMemoryRoot = process.env.PROJECT_MEMORY_ROOT;
  const originalProjectMemoryWebHost = process.env.PROJECT_MEMORY_WEB_HOST;
  const originalProjectMemoryWebPort = process.env.PROJECT_MEMORY_WEB_PORT;
  const originalHost = process.env.HOST;
  const originalPort = process.env.PORT;

  delete process.env.PROJECT_MEMORY_ROOT;
  delete process.env.PROJECT_MEMORY_WEB_HOST;
  delete process.env.PROJECT_MEMORY_WEB_PORT;
  delete process.env.HOST;
  delete process.env.PORT;

  try {
    const config = resolveWebRuntimeConfig();

    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 4310);
    assert.equal(config.context, undefined);
    assert.match(config.configurationError ?? "", /PROJECT_MEMORY_ROOT is required/);
  } finally {
    process.env.PROJECT_MEMORY_ROOT = originalProjectMemoryRoot;
    process.env.PROJECT_MEMORY_WEB_HOST = originalProjectMemoryWebHost;
    process.env.PROJECT_MEMORY_WEB_PORT = originalProjectMemoryWebPort;
    process.env.HOST = originalHost;
    process.env.PORT = originalPort;
  }
});
