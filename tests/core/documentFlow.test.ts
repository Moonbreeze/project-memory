import fs from "node:fs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  appendSessionNote,
  auditTaxonomyConsistency,
  archiveDocument,
  archiveWorkItem,
  bootstrapProject,
  closeWorkItem,
  commitPendingChanges,
  createDecision,
  createRunbook,
  listDocuments,
  readDocument,
  readColdStart,
  readPlanningBacklog,
  readPlanningTopicEntry,
  readRationaleEntry,
  readTopicEntry,
  recordVerificationResult,
  resolveArchiveRelativePath,
  resolveDocumentRelativePath,
  searchDocuments,
  upsertTaxonomyRegistry,
  upsertCanonicalDoc,
  upsertWorkItem,
} from "../../src/core/index.ts";
import {
  createTestRepositoryContext,
  setupTestProjectTaxonomy,
  setupTestRepo,
} from "../fixtures/setupTestRepo.ts";

const setupAcmeTaxonomy = (
  context: ReturnType<typeof createTestRepositoryContext>,
  scopes: string[],
): void => {
  setupTestProjectTaxonomy(context, "acme-app", scopes);
};

const writeRawCanonicalDoc = (
  rootDir: string,
  relativePath: string,
  registryScope: string,
  topic: string,
): void => {
  fs.mkdirSync(`${rootDir}/${relativePath.slice(0, relativePath.lastIndexOf("/"))}`, {
    recursive: true,
  });
  fs.writeFileSync(
    `${rootDir}/${relativePath}`,
    [
      "---",
      "date: 2026-03-11",
      "project: acme-app",
      `topic: ${topic}`,
      `registry_scope: ${registryScope}`,
      "source: manual",
      "status: active",
      "---",
      "",
      "# Canonical Doc",
      "",
      "## Summary",
      "",
      "Manual canonical fixture.",
      "",
      "## Guidance",
      "",
      "- Keep manual fixture active",
      "",
      "## References",
      "",
      "- none",
      "",
    ].join("\n"),
    "utf8",
  );
};

test("appendSessionNote writes a structured document to the expected path", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  const document = appendSessionNote(
    {
      project: "acme-app",
      topic: "resume verification",
      date: "2026-03-11",
      summary: "Validated resume flow against the current branch.",
      actions: ["Checked session resumption", "Confirmed output structure"],
      followUp: ["Add MCP integration coverage"],
    },
    context,
  );

  assert.equal(
    document.relativePath,
    resolveDocumentRelativePath("acme-app", "session-note", "resume verification", "2026-03-11"),
  );
  assert.match(fs.readFileSync(document.path, "utf8"), /## Summary/);
  assert.match(fs.readFileSync(document.path, "utf8"), /project: acme-app/);
  assert.doesNotMatch(fs.readFileSync(document.path, "utf8"), /project_commit:/);
});

test("readDocument rejects legacy project_commit frontmatter", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  const relativePath = "projects/acme-app/runbooks/legacy-runbook.md";

  fs.mkdirSync(`${rootDir}/projects/acme-app/runbooks`, { recursive: true });
  fs.writeFileSync(
    `${rootDir}/${relativePath}`,
    [
      "---",
      "date: 2026-03-11",
      "project: acme-app",
      "topic: legacy-runbook",
      "source: manual",
      "status: active",
      "project_commit: deadbeef",
      "---",
      "",
      "# Runbook",
      "",
      "## Purpose",
      "",
      "Keep legacy frontmatter readable during migration.",
      "",
      "## Procedure",
      "",
      "- Read legacy docs",
      "",
      "## Verification",
      "",
      "- Confirm no validation error",
    ].join("\n"),
    "utf8",
  );

  assert.throws(() => readDocument(context, relativePath), /Unknown metadata field: project_commit/);
});

test("validation rejects secret-like content", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  assert.throws(
    () =>
      appendSessionNote(
        {
          project: "acme-app",
          topic: "unsafe note",
          date: "2026-03-11",
          summary: "Captured secret sk-1234567890abcdefghijklmnop for debugging.",
          actions: ["none"],
          followUp: ["remove it"],
        },
        context,
      ),
    /secret-like content/,
  );
});

test("search excludes archived files from active document queries", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  const sessionDocument = appendSessionNote(
    {
      project: "acme-app",
      topic: "cache warmup",
      date: "2026-03-11",
      summary: "Warmup flow verified.",
      actions: ["Ran warmup"],
      followUp: ["Monitor metrics"],
    },
    context,
  );

  recordVerificationResult(
    {
      project: "acme-app",
      topic: "cache warmup",
      date: "2026-03-11",
      scope: "Cache warmup",
      steps: ["Hit warmup endpoint", "Confirmed populated cache"],
      result: "Pass",
    },
    context,
  );

  const beforeArchive = searchDocuments({ project: "acme-app", text: "warmup" }, context);
  assert.equal(beforeArchive.length, 2);

  const archived = archiveDocument({ relativePath: sessionDocument.relativePath }, context);
  assert.equal(archived.relativePath, resolveArchiveRelativePath(sessionDocument.relativePath));

  const afterArchive = searchDocuments({ project: "acme-app", text: "warmup" }, context);
  assert.equal(afterArchive.length, 1);
  assert.equal(afterArchive[0]?.type, "verification-result");
});

test("archiveDocument archives decisions in place by updating status", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  const decision = createDecision(
    {
      project: "acme-app",
      topic: "archive policy",
      date: "2026-03-11",
      context: "Need explicit archive coverage for durable records.",
      decision: "Archive decisions in place instead of moving them.",
      consequences: ["Stable paths remain readable after archival."],
    },
    context,
  );

  const archived = archiveDocument({ relativePath: decision.relativePath }, context);
  assert.equal(archived.relativePath, decision.relativePath);
  assert.equal(archived.metadata.status, "archived");

  const backlog = listDocuments({ project: "acme-app", preset: "backlog" }, context);
  assert.equal(backlog.documents.length, 0);
});

test("archiveDocument rejects work-item paths and requires the dedicated lifecycle helper", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  const workItem = upsertWorkItem(
    {
      project: "acme-app",
      topic: "archive via wrong helper",
      date: "2026-03-11",
      summary: "Verify archive helper boundaries.",
      outcome: "Generic archive flow should reject work-item paths.",
      origin: {
        kind: "ad-hoc",
        note: "Negative archive coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Expect archiveDocument to reject work-item paths."],
      evidence: [],
      workItemState: "done",
    },
    context,
  );

  assert.throws(
    () => archiveDocument({ relativePath: workItem.relativePath }, context),
    /Use archiveWorkItem to archive work-item documents/,
  );
});

