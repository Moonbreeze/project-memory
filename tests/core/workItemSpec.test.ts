import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveWorkItemPlanningState,
  resolveWorkItemLocatorRelativePath,
  validateWorkItemDefinition,
} from "../../src/core/index.ts";

test("deriveWorkItemPlanningState keeps planning semantics separate from document status", () => {
  assert.equal(
    deriveWorkItemPlanningState({
      documentStatus: "active",
      workItemState: "open",
      unresolvedDependencyCount: 0,
    }),
    "ready",
  );
  assert.equal(
    deriveWorkItemPlanningState({
      documentStatus: "active",
      workItemState: "open",
      unresolvedDependencyCount: 2,
    }),
    "blocked",
  );
  assert.equal(
    deriveWorkItemPlanningState({
      documentStatus: "active",
      workItemState: "blocked",
      unresolvedDependencyCount: 0,
    }),
    "blocked",
  );
  assert.equal(
    deriveWorkItemPlanningState({
      documentStatus: "active",
      workItemState: "in_progress",
      unresolvedDependencyCount: 0,
    }),
    "in_progress",
  );
  assert.equal(
    deriveWorkItemPlanningState({
      documentStatus: "active",
      workItemState: "done",
      unresolvedDependencyCount: 0,
    }),
    "done",
  );
  assert.equal(
    deriveWorkItemPlanningState({
      documentStatus: "active",
      workItemState: "canceled",
      unresolvedDependencyCount: 0,
    }),
    "canceled",
  );
  assert.equal(
    deriveWorkItemPlanningState({
      documentStatus: "draft",
      workItemState: "open",
      unresolvedDependencyCount: 0,
    }),
    "draft",
  );
  assert.equal(
    deriveWorkItemPlanningState({
      documentStatus: "archived",
      workItemState: "done",
      unresolvedDependencyCount: 0,
    }),
    "archived",
  );
});

test("resolveWorkItemLocatorRelativePath maps future locators to deterministic active paths", () => {
  assert.equal(
    resolveWorkItemLocatorRelativePath({
      type: "decision",
      project: "project-memory",
      date: "2026-03-14",
      topic: "decision-and-work-item-separation",
    }),
    "projects/project-memory/decisions/2026/2026-03-14-decision-and-work-item-separation.md",
  );

  assert.equal(
    resolveWorkItemLocatorRelativePath({
      type: "canonical-doc",
      project: "project-memory",
      registryScope: "bounded-read",
      topic: "read-entrypoints",
    }),
    "projects/project-memory/canonical-docs/bounded-read/read-entrypoints.md",
  );

  assert.equal(
    resolveWorkItemLocatorRelativePath({
      type: "work-item",
      project: "project-memory",
      date: "2026-03-14",
      topic: "session-5-work-item-spec",
    }),
    "projects/project-memory/work-items/2026/2026-03-14-session-5-work-item-spec.md",
  );
});

test("validateWorkItemDefinition accepts the minimal future Session 5 schema", () => {
  const result = validateWorkItemDefinition({
    metadata: {
      project: "project-memory",
      topic: "session-5-work-item-spec",
      date: "2026-03-14",
      status: "active",
      workItemState: "open",
    },
    summary: "Finalize the first bounded work-item schema.",
    outcome: "Session 6 can implement the document type without reopening the model.",
    origin: {
      kind: "decision",
      locator: {
        type: "decision",
        project: "project-memory",
        date: "2026-03-14",
        topic: "decision-and-work-item-separation",
      },
    },
    dependencies: [
      {
        type: "work-item",
        project: "project-memory",
        date: "2026-03-14",
        topic: "read-entrypoints-phase-1-follow-up",
      },
    ],
    context: [
      {
        type: "canonical-doc",
        project: "project-memory",
        registryScope: "bounded-read",
        topic: "read-entrypoints",
      },
      {
        type: "session-note",
        project: "project-memory",
        date: "2026-03-14",
        topic: "bounded-read-entrypoints-session-4",
      },
    ],
    verification: ["Run unit tests for the spec module."],
    evidence: [
      {
        type: "verification-result",
        project: "project-memory",
        date: "2026-03-14",
        topic: "bounded-read-entrypoints-session-4",
      },
    ],
  });

  assert.deepEqual(result, { ok: true });
});

test("validateWorkItemDefinition rejects invalid lifecycle combinations and cross-project links", () => {
  const result = validateWorkItemDefinition({
    metadata: {
      project: "project-memory",
      topic: "session-5-work-item-spec",
      date: "2026-03-14",
      status: "archived",
      workItemState: "open",
    },
    summary: " ",
    outcome: " ",
    origin: {
      kind: "ad-hoc",
      note: " ",
    },
    dependencies: [
      {
        type: "work-item",
        project: "other-project",
        date: "2026-03-14",
        topic: "foreign-prerequisite",
      },
      {
        type: "work-item",
        project: "project-memory",
        date: "2026-03-14",
        topic: "session-5-work-item-spec",
      },
    ],
    context: [
      {
        type: "decision",
        project: "project-memory",
        date: "2026-03-14",
        topic: "valid-context",
      },
      {
        type: "decision",
        project: "project-memory",
        date: "2026-03-14",
        topic: "valid-context",
      },
    ],
    verification: [],
    evidence: [
      {
        type: "session-note",
        project: "other-project",
        date: "2026-03-14",
        topic: "foreign-evidence",
      },
    ],
  });

  assert.equal(result.ok, false);

  if (result.ok) {
    throw new Error("Expected validation failure");
  }

  assert(result.errors.includes("summary must not be empty"));
  assert(result.errors.includes("outcome must not be empty"));
  assert(result.errors.includes("origin note must not be empty"));
  assert(result.errors.includes("verification must contain at least one item"));
  assert(
    result.errors.includes("Archived work items must be done or canceled before archival"),
  );
  assert(result.errors.includes("dependencies must stay within project project-memory"));
  assert(result.errors.includes("dependencies must not reference the work item itself"));
  assert(result.errors.includes("context must not contain duplicate locators"));
  assert(result.errors.includes("evidence must stay within project project-memory"));
});
