import assert from "node:assert/strict";
import test from "node:test";

import { appendSessionNote, createDecision } from "../../src/core/index.ts";
import {
  isWebReadError,
  normalizeWebTimelineQuery,
  readWebBoundedRead,
  readWebDocument,
  readWebTimeline,
} from "../../src/web/readAdapter.ts";
import {
  createTestRepositoryContext,
  setupTestProjectTaxonomy,
  setupTestRepo,
  writeRawInvalidDoneWorkItem,
} from "../fixtures/setupTestRepo.ts";

test("Web read adapter normalizes timeline filters and maps document summaries", () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);
  setupTestProjectTaxonomy(context, "beta-app", ["docs"]);

  appendSessionNote(
    {
      project: "acme-app",
      topic: "timeline target",
      date: "2026-03-22",
      summary: "Seed one filtered session note.",
      actions: ["Create the row that should remain after filtering."],
      followUp: ["Keep timeline filtering on the shared-core list surface."],
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "timeline decision",
      date: "2026-03-22",
      context: "Seed a different document type for timeline filtering.",
      decision: "Keep type filtering in the Web adapter.",
      consequences: ["Routes can stay thin."],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );
  appendSessionNote(
    {
      project: "beta-app",
      topic: "other project row",
      date: "2026-03-22",
      summary: "Seed a row that project filtering should remove.",
      actions: ["Create a second project row."],
      followUp: ["Keep project filtering deterministic."],
    },
    context,
  );

  const query = normalizeWebTimelineQuery({
    limit: "10",
    project: "acme-app",
    status: "active",
    type: "session-note",
  });
  const view = readWebTimeline(query, context);

  assert.deepEqual(view.appliedQuery, {
    limit: 10,
    project: "acme-app",
    status: "active",
    type: "session-note",
  });
  assert.deepEqual(view.availableProjects, ["acme-app", "beta-app"]);
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]?.project, "acme-app");
  assert.equal(view.rows[0]?.topic, "timeline-target");
  assert.equal(
    view.rows[0]?.routePath,
    `/documents/${encodeURIComponent(view.rows[0]?.relativePath ?? "")}`,
  );

  const allProjectsQuery = normalizeWebTimelineQuery({
    project: "*",
  });

  assert.equal(allProjectsQuery.project, undefined);
});

test("Web read adapter returns a normalized invalid-document error for invalid managed documents", () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  const relativePath = writeRawInvalidDoneWorkItem(
    memoryRootDir,
    "acme-app",
    "broken-work-item",
    "2026-03-22",
  );

  try {
    readWebDocument(relativePath, context);
    assert.fail("Expected invalid managed document read to throw");
  } catch (error) {
    assert.equal(isWebReadError(error), true);
    if (!isWebReadError(error)) {
      return;
    }

    assert.equal(error.code, "invalid-document");
    assert.equal(error.statusCode, 500);
  }
});

test("Web read adapter exposes bounded reads as Web-oriented document summaries", () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  setupTestProjectTaxonomy(context, "acme-app", ["docs"]);

  createDecision(
    {
      project: "acme-app",
      topic: "bounded package",
      date: "2026-03-22",
      context: "Need one recent decision in the bounded package.",
      decision: "Expose bounded reads through the Web adapter.",
      consequences: ["Future composed views can reuse one adapter surface."],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );

  const view = readWebBoundedRead(
    {
      entrypoint: "cold-start",
      project: "acme-app",
    },
    context,
  );

  assert.equal(view.entrypoint, "cold-start");
  assert.equal(view.project, "acme-app");
  assert.match(view.notes.join("\n"), /Cold start reads only bounded runbook, canonical-doc, and decision sources\./);
  assert.ok(view.stages.length > 0);
  assert.ok(view.documents.length > 0);
  assert.ok(view.documents.every((document) => document.routePath.startsWith("/documents/")));
});