test("list and search ignore markdown files outside the managed document structure", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  const unsupportedPath = "projects/acme-app/scratch/unmanaged.md";

  fs.mkdirSync(`${rootDir}/projects/acme-app/scratch`, { recursive: true });
  fs.writeFileSync(
    `${rootDir}/${unsupportedPath}`,
    [
      "---",
      "date: 2026-03-11",
      "project: acme-app",
      "topic: unmanaged",
      "source: manual",
      "status: active",
      "---",
      "",
      "## Summary",
      "This file should stay outside the managed surface.",
    ].join("\n"),
    "utf8",
  );

  const listed = listDocuments({ project: "acme-app" }, context);
  const searched = searchDocuments({ project: "acme-app", text: "managed surface" }, context);

  assert.equal(listed.documents.length, 0);
  assert.equal(searched.length, 0);
});

test("listDocuments omits bodies by default and includes them on request", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  appendSessionNote(
    {
      project: "acme-app",
      topic: "list metadata",
      date: "2026-03-11",
      summary: "Validate metadata-only listing.",
      actions: ["Created one note"],
      followUp: ["Read it back if needed"],
    },
    context,
  );

  const listedWithoutBody = listDocuments({ project: "acme-app" }, context);
  const listedWithBody = listDocuments({ project: "acme-app", includeBody: true }, context);

  assert.equal(listedWithoutBody.appliedQuery.includeBody, false);
  assert.equal(listedWithBody.appliedQuery.includeBody, true);
  assert.equal(listedWithoutBody.documents.length, 1);
  assert.equal(listedWithBody.documents.length, 1);
  assert.equal("body" in (listedWithoutBody.documents[0] ?? {}), false);
  assert.match((listedWithBody.documents[0]?.body ?? ""), /Validate metadata-only listing/);
});

test("listDocuments backlog preset applies decision-focused sorting and status filtering", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  createDecision(
    {
      project: "acme-app",
      topic: "older active decision",
      date: "2026-03-10",
      context: "Need one older backlog item.",
      decision: "Keep the older item visible.",
      consequences: ["Shows sorted order"],
      status: "active",
    },
    context,
  );

  createDecision(
    {
      project: "acme-app",
      topic: "newer draft decision",
      date: "2026-03-12",
      context: "Need one newer backlog item.",
      decision: "Keep draft decisions visible too.",
      consequences: ["Shows backlog filtering"],
      status: "draft",
    },
    context,
  );

  createDecision(
    {
      project: "acme-app",
      topic: "superseded decision",
      date: "2026-03-13",
      context: "Need one hidden item.",
      decision: "Do not show superseded decisions in the backlog preset.",
      consequences: ["Should be filtered out"],
      status: "superseded",
    },
    context,
  );

  appendSessionNote(
    {
      project: "acme-app",
      topic: "non-decision note",
      date: "2026-03-14",
      summary: "Should not appear in the backlog preset.",
      actions: ["Created unrelated note"],
      followUp: ["Ignore it"],
    },
    context,
  );

  const listed = listDocuments({ project: "acme-app", preset: "backlog" }, context);

  assert.deepEqual(
    listed.appliedQuery,
    {
      project: "acme-app",
      type: "decision",
      excludeStatuses: ["superseded", "archived"],
      preset: "backlog",
      sort: "date",
      order: "desc",
      limit: 100,
      includeBody: false,
    },
  );
  assert.deepEqual(
    listed.documents.map((document) => document.metadata.topic),
    ["newer-draft-decision", "older-active-decision"],
  );
});

test("upsertCanonicalDoc writes a scoped document and keeps it visible to list, read, and search", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  setupAcmeTaxonomy(context, ["resume-flow"]);

  const initial = upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy",
      registryScope: "resume-flow",
      date: "2026-03-11",
      summary: "Canonical guidance for the resume flow scope.",
      guidance: ["Prefer the declared resume-flow scope", "Store only finalized guidance here"],
      references: ["decision: taxonomy-registry-baseline"],
    },
    context,
  );

  assert.equal(
    initial.relativePath,
    resolveDocumentRelativePath("acme-app", "canonical-doc", "resume policy", "2026-03-11", {
      registryScope: "resume-flow",
    }),
  );
  assert.match(fs.readFileSync(initial.path, "utf8"), /registry_scope: resume-flow/);

  const listed = listDocuments({ project: "acme-app", type: "canonical-doc", includeBody: true }, context);
  assert.equal(listed.documents.length, 2);
  const resumePolicyDocument = listed.documents.find((document) => {
    return document.metadata.registry_scope === "resume-flow";
  });
  assert.equal(resumePolicyDocument?.metadata.registry_scope, "resume-flow");
  assert.match(resumePolicyDocument?.body ?? "", /Canonical guidance for the resume flow scope/);

  const searched = searchDocuments({ project: "acme-app", type: "canonical-doc", text: "finalized guidance" }, context);
  assert.equal(searched.length, 1);

  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy",
      registryScope: "resume-flow",
      date: "2026-03-11",
      summary: "Updated canonical guidance for the resume flow scope.",
      guidance: ["Keep the same scoped path on rewrite"],
      references: ["runbook: taxonomy-registry-baseline"],
    },
    context,
  );

  const reread = readDocument(context, initial.relativePath);
  assert.equal(reread.metadata.registry_scope, "resume-flow");
  assert.match(reread.body, /Updated canonical guidance/);
  assert.doesNotMatch(reread.body, /Store only finalized guidance here/);
});

test("bootstrapProject creates the reserved active taxonomy registry document", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  const result = bootstrapProject(
    {
      project: "Acme App",
      date: "2026-03-11",
    },
    context,
  );
  const registryDocument = readDocument(context, result.registryRelativePath);

  assert.equal(result.project, "acme-app");
  assert.equal(result.registryCreated, true);
  assert.equal(registryDocument.metadata.registry_scope, "taxonomy-registry");
  assert.equal(registryDocument.metadata.topic, "taxonomy-registry");
  assert.match(registryDocument.body, /registry-entry:/);
});

test("upsertCanonicalDoc rejects unknown taxonomy scopes after bootstrap", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  bootstrapProject(
    {
      project: "acme-app",
      date: "2026-03-11",
    },
    context,
  );

  assert.throws(
    () =>
      upsertCanonicalDoc(
        {
          project: "acme-app",
          topic: "resume policy",
          registryScope: "resume-flow",
          date: "2026-03-11",
          summary: "Canonical guidance for resume flow.",
          guidance: ["Keep scope registration explicit"],
          references: [],
        },
        context,
      ),
    /Unknown taxonomy registry scope: resume-flow/,
  );
});

