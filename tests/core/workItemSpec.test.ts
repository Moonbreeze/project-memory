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
    definitionOfDone: [
      { id: "tests-pass", criterion: "Run unit tests for the spec module.", evidenceRequired: false },
    ],
    dodEvidence: [],
    definitionOfDoneMode: "structured",
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
    definitionOfDone: [
      { id: "invalid-id", criterion: "Still validate lifecycle errors.", evidenceRequired: false },
    ],
    dodEvidence: [],
    definitionOfDoneMode: "structured",
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

test("validateWorkItemDefinition requires session-note evidence for done work items", () => {
  const result = validateWorkItemDefinition({
    metadata: {
      project: "project-memory",
      topic: "session-6-close-flow",
      date: "2026-03-21",
      status: "active",
      workItemState: "done",
    },
    summary: "Finalize the done-state evidence invariant.",
    outcome: "Done work items keep at least one execution chronology link.",
    origin: {
      kind: "ad-hoc",
      note: "Validation coverage.",
    },
    dependencies: [],
    context: [],
    verification: ["Run work-item validation coverage."],
    evidence: [
      {
        type: "verification-result",
        project: "project-memory",
        date: "2026-03-21",
        topic: "session-6-close-flow-checks",
      },
    ],
    definitionOfDone: [
      { id: "done-check", criterion: "Complete closure checks.", evidenceRequired: false },
    ],
    dodEvidence: [],
    definitionOfDoneMode: "structured",
  });

  assert.equal(result.ok, false);

  if (result.ok) {
    throw new Error("Expected validation failure");
  }

  assert(result.errors.includes("Done work items must include at least one session-note locator in evidence"));
});

test("validateWorkItemDefinition enforces structured DoD IDs, bindings, and required coverage", () => {
  const sessionLocator = {
    type: "session-note" as const,
    project: "project-memory",
    date: "2026-03-21",
    topic: "structured-dod-session",
  };
  const verificationLocator = {
    type: "verification-result" as const,
    project: "project-memory",
    date: "2026-03-21",
    topic: "structured-dod-checks",
  };
  const result = validateWorkItemDefinition({
    metadata: {
      project: "project-memory",
      topic: "structured-dod",
      date: "2026-03-21",
      status: "active",
      workItemState: "done",
    },
    summary: "Validate structured completion coverage.",
    outcome: "Required criteria have explicit evidence.",
    origin: { kind: "ad-hoc", note: "DoD validation coverage." },
    dependencies: [],
    context: [],
    verification: ["Run focused checks."],
    evidence: [sessionLocator, verificationLocator],
    definitionOfDone: [
      { id: "tests-pass", criterion: "Focused tests pass.", evidenceRequired: true },
      { id: "notes-written", criterion: "Notes are updated.", evidenceRequired: false },
    ],
    dodEvidence: [
      { locator: sessionLocator, covers: ["tests-pass", "notes-written"] },
      { locator: verificationLocator, covers: ["tests-pass"] },
    ],
    definitionOfDoneMode: "structured",
  });
  assert.deepEqual(result, { ok: true });

  const invalid = validateWorkItemDefinition({
    metadata: {
      project: "project-memory",
      topic: "structured-dod-invalid",
      date: "2026-03-21",
      status: "active",
      workItemState: "done",
    },
    summary: "Reject malformed completion coverage.",
    outcome: "Invalid bindings are explicit.",
    origin: { kind: "ad-hoc", note: "Negative DoD validation coverage." },
    dependencies: [],
    context: [],
    verification: ["Run focused checks."],
    evidence: [sessionLocator],
    definitionOfDone: [
      { id: "Bad ID", criterion: "Invalid ID.", evidenceRequired: true },
      { id: "duplicate", criterion: "First.", evidenceRequired: true },
      { id: "duplicate", criterion: "Second.", evidenceRequired: false },
    ],
    dodEvidence: [
      { locator: verificationLocator, covers: ["unknown", "unknown"] },
      { locator: verificationLocator, covers: [] },
    ],
    definitionOfDoneMode: "structured",
  });
  assert.equal(invalid.ok, false);
  if (invalid.ok) throw new Error("Expected validation failure");
  assert(invalid.errors.includes("definitionOfDone criterion id must use lowercase ASCII kebab-case"));
  assert(invalid.errors.includes("definitionOfDone criterion ids must be unique"));
  assert(invalid.errors.includes("dodEvidence locator must also be present in evidence"));
  assert(invalid.errors.includes("dodEvidence covers must not contain duplicate criterion ids"));
  assert(invalid.errors.includes("dodEvidence must not contain duplicate locator bindings"));
  assert(invalid.errors.includes("dodEvidence covers must contain at least one criterion id"));
  assert(invalid.errors.includes("Done work items require evidence covering criterion: duplicate"));
});