test("auditTaxonomyConsistency reports duplicate authority, unknown scope usage, and retired scope usage", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  setupAcmeTaxonomy(context, ["resume-flow", "legacy-flow"]);

  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy",
      registryScope: "resume-flow",
      date: "2026-03-11",
      summary: "Primary resume policy.",
      guidance: ["Keep one primary authority"],
      references: [],
    },
    context,
  );
  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "legacy policy",
      registryScope: "legacy-flow",
      date: "2026-03-11",
      summary: "Legacy policy before retirement.",
      guidance: ["Retire after audit coverage"],
      references: [],
    },
    context,
  );
  upsertTaxonomyRegistry(
    {
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
        {
          scope: "legacy-flow",
          topic: "legacy-flow",
          authority: "legacy-flow",
          state: "retired",
          migration: "retire-topic",
          aliases: [],
          mappedScopes: [],
        },
      ],
    },
    context,
  );
  writeRawCanonicalDoc(
    rootDir,
    "projects/acme-app/canonical-docs/resume-flow/resume-policy-shadow.md",
    "resume-flow",
    "resume-policy-shadow",
  );
  writeRawCanonicalDoc(
    rootDir,
    "projects/acme-app/canonical-docs/unknown-scope/unknown-policy.md",
    "unknown-scope",
    "unknown-policy",
  );

  const result = auditTaxonomyConsistency({ project: "acme-app" }, context);

  assert.equal(result.passed, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["duplicate-authority", "retired-scope-usage", "unknown-scope"],
  );
});

test("upsertWorkItem writes a managed work item and exposes planning metadata through list, read, and search", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  const initial = upsertWorkItem(
    {
      project: "acme-app",
      topic: "resume backlog slice",
      date: "2026-03-11",
      summary: "Implement the first resumable backlog slice.",
      outcome: "Agents can track implementation work separately from decisions.",
      origin: {
        kind: "ad-hoc",
        note: "Session 6 implementation seed.",
      },
      dependencies: [],
      context: [
        {
          type: "decision",
          project: "acme-app",
          date: "2026-03-10",
          topic: "decision-and-work-item-separation",
        },
      ],
      verification: ["Run the work-item integration test suite."],
      evidence: [],
    },
    context,
  );

  assert.equal(
    initial.relativePath,
    resolveDocumentRelativePath("acme-app", "work-item", "resume backlog slice", "2026-03-11"),
  );
  assert.match(fs.readFileSync(initial.path, "utf8"), /work_item_state: open/);

  const listed = listDocuments({ project: "acme-app", type: "work-item", includeBody: true }, context);
  assert.equal(listed.documents.length, 1);
  assert.equal(listed.documents[0]?.metadata.work_item_state, "open");
  assert.equal(listed.documents[0]?.planningState, "ready");
  assert.equal(listed.documents[0]?.unresolvedDependencyCount, 0);
  assert.match(listed.documents[0]?.body ?? "", /Implement the first resumable backlog slice/);

  const searched = searchDocuments({ project: "acme-app", type: "work-item", text: "implementation work separately" }, context);
  assert.equal(searched.length, 1);

  const reread = readDocument(context, initial.relativePath);
  assert.equal(reread.metadata.work_item_state, "open");
  assert.match(reread.body, /Session 6 implementation seed/);
});

test("closeWorkItem applies a terminal lifecycle state and removes the item from backlog planning", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "closeable slice",
      date: "2026-03-11",
      summary: "Finish the first closeable slice.",
      outcome: "The lifecycle helper can mark work complete without rewriting the body.",
      origin: {
        kind: "ad-hoc",
        note: "Session 7 close helper coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Confirm the close helper updates only lifecycle metadata."],
      evidence: [],
      workItemState: "in_progress",
    },
    context,
  );

  const closed = closeWorkItem(
    {
      project: "acme-app",
      topic: "closeable slice",
      date: "2026-03-11",
      state: "done",
    },
    context,
  );

  assert.equal(closed.metadata.work_item_state, "done");
  assert.match(closed.body, /Finish the first closeable slice/);

  const backlog = listDocuments({ project: "acme-app", preset: "backlog" }, context);
  assert.equal(backlog.documents.length, 0);

  assert.throws(
    () =>
      closeWorkItem(
        {
          project: "acme-app",
          topic: "closeable slice",
          date: "2026-03-11",
          state: "canceled",
        },
        context,
      ),
    /Cannot transition work item from done to canceled/,
  );
});

test("archiveWorkItem archives terminal work items without moving them into the archive tree", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "archivable slice",
      date: "2026-03-11",
      summary: "Archive the first completed work-item slice.",
      outcome: "The bounded archive helper can retire finished work in place.",
      origin: {
        kind: "ad-hoc",
        note: "Session 8 archive helper coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Confirm archival updates only the document status."],
      evidence: [],
      workItemState: "done",
    },
    context,
  );

  const archived = archiveWorkItem(
    {
      project: "acme-app",
      topic: "archivable slice",
      date: "2026-03-11",
    },
    context,
  );

  assert.equal(archived.metadata.status, "archived");
  assert.equal(archived.metadata.work_item_state, "done");
  assert.match(archived.relativePath, /projects\/acme-app\/work-items\/2026\//);

  const archivedAgain = archiveWorkItem(
    {
      project: "acme-app",
      topic: "archivable slice",
      date: "2026-03-11",
    },
    context,
  );
  assert.equal(archivedAgain.metadata.status, "archived");

  const backlog = listDocuments({ project: "acme-app", preset: "backlog" }, context);
  assert.equal(backlog.documents.length, 0);

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "non-terminal slice",
      date: "2026-03-12",
      summary: "Keep one work item active.",
      outcome: "Archival must reject non-terminal lifecycle states.",
      origin: {
        kind: "ad-hoc",
        note: "Negative archive coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Confirm archival rejects open work items."],
      evidence: [],
    },
    context,
  );

  assert.throws(
    () =>
      archiveWorkItem(
        {
          project: "acme-app",
          topic: "non-terminal slice",
          date: "2026-03-12",
        },
        context,
      ),
    /Only done or canceled work items can be archived; received open/,
  );
});

test("readDocument rejects work-item documents without work_item_state metadata", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  const relativePath = "projects/acme-app/work-items/2026/2026-03-11-missing-state.md";

  fs.mkdirSync(`${rootDir}/projects/acme-app/work-items/2026`, { recursive: true });
  fs.writeFileSync(
    `${rootDir}/${relativePath}`,
    [
      "---",
      "date: 2026-03-11",
      "project: acme-app",
      "topic: missing-state",
      "source: manual",
      "status: active",
      "---",
      "",
      "# Work Item",
      "",
      "## Summary",
      "",
      "Missing lifecycle metadata.",
      "",
      "## Outcome",
      "",
      "This document should fail validation.",
      "",
      "## Provenance",
      "",
      "- ad-hoc: Missing state coverage",
      "",
      "## Dependencies",
      "",
      "- none",
      "",
      "## Context",
      "",
      "- none",
      "",
      "## Verification",
      "",
      "- Confirm validation failure",
      "",
      "## Evidence",
      "",
      "- none",
    ].join("\n"),
    "utf8",
  );

  assert.throws(() => readDocument(context, relativePath), /work_item_state/);
});

test("listDocuments backlog preset uses project work items for planning and keeps decision fallback elsewhere", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  createDecision(
    {
      project: "acme-app",
      topic: "legacy backlog fallback",
      date: "2026-03-09",
      context: "Legacy decision-backed backlog.",
      decision: "Keep the fallback readable outside project-scoped work planning.",
      consequences: ["No-project backlog stays compatible"],
    },
    context,
  );

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "ready slice",
      date: "2026-03-13",
      summary: "One immediately executable slice.",
      outcome: "The backlog can surface ready work first.",
      origin: {
        kind: "ad-hoc",
        note: "Planning coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Confirm ready work appears first."],
      evidence: [],
    },
    context,
  );

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "in-progress slice",
      date: "2026-03-12",
      summary: "One slice already in progress.",
      outcome: "The backlog still surfaces current execution work.",
      origin: {
        kind: "ad-hoc",
        note: "Planning coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Confirm in-progress work stays visible."],
      evidence: [],
      workItemState: "in_progress",
    },
    context,
  );

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "blocked slice",
      date: "2026-03-14",
      summary: "One blocked downstream slice.",
      outcome: "The backlog distinguishes blocked work from ready work.",
      origin: {
        kind: "ad-hoc",
        note: "Planning coverage.",
      },
      dependencies: [
        {
          type: "work-item",
          project: "acme-app",
          date: "2026-03-15",
          topic: "missing-prerequisite",
        },
      ],
      context: [],
      verification: ["Confirm blocked work shows one unresolved dependency."],
      evidence: [],
    },
    context,
  );

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "done slice",
      date: "2026-03-11",
      summary: "One completed slice.",
      outcome: "Completed work should not drive the active backlog.",
      origin: {
        kind: "ad-hoc",
        note: "Planning coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Confirm completed work is filtered out."],
      evidence: [],
      workItemState: "done",
    },
    context,
  );

  const projectBacklog = listDocuments({ project: "acme-app", preset: "backlog" }, context);
  assert.deepEqual(
    projectBacklog.documents.map((document) => {
      return [document.metadata.topic, document.planningState, document.unresolvedDependencyCount];
    }),
    [
      ["ready-slice", "ready", 0],
      ["in-progress-slice", "in_progress", 0],
      ["blocked-slice", "blocked", 1],
    ],
  );
  assert.equal(projectBacklog.appliedQuery.type, "work-item");
  assert.equal(projectBacklog.appliedQuery.status, "active");
  assert.equal(projectBacklog.appliedQuery.order, "desc");

  const fallbackBacklog = listDocuments({ preset: "backlog" }, context);
  assert.equal(fallbackBacklog.appliedQuery.type, "decision");
  assert.deepEqual(
    fallbackBacklog.documents.map((document) => document.metadata.topic),
    ["legacy-backlog-fallback"],
  );
});

test("readPlanningBacklog returns a bounded work-item planning slice without decision fallback", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  createDecision(
    {
      project: "acme-app",
      topic: "legacy planning fallback",
      date: "2026-03-09",
      context: "Legacy backlog data still exists.",
      decision: "Dedicated planning reads must not fall back to decisions.",
      consequences: ["Planning reads stay work-item-only"],
    },
    context,
  );

  const createWorkItem = (
    topic: string,
    date: string,
    overrides: Partial<Parameters<typeof upsertWorkItem>[0]> = {},
  ) => {
    upsertWorkItem(
      {
        project: "acme-app",
        topic,
        date,
        summary: `Planning slice for ${topic}.`,
        outcome: `Bounded planning can reason about ${topic}.`,
        origin: {
          kind: "ad-hoc",
          note: "Planning backlog coverage.",
        },
        dependencies: [],
        context: [],
        verification: [`Confirm ${topic} appears in the bounded planning read.`],
        evidence: [],
        ...overrides,
      },
      context,
    );
  };

  createWorkItem("ready alpha", "2026-03-11");
  createWorkItem("ready beta", "2026-03-12");
  createWorkItem("ready gamma", "2026-03-13");
  createWorkItem("ready delta", "2026-03-14");
  createWorkItem("ready epsilon", "2026-03-15", {
    dependencies: [
      {
        type: "work-item",
        project: "acme-app",
        date: "2026-03-16",
        topic: "done-hidden",
      },
    ],
  });

  createWorkItem("in progress alpha", "2026-03-13", { workItemState: "in_progress" });
  createWorkItem("in progress beta", "2026-03-14", { workItemState: "in_progress" });
  createWorkItem("in progress gamma", "2026-03-15", { workItemState: "in_progress" });

  createWorkItem("blocked alpha", "2026-03-12", {
    dependencies: [
      {
        type: "work-item",
        project: "acme-app",
        date: "2026-03-15",
        topic: "ready-epsilon",
      },
    ],
  });
  createWorkItem("blocked beta", "2026-03-13", { workItemState: "blocked" });
  createWorkItem("blocked gamma", "2026-03-14", {
    workItemState: "blocked",
    dependencies: [
      {
        type: "work-item",
        project: "acme-app",
        date: "2026-03-15",
        topic: "ready-epsilon",
      },
    ],
  });

  createWorkItem("done hidden", "2026-03-16", { workItemState: "done" });
  createWorkItem("draft hidden", "2026-03-17", { status: "draft" });

  const result = readPlanningBacklog({ project: "acme-app" }, context);

  assert.equal(result.entrypoint, "planning-backlog");
  assert.deepEqual(
    result.stages.map((stage) => [stage.name, stage.relativePaths.length]),
    [
      ["ready-next", 4],
      ["in-progress-current", 2],
      ["blocked-follow-up", 2],
    ],
  );
  assert.deepEqual(
    result.documents.map((document) => document.metadata.topic),
    [
      "ready-epsilon",
      "ready-delta",
      "ready-gamma",
      "ready-beta",
      "in-progress-gamma",
      "in-progress-beta",
      "blocked-gamma",
      "blocked-beta",
    ],
  );
  assert.deepEqual(
    result.planningExplainability?.map((entry) => [
      entry.relativePath,
      entry.planningState,
      entry.unresolvedDependencyCount,
      entry.dependencySurfaces.map((dependency) => [dependency.relativePath, dependency.resolved]),
    ]),
    [
      [
        "projects/acme-app/work-items/2026/2026-03-15-ready-epsilon.md",
        "ready",
        0,
        [["projects/acme-app/work-items/2026/2026-03-16-done-hidden.md", true]],
      ],
      ["projects/acme-app/work-items/2026/2026-03-14-ready-delta.md", "ready", 0, []],
      ["projects/acme-app/work-items/2026/2026-03-13-ready-gamma.md", "ready", 0, []],
      ["projects/acme-app/work-items/2026/2026-03-12-ready-beta.md", "ready", 0, []],
      ["projects/acme-app/work-items/2026/2026-03-15-in-progress-gamma.md", "in_progress", 0, []],
      ["projects/acme-app/work-items/2026/2026-03-14-in-progress-beta.md", "in_progress", 0, []],
      [
        "projects/acme-app/work-items/2026/2026-03-14-blocked-gamma.md",
        "blocked",
        1,
        [["projects/acme-app/work-items/2026/2026-03-15-ready-epsilon.md", false]],
      ],
      ["projects/acme-app/work-items/2026/2026-03-13-blocked-beta.md", "blocked", 0, []],
    ],
  );
  assert(
    result.notes.includes(
      "Planning backlog reads only same-project active work-item documents and never falls back to decision backlog behavior.",
    ),
  );
});

test("readPlanningTopicEntry returns a bounded exact-topic work-item planning slice", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  setupAcmeTaxonomy(context, ["resume-flow"]);

  const createWorkItem = (
    project: string,
    topic: string,
    date: string,
    overrides: Partial<Parameters<typeof upsertWorkItem>[0]> = {},
  ) => {
    upsertWorkItem(
      {
        project,
        topic,
        date,
        summary: `Planning slice for ${topic}.`,
        outcome: `Bounded planning can reason about ${topic}.`,
        origin: {
          kind: "ad-hoc",
          note: "Planning topic coverage.",
        },
        dependencies: [],
        context: [],
        verification: [`Confirm ${topic} appears in the bounded planning topic read.`],
        evidence: [],
        ...overrides,
      },
      context,
    );
  };

  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy",
      registryScope: "resume-flow",
      date: "2026-03-10",
      summary: "Canonical resume policy.",
      guidance: ["Prefer resumable execution."],
      references: ["decision: resume-architecture"],
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "resume-architecture",
      date: "2026-03-11",
      status: "draft",
      context: "Need explicit planning context coverage.",
      decision: "Keep resume execution stateful.",
      consequences: ["Planning readers can follow direct decision context."],
    },
    context,
  );
  appendSessionNote(
    {
      project: "acme-app",
      topic: "resume-investigation",
      date: "2026-03-12",
      summary: "Checked resume edge cases.",
      actions: ["Reviewed work-item context ordering."],
      followUp: ["Add bounded read coverage."],
    },
    context,
  );
  appendSessionNote(
    {
      project: "acme-app",
      topic: "resume-evidence-session",
      date: "2026-03-13",
      summary: "Captured evidence while testing resume execution.",
      actions: ["Saved the first explicit evidence note."],
      followUp: ["Keep bounded evidence ordering deterministic."],
    },
    context,
  );
  appendSessionNote(
    {
      project: "acme-app",
      topic: "resume-evidence-follow-up",
      date: "2026-03-14",
      summary: "Captured a later evidence note.",
      actions: ["Saved the second explicit evidence note."],
      followUp: ["Confirm bounded evidence limits."],
    },
    context,
  );
  recordVerificationResult(
    {
      project: "acme-app",
      topic: "resume-evidence-alpha",
      date: "2026-03-13",
      scope: "Resume slice alpha evidence",
      steps: ["Run alpha resume scenario"],
      result: "Pass",
    },
    context,
  );
  recordVerificationResult(
    {
      project: "acme-app",
      topic: "resume-evidence-beta",
      date: "2026-03-14",
      scope: "Resume slice beta evidence",
      steps: ["Run beta resume scenario"],
      result: "Pass",
    },
    context,
  );
  recordVerificationResult(
    {
      project: "acme-app",
      topic: "resume-evidence-gamma",
      date: "2026-03-15",
      scope: "Resume slice gamma evidence",
      steps: ["Run gamma resume scenario"],
      result: "Pass",
    },
    context,
  );
  createWorkItem("acme-app", "resume prerequisite", "2026-03-10", {
    workItemState: "done",
  });

  createWorkItem("acme-app", "resume slice", "2026-03-11", { workItemState: "canceled" });
  createWorkItem("acme-app", "resume slice", "2026-03-12", { workItemState: "done" });
  createWorkItem("acme-app", "resume slice", "2026-03-13", {
    dependencies: [
      {
        type: "work-item",
        project: "acme-app",
        date: "2026-03-15",
        topic: "resume-slice",
      },
    ],
    context: [
      {
        type: "canonical-doc",
        project: "acme-app",
        registryScope: "resume-flow",
        topic: "resume-policy",
      },
    ],
    evidence: [
      {
        type: "verification-result",
        project: "acme-app",
        date: "2026-03-13",
        topic: "resume-evidence-alpha",
      },
    ],
  });
  createWorkItem("acme-app", "resume slice", "2026-03-14", {
    workItemState: "in_progress",
    dependencies: [
      {
        type: "work-item",
        project: "acme-app",
        date: "2026-03-10",
        topic: "resume-prerequisite",
      },
    ],
    context: [
      {
        type: "session-note",
        project: "acme-app",
        date: "2026-03-12",
        topic: "resume-investigation",
      },
      {
        type: "decision",
        project: "acme-app",
        date: "2026-03-11",
        topic: "resume-architecture",
      },
    ],
    evidence: [
      {
        type: "session-note",
        project: "acme-app",
        date: "2026-03-13",
        topic: "resume-evidence-session",
      },
      {
        type: "verification-result",
        project: "acme-app",
        date: "2026-03-14",
        topic: "resume-evidence-beta",
      },
    ],
  });
  createWorkItem("acme-app", "resume slice", "2026-03-15", {
    dependencies: [
      {
        type: "work-item",
        project: "acme-app",
        date: "2026-03-12",
        topic: "resume-slice",
      },
    ],
    context: [
      {
        type: "decision",
        project: "acme-app",
        date: "2026-03-11",
        topic: "resume-architecture",
      },
      {
        type: "canonical-doc",
        project: "acme-app",
        registryScope: "resume-flow",
        topic: "resume-policy",
      },
    ],
    evidence: [
      {
        type: "verification-result",
        project: "acme-app",
        date: "2026-03-13",
        topic: "resume-evidence-alpha",
      },
    ],
  });
  createWorkItem("acme-app", "resume slice", "2026-03-16", {
    status: "draft",
    evidence: [
      {
        type: "verification-result",
        project: "acme-app",
        date: "2026-03-15",
        topic: "resume-evidence-gamma",
      },
      {
        type: "session-note",
        project: "acme-app",
        date: "2026-03-14",
        topic: "resume-evidence-follow-up",
      },
    ],
  });
  createWorkItem("acme-app", "resume slice follow-up", "2026-03-17");
  createWorkItem("beta-app", "resume slice", "2026-03-18");

  const result = readPlanningTopicEntry(
    { project: "acme-app", topic: "resume slice" },
    context,
  );

  assert.equal(result.entrypoint, "planning-topic-entry");
  assert.equal(result.topic, "resume-slice");
  assert.deepEqual(
    result.stages.map((stage) => [stage.name, stage.relativePaths.length]),
    [
      ["work-item-exact", 4],
      ["dependency-work-item-explicit", 1],
      ["context-canonical-explicit", 1],
      ["context-decision-explicit", 1],
      ["context-session-note-explicit", 1],
      ["evidence-verification-explicit", 2],
      ["evidence-session-note-explicit", 1],
    ],
  );
  assert.deepEqual(
    result.documents.map((document) => document.relativePath),
    [
      "projects/acme-app/work-items/2026/2026-03-15-resume-slice.md",
      "projects/acme-app/work-items/2026/2026-03-14-resume-slice.md",
      "projects/acme-app/work-items/2026/2026-03-13-resume-slice.md",
      "projects/acme-app/work-items/2026/2026-03-12-resume-slice.md",
      "projects/acme-app/work-items/2026/2026-03-10-resume-prerequisite.md",
      "projects/acme-app/canonical-docs/resume-flow/resume-policy.md",
      "projects/acme-app/decisions/2026/2026-03-11-resume-architecture.md",
      "projects/acme-app/session-log/2026/03/2026-03-12-resume-investigation.md",
      "projects/acme-app/verification/2026/2026-03-13-resume-evidence-alpha.md",
      "projects/acme-app/verification/2026/2026-03-14-resume-evidence-beta.md",
      "projects/acme-app/session-log/2026/03/2026-03-13-resume-evidence-session.md",
    ],
  );
  assert.deepEqual(
    result.planningExplainability?.map((entry) => [
      entry.relativePath,
      entry.planningState,
      entry.unresolvedDependencyCount,
      entry.dependencySurfaces.map((dependency) => [dependency.relativePath, dependency.resolved]),
    ]),
    [
      [
        "projects/acme-app/work-items/2026/2026-03-15-resume-slice.md",
        "ready",
        0,
        [["projects/acme-app/work-items/2026/2026-03-12-resume-slice.md", true]],
      ],
      [
        "projects/acme-app/work-items/2026/2026-03-14-resume-slice.md",
        "in_progress",
        0,
        [["projects/acme-app/work-items/2026/2026-03-10-resume-prerequisite.md", true]],
      ],
      [
        "projects/acme-app/work-items/2026/2026-03-13-resume-slice.md",
        "blocked",
        1,
        [["projects/acme-app/work-items/2026/2026-03-15-resume-slice.md", false]],
      ],
      ["projects/acme-app/work-items/2026/2026-03-12-resume-slice.md", "done", 0, []],
    ],
  );
  assert(
    result.notes.includes(
      "Planning topic entry seeds work-item selection with same-project active documents whose topic exactly matches the requested topic.",
    ),
  );
  assert(
    result.notes.includes(
      "Planning topic entry follows only explicit same-project dependency work items from the selected work items, with a fixed limit and no recursive expansion.",
    ),
  );
  assert(
    result.notes.includes(
      "Planning topic entry follows only explicit same-project context locators from the selected work items, with fixed per-type limits and no fallback expansion.",
    ),
  );
  assert(
    result.notes.includes(
      "Planning topic entry follows only explicit same-project evidence locators from the selected work items, with fixed per-type limits and no fallback expansion.",
    ),
  );
});

test("readDocument rejects canonical docs without registry_scope metadata", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  const relativePath = "projects/acme-app/canonical-docs/resume-flow/resume-policy.md";

  fs.mkdirSync(`${rootDir}/projects/acme-app/canonical-docs/resume-flow`, { recursive: true });
  fs.writeFileSync(
    `${rootDir}/${relativePath}`,
    [
      "---",
      "date: 2026-03-11",
      "project: acme-app",
      "topic: resume-policy",
      "source: manual",
      "status: active",
      "---",
      "",
      "# Canonical Doc",
      "",
      "## Summary",
      "",
      "Scoped canonical guidance.",
      "",
      "## Guidance",
      "",
      "- Keep registry linkage explicit",
      "",
      "## References",
      "",
      "- taxonomy-registry-baseline",
    ].join("\n"),
    "utf8",
  );

  assert.throws(() => readDocument(context, relativePath), /registry_scope/);
});

test("commitPendingChanges stages and commits approved document paths", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  appendSessionNote(
    {
      project: "acme-app",
      topic: "commit flow",
      date: "2026-03-11",
      summary: "Prepared commit flow validation.",
      actions: ["Created session note"],
      followUp: ["Inspect git log"],
    },
    context,
  );

  const result = commitPendingChanges({ message: "docs(acme-app/session): commit flow validation" }, context);
  const log = spawnSync("git", ["log", "--oneline", "-1"], { cwd: rootDir, encoding: "utf8" });

  assert.equal(result.message, "docs(acme-app/session): commit flow validation");
  assert.equal(result.committedPaths.length, 1);
  assert.match(log.stdout, /docs\(acme-app\/session\): commit flow validation/);
});

test("commitPendingChanges excludes unmanaged files under projects", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  const unmanagedPath = "projects/acme-app/scratch/unmanaged.txt";

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  fs.mkdirSync(`${rootDir}/projects/acme-app/scratch`, { recursive: true });
  fs.writeFileSync(`${rootDir}/${unmanagedPath}`, "temporary scratch data\n", "utf8");

  appendSessionNote(
    {
      project: "acme-app",
      topic: "approved note",
      date: "2026-03-11",
      summary: "Prepared commit boundary validation.",
      actions: ["Created one managed document"],
      followUp: ["Confirm unmanaged files stay uncommitted"],
    },
    context,
  );

  const result = commitPendingChanges(
    { message: "docs(acme-app/session): enforce managed commit scope" },
    context,
  );
  const committedFiles = spawnSync("git", ["show", "--name-only", "--pretty=format:", "HEAD"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  const status = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  assert.equal(result.committedPaths.length, 1);
  assert(result.committedPaths.every((entry) => entry.endsWith(".md")));
  assert.doesNotMatch(committedFiles.stdout, /unmanaged\.txt/);
  assert.match(status.stdout, /\?\? projects\/acme-app\/scratch\/unmanaged\.txt/);
});

test("commitPendingChanges rejects a commit message with the wrong scope", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  appendSessionNote(
    {
      project: "acme-app",
      topic: "scope mismatch",
      date: "2026-03-11",
      summary: "Prepared commit scope validation.",
      actions: ["Created a session note"],
      followUp: ["Reject provider scope"],
    },
    context,
  );

  assert.throws(
    () => commitPendingChanges({ message: "docs(acme-app/provider): invalid scope" }, context),
    /docs\(acme-app\/session\)/,
  );
});

test("commitPendingChanges rejects a commit message with the wrong project", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  appendSessionNote(
    {
      project: "acme-app",
      topic: "project mismatch",
      date: "2026-03-11",
      summary: "Prepared project-aware commit validation.",
      actions: ["Created a session note"],
      followUp: ["Reject another project slug"],
    },
    context,
  );

  assert.throws(
    () => commitPendingChanges({ message: "docs(beta-app/session): invalid project" }, context),
    /docs\(acme-app\/session\)/,
  );
});

test("commitPendingChanges accepts canonical scope for canonical docs", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  setupAcmeTaxonomy(context, ["resume-flow"]);

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy",
      registryScope: "resume-flow",
      date: "2026-03-11",
      summary: "Prepared canonical commit-scope coverage.",
      guidance: ["Create one canonical doc"],
      references: ["taxonomy-registry-baseline"],
    },
    context,
  );

  const result = commitPendingChanges(
    { message: "docs(acme-app/canonical): resume policy baseline" },
    context,
  );
  const log = spawnSync("git", ["log", "--oneline", "-1"], { cwd: rootDir, encoding: "utf8" });

  assert.equal(result.message, "docs(acme-app/canonical): resume policy baseline");
  assert.equal(result.committedPaths.length, 2);
  assert.match(log.stdout, /docs\(acme-app\/canonical\): resume policy baseline/);
});

test("commitPendingChanges accepts work-item scope for work-item docs", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "commit work item",
      date: "2026-03-11",
      summary: "Prepare work-item commit coverage.",
      outcome: "Work-item docs get a dedicated commit scope.",
      origin: {
        kind: "ad-hoc",
        note: "Commit scope coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Create one managed work item."],
      evidence: [],
    },
    context,
  );

  const result = commitPendingChanges(
    { message: "docs(acme-app/work-item): work-item planning baseline" },
    context,
  );
  const log = spawnSync("git", ["log", "--oneline", "-1"], { cwd: rootDir, encoding: "utf8" });

  assert.equal(result.message, "docs(acme-app/work-item): work-item planning baseline");
  assert.equal(result.committedPaths.length, 1);
  assert.match(log.stdout, /docs\(acme-app\/work-item\): work-item planning baseline/);
});

test("commitPendingChanges rejects pending managed changes from multiple projects", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  appendSessionNote(
    {
      project: "acme-app",
      topic: "first project commit batch",
      date: "2026-03-11",
      summary: "Prepared one project-specific change.",
      actions: ["Created an acme note"],
      followUp: ["Commit separately"],
    },
    context,
  );

  createDecision(
    {
      project: "beta-app",
      topic: "second project commit batch",
      date: "2026-03-11",
      context: "Prepared a second project change in the same worktree.",
      decision: "Reject multi-project managed commits by default.",
      consequences: ["Commit each project independently"],
    },
    context,
  );

  assert.throws(
    () => commitPendingChanges({ message: "docs(acme-app/mixed): invalid multi-project batch" }, context),
    /multiple projects|one project at a time|special-case path/,
  );
});

test("readColdStart returns a bounded project snapshot with fixed source ordering", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  setupAcmeTaxonomy(context, ["api", "delivery", "resume-flow", "zzz-extra"]);

  createRunbook(
    {
      project: "acme-app",
      topic: "architecture overview",
      date: "2026-03-11",
      purpose: "Describe the architecture surface.",
      procedure: ["Read the architecture summary"],
      verification: ["Confirm the summary is current"],
    },
    context,
  );
  createRunbook(
    {
      project: "acme-app",
      topic: "deployment flow",
      date: "2026-03-11",
      purpose: "Describe deployment flow.",
      procedure: ["Read the deployment steps"],
      verification: ["Confirm the steps work"],
    },
    context,
  );
  createRunbook(
    {
      project: "acme-app",
      topic: "ignored extra runbook",
      date: "2026-03-11",
      purpose: "Should fall outside the cold-start cap.",
      procedure: ["Ignore this one"],
      verification: ["Confirm the limit"],
    },
    context,
  );

  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "api policy",
      registryScope: "api",
      date: "2026-03-11",
      summary: "API policy.",
      guidance: ["Keep contracts stable"],
      references: ["runbook: architecture-overview"],
    },
    context,
  );
  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "deploy policy",
      registryScope: "delivery",
      date: "2026-03-11",
      summary: "Delivery policy.",
      guidance: ["Keep releases predictable"],
      references: ["runbook: deployment-flow"],
    },
    context,
  );
  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy",
      registryScope: "resume-flow",
      date: "2026-03-11",
      summary: "Resume policy.",
      guidance: ["Prefer resumable flows"],
      references: ["decision: resume-policy"],
    },
    context,
  );
  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "extra policy",
      registryScope: "zzz-extra",
      date: "2026-03-11",
      summary: "Should fall outside the cold-start cap.",
      guidance: ["Ignore this one"],
      references: ["decision: older-policy"],
    },
    context,
  );

  createDecision(
    {
      project: "acme-app",
      topic: "older policy",
      date: "2026-03-10",
      context: "Need older coverage.",
      decision: "Keep the older decision available.",
      consequences: ["Older context remains readable"],
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "resume policy",
      date: "2026-03-11",
      context: "Need mid-range coverage.",
      decision: "Keep resume behavior explicit.",
      consequences: ["Resume policy stays current"],
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "cache policy",
      date: "2026-03-12",
      context: "Need newer coverage.",
      decision: "Keep caches bounded.",
      consequences: ["Current decision stays visible"],
      status: "draft",
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "ignored extra decision",
      date: "2026-03-13",
      context: "Should not appear because of the hard cap.",
      decision: "This decision exceeds the cold-start limit.",
      consequences: ["Ignored for cold start"],
      status: "superseded",
    },
    context,
  );

  const result = readColdStart({ project: "acme-app" }, context);

  assert.equal(result.entrypoint, "cold-start");
  assert.equal(result.documents.length, 8);
  assert.deepEqual(
    result.stages.map((stage) => [stage.name, stage.relativePaths.length]),
    [
      ["runbook-bootstrap", 2],
      ["canonical-current-truth", 3],
      ["decision-recent", 3],
    ],
  );
  assert.deepEqual(
    result.documents.map((document) => document.metadata.topic),
    [
      "architecture-overview",
      "deployment-flow",
      "api-policy",
      "deploy-policy",
      "resume-policy",
      "cache-policy",
      "resume-policy",
      "older-policy",
    ],
  );
  assert(
    result.notes.includes(
      "Cold start still omits work-item sources; use planning-backlog reads for bounded planning context.",
    ),
  );
});

test("readTopicEntry prefers exact canonical and exact-topic supporting documents", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  setupAcmeTaxonomy(context, ["resume-flow", "fallback-scope"]);

  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy",
      registryScope: "resume-flow",
      date: "2026-03-11",
      summary: "Canonical resume guidance.",
      guidance: ["Prefer resumable jobs"],
      references: ["decision: resume-architecture"],
    },
    context,
  );
  createRunbook(
    {
      project: "acme-app",
      topic: "resume policy",
      date: "2026-03-11",
      purpose: "Explain the resume process.",
      procedure: ["Review the process"],
      verification: ["Check the process"],
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "resume policy",
      date: "2026-03-12",
      context: "Need current topic context.",
      decision: "Keep resume policy explicit.",
      consequences: ["Agents can read one bounded topic packet"],
    },
    context,
  );
  appendSessionNote(
    {
      project: "acme-app",
      topic: "resume policy",
      date: "2026-03-13",
      summary: "Executed the resume flow update.",
      actions: ["Updated the resume handler"],
      followUp: ["Add more verification"],
    },
    context,
  );
  recordVerificationResult(
    {
      project: "acme-app",
      topic: "resume policy",
      date: "2026-03-13",
      scope: "Resume policy",
      steps: ["Run resume scenario"],
      result: "Pass",
    },
    context,
  );
  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy fallback",
      registryScope: "fallback-scope",
      date: "2026-03-11",
      summary: "Should not be used because exact matches exist.",
      guidance: ["Ignore fallback matches"],
      references: [],
    },
    context,
  );

  const result = readTopicEntry({ project: "acme-app", topic: "resume policy" }, context);

  assert.equal(result.entrypoint, "topic-entry");
  assert.equal(result.topic, "resume-policy");
  assert.equal(result.documents.length, 5);
  assert.deepEqual(
    result.stages.map((stage) => stage.name),
    [
      "canonical-exact",
      "runbook-exact",
      "provider-exact",
      "decision-exact",
      "session-exact",
      "verification-exact",
    ],
  );
  assert.deepEqual(
    result.documents.map((document) => document.metadata.topic),
    [
      "resume-policy",
      "resume-policy",
      "resume-policy",
      "resume-policy",
      "resume-policy",
    ],
  );
  assert.equal(result.stages.some((stage) => stage.name === "canonical-fallback"), false);
});

test("readTopicEntry falls back to bounded contains matches when exact matches are absent", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  setupAcmeTaxonomy(context, ["resume-flow"]);

  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy fallback",
      registryScope: "resume-flow",
      date: "2026-03-11",
      summary: "Fallback canonical guidance.",
      guidance: ["Use bounded fallback"],
      references: [],
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "resume policy rollout",
      date: "2026-03-12",
      context: "Need a fallback decision.",
      decision: "Use filename contains fallback.",
      consequences: ["Topic reads stay bounded"],
    },
    context,
  );

  const result = readTopicEntry({ project: "acme-app", topic: "resume policy" }, context);

  assert.equal(result.documents.length, 2);
  assert(result.notes.some((note) => note.includes("No exact topic matches were found")));
  assert.deepEqual(
    result.stages
      .filter((stage) => stage.relativePaths.length > 0)
      .map((stage) => stage.name),
    ["canonical-fallback", "decision-fallback"],
  );
});

test("readTopicEntry explains when exact-topic work items exist but remain outside the topic-entry surface", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  setupAcmeTaxonomy(context, ["resume-flow"]);

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "resume policy",
      date: "2026-03-12",
      summary: "Implement the exact-topic work slice.",
      outcome: "Planning reads expose the work item.",
      origin: {
        kind: "ad-hoc",
        note: "Topic-entry exclusion coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Run the bounded read assertions."],
      evidence: [],
    },
    context,
  );

  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy fallback",
      registryScope: "resume-flow",
      date: "2026-03-11",
      summary: "Fallback canonical guidance.",
      guidance: ["Use bounded fallback"],
      references: [],
    },
    context,
  );

  const result = readTopicEntry({ project: "acme-app", topic: "resume policy" }, context);

  assert.equal(result.documents.length, 1);
  assert(result.notes.some((note) => note.includes("No exact topic matches were found")));
  assert(
    result.notes.some((note) =>
      note.includes("topic-entry intentionally excludes work-item documents; use planning-topic-entry"),
    ),
  );
}
);

test("readRationaleEntry follows canonical references before generic fallback", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  setupAcmeTaxonomy(context, ["resume-flow"]);

  upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy",
      registryScope: "resume-flow",
      date: "2026-03-11",
      summary: "Canonical resume rationale.",
      guidance: ["Keep authority bounded"],
      references: ["decision: resume-architecture", "runbook: resume-ops"],
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "resume-architecture",
      date: "2026-03-12",
      context: "Need the governing architecture decision.",
      decision: "Use explicit resume boundaries.",
      consequences: ["Current rationale stays explicit"],
      status: "superseded",
    },
    context,
  );
  createRunbook(
    {
      project: "acme-app",
      topic: "resume-ops",
      date: "2026-03-11",
      purpose: "Explain resume operations.",
      procedure: ["Read the operational steps"],
      verification: ["Run the checks"],
    },
    context,
  );

  const result = readRationaleEntry({ project: "acme-app", topic: "resume policy" }, context);

  assert.equal(result.entrypoint, "rationale-entry");
  assert.equal(result.documents.length, 3);
  assert.deepEqual(
    result.stages
      .filter((stage) => stage.relativePaths.length > 0)
      .map((stage) => stage.name),
    ["canonical-exact", "decision-reference", "runbook-reference"],
  );
  assert.deepEqual(
    result.documents.map((document) => document.metadata.topic),
    ["resume-policy", "resume-architecture", "resume-ops"],
  );
});
