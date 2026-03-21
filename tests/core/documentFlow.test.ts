import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  pushPendingChanges,
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
  writeRawInvalidDoneWorkItem,
} from "../fixtures/setupTestRepo.ts";

const setupAcmeTaxonomy = (
  context: ReturnType<typeof createTestRepositoryContext>,
  scopes: string[],
): void => {
  setupTestProjectTaxonomy(context, "acme-app", scopes);
};

const createSessionNoteEvidence = (
  context: ReturnType<typeof createTestRepositoryContext>,
  project: string,
  topic: string,
  date: string,
) => {
  appendSessionNote(
    {
      project,
      topic,
      date,
      summary: `Captured ${topic} session progress.`,
      actions: [`Recorded ${topic} execution chronology.`],
      followUp: [`Keep ${topic} linked from the owning work-item.`],
    },
    context,
  );

  return {
    type: "session-note" as const,
    project,
    date,
    topic,
  };
};

/**
 * Creates a temporary git wrapper that records `push` invocations and delegates all other commands.
 */
const createPushLoggingGitWrapper = (): { binDir: string; logPath: string } => {
  const realGitPath = spawnSync("which", ["git"], { encoding: "utf8" }).stdout.trim();
  if (!realGitPath) {
    throw new Error("Failed to resolve git binary path");
  }

  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-git-wrapper-"));
  const logPath = path.join(binDir, "push.log");
  const wrapperPath = path.join(binDir, "git");

  fs.writeFileSync(
    wrapperPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [ "$#" -gt 0 ] && [ "$1" = "push" ]; then',
      `  printf '%s\\n' "$@" > '${logPath}'`,
      "  exit 0",
      "fi",
      `exec '${realGitPath}' "$@"`,
      "",
    ].join("\n"),
    "utf8",
  );
  fs.chmodSync(wrapperPath, 0o755);

  return { binDir, logPath };
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

test("createDecision persists stable-guidance review details for non-draft decisions", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  const decision = createDecision(
    {
      project: "acme-app",
      topic: "resume architecture",
      date: "2026-03-11",
      context: "Need durable architecture rationale.",
      decision: "Keep resumable execution stateful.",
      consequences: ["Bounded reads can follow one exact rationale source."],
      stableGuidanceReview: "update-required",
      stableGuidanceReviewNote: "Follow up by updating the resume-flow canonical doc.",
    },
    context,
  );

  const written = fs.readFileSync(decision.path, "utf8");
  assert.match(written, /## Stable Guidance Review/);
  assert.match(written, /Outcome: update-required/);
  assert.match(written, /Follow up by updating the resume-flow canonical doc\./);
});

test("createDecision rejects non-draft decisions without stable-guidance review", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  assert.throws(
    () =>
      createDecision(
        {
          project: "acme-app",
          topic: "resume architecture",
          date: "2026-03-11",
          context: "Need durable architecture rationale.",
          decision: "Keep resumable execution stateful.",
          consequences: ["Bounded reads can follow one exact rationale source."],
        },
        context,
      ),
    /Non-draft decisions require stableGuidanceReview/,
  );
});

test("createDecision rejects overwriting an existing decision path", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  createDecision(
    {
      project: "acme-app",
      topic: "resume architecture",
      date: "2026-03-11",
      context: "Need durable architecture rationale.",
      decision: "Keep resumable execution stateful.",
      consequences: ["Bounded reads can follow one exact rationale source."],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );

  assert.throws(
    () =>
      createDecision(
        {
          project: "acme-app",
          topic: "resume architecture",
          date: "2026-03-11",
          context: "Need a conflicting second write.",
          decision: "Try to overwrite the existing decision.",
          consequences: ["Decision writes should stay immutable."],
          stableGuidanceReview: "reviewed-no-change",
        },
        context,
      ),
    /Decision already exists .* immutable/,
  );
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

test("readDocument rejects invalid or cross-day recorded_at frontmatter", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  const invalidRelativePath = "projects/acme-app/runbooks/invalid-recorded-at.md";
  const mismatchedRelativePath = "projects/acme-app/runbooks/mismatched-recorded-at.md";

  fs.mkdirSync(`${rootDir}/projects/acme-app/runbooks`, { recursive: true });
  fs.writeFileSync(
    `${rootDir}/${invalidRelativePath}`,
    [
      "---",
      "date: 2026-03-11",
      "recorded_at: 2026-03-11T12:00:00Z",
      "project: acme-app",
      "topic: invalid-recorded-at",
      "source: manual",
      "status: active",
      "---",
      "",
      "# Runbook",
      "",
      "## Purpose",
      "",
      "Exercise timestamp validation.",
      "",
      "## Procedure",
      "",
      "- Attempt to read the document",
      "",
      "## Verification",
      "",
      "- Expect recorded_at validation to fail",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    `${rootDir}/${mismatchedRelativePath}`,
    [
      "---",
      "date: 2026-03-11",
      "recorded_at: 2026-03-12T00:00:00.000Z",
      "project: acme-app",
      "topic: mismatched-recorded-at",
      "source: manual",
      "status: active",
      "---",
      "",
      "# Runbook",
      "",
      "## Purpose",
      "",
      "Exercise cross-day timestamp validation.",
      "",
      "## Procedure",
      "",
      "- Attempt to read the document",
      "",
      "## Verification",
      "",
      "- Expect recorded_at date matching to fail",
    ].join("\n"),
    "utf8",
  );

  assert.throws(() => readDocument(context, invalidRelativePath), /recorded_at must use UTC ISO 8601 format/);
  assert.throws(() => readDocument(context, mismatchedRelativePath), /recorded_at must stay within the declared UTC date/);
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
      stableGuidanceReview: "reviewed-no-change",
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
      evidence: [createSessionNoteEvidence(context, "acme-app", "archive-via-wrong-helper-session", "2026-03-11")],
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

  assert.equal(listedWithoutBody.appliedQuery.sort, "date");
  assert.equal(listedWithoutBody.appliedQuery.order, "desc");
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
      topic: "untimed same day decision",
      date: "2026-03-12",
      context: "Need one same-day document without explicit recorded_at.",
      decision: "Keep deterministic fallback ordering for older documents.",
      consequences: ["Fallback stays usable without migration."],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );

  createDecision(
    {
      project: "acme-app",
      topic: "morning active decision",
      date: "2026-03-12",
      recordedAt: "2026-03-12T09:00:00.000Z",
      context: "Need one same-day morning item.",
      decision: "Order morning items before fallback-only entries.",
      consequences: ["Shows timeline ordering"],
      status: "active",
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );

  createDecision(
    {
      project: "acme-app",
      topic: "evening draft decision",
      date: "2026-03-12",
      recordedAt: "2026-03-12T18:00:00.000Z",
      context: "Need one same-day evening backlog item.",
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
      stableGuidanceReview: "reviewed-no-change",
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
    ["evening-draft-decision", "morning-active-decision", "untimed-same-day-decision"],
  );
});

test("listDocuments ideas preset returns newest draft decisions only", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  createDecision(
    {
      project: "acme-app",
      topic: "older draft idea",
      date: "2026-03-10",
      context: "Need one older idea.",
      decision: "Keep this draft visible in the inbox.",
      consequences: ["Shows draft ordering"],
      status: "draft",
    },
    context,
  );

  createDecision(
    {
      project: "acme-app",
      topic: "newer draft idea",
      date: "2026-03-12",
      context: "Need one newer idea.",
      decision: "Keep newer draft ideas first.",
      consequences: ["Shows newest-first ordering"],
      status: "draft",
    },
    context,
  );

  createDecision(
    {
      project: "acme-app",
      topic: "active decision",
      date: "2026-03-13",
      context: "Need one non-draft decision.",
      decision: "Do not mix accepted decisions into ideas.",
      consequences: ["Should be filtered out"],
      status: "active",
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );

  const listed = listDocuments({ project: "acme-app", preset: "ideas" }, context);

  assert.deepEqual(
    listed.appliedQuery,
    {
      project: "acme-app",
      type: "decision",
      status: "draft",
      preset: "ideas",
      sort: "date",
      order: "desc",
      limit: 100,
      includeBody: false,
    },
  );
  assert.deepEqual(
    listed.documents.map((document) => document.metadata.topic),
    ["newer-draft-idea", "older-draft-idea"],
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
      recordedAt: "2026-03-11T09:30:00.000Z",
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
  assert.equal(reread.metadata.recorded_at, "2026-03-11T09:30:00.000Z");
  assert.match(reread.body, /Updated canonical guidance/);
  assert.doesNotMatch(reread.body, /Store only finalized guidance here/);
});

test("listDocuments defaults to latest-first timeline ordering within the same day", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  createDecision(
    {
      project: "acme-app",
      topic: "older decision",
      date: "2026-03-10",
      context: "Need one older item.",
      decision: "Keep an older item in the set.",
      consequences: ["Provides an older baseline."],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "untimed same day decision",
      date: "2026-03-11",
      context: "Need one fallback-only item.",
      decision: "Keep old documents deterministic without explicit recorded_at.",
      consequences: ["Fallback ordering stays stable."],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "morning decision",
      date: "2026-03-11",
      recordedAt: "2026-03-11T09:00:00.000Z",
      context: "Need one timed morning item.",
      decision: "Prefer morning before fallback-only items.",
      consequences: ["Shows same-day ordering."],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );
  createDecision(
    {
      project: "acme-app",
      topic: "evening decision",
      date: "2026-03-11",
      recordedAt: "2026-03-11T18:00:00.000Z",
      context: "Need one timed evening item.",
      decision: "Prefer evening before morning.",
      consequences: ["Shows latest-first default ordering."],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );

  const listed = listDocuments({ project: "acme-app", type: "decision" }, context);

  assert.equal(listed.appliedQuery.sort, "date");
  assert.equal(listed.appliedQuery.order, "desc");
  assert.deepEqual(
    listed.documents.map((document) => document.metadata.topic),
    ["evening-decision", "morning-decision", "untimed-same-day-decision", "older-decision"],
  );
});

test("searchDocuments returns latest-first timeline results before applying limit", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  appendSessionNote(
    {
      project: "acme-app",
      topic: "alpha older",
      date: "2026-03-11",
      recordedAt: "2026-03-11T08:00:00.000Z",
      summary: "Timeline search coverage.",
      actions: ["Keep timeline search coverage available."],
      followUp: ["Expect older result to fall below the limit."],
    },
    context,
  );
  appendSessionNote(
    {
      project: "acme-app",
      topic: "bravo middle",
      date: "2026-03-11",
      recordedAt: "2026-03-11T12:00:00.000Z",
      summary: "Timeline search coverage.",
      actions: ["Keep middle timeline search coverage available."],
      followUp: ["Expect middle result to stay visible."],
    },
    context,
  );
  appendSessionNote(
    {
      project: "acme-app",
      topic: "aardvark newer",
      date: "2026-03-11",
      recordedAt: "2026-03-11T18:00:00.000Z",
      summary: "Timeline search coverage.",
      actions: ["Keep newest timeline search coverage available."],
      followUp: ["Expect newest result to stay first."],
    },
    context,
  );

  const results = searchDocuments(
    {
      project: "acme-app",
      text: "timeline search coverage",
      limit: 2,
    },
    context,
  );

  assert.deepEqual(
    results.map((document) => document.metadata.topic),
    ["aardvark-newer", "bravo-middle"],
  );
});

// Bug #3: invalid done work-items must not abort active search queries.
test("searchDocuments skips invalid done work-items and keeps valid matches", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  appendSessionNote(
    {
      project: "acme-app",
      topic: "search survives invalid work items",
      date: "2026-03-11",
      summary: "Timeline search coverage.",
      actions: ["Keep search results available despite unrelated invalid work-item records."],
      followUp: ["Verify invalid done work-items are skipped during search aggregation."],
    },
    context,
  );

  const invalidRelativePath = writeRawInvalidDoneWorkItem(
    rootDir,
    "acme-app",
    "broken-done-search-slice",
    "2026-03-11",
  );

  assert.throws(
    () => readDocument(context, invalidRelativePath),
    /Done work items must include at least one session-note locator in evidence/,
  );

  const results = searchDocuments(
    {
      project: "acme-app",
      text: "timeline search coverage",
    },
    context,
  );

  assert.deepEqual(
    results.map((document) => document.metadata.topic),
    ["search-survives-invalid-work-items"],
  );
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
          state: "active",
          migration: "create-topic",
          aliases: [],
          mappedScopes: [],
        },
        {
          scope: "resume-flow",
          topic: "resume-flow",
          state: "active",
          migration: "create-topic",
          aliases: [],
          mappedScopes: [],
        },
        {
          scope: "legacy-flow",
          topic: "legacy-flow",
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

test("upsertCanonicalDoc accepts alias-backed scopes and audit reports warning-level alias usage", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  bootstrapProject(
    {
      project: "acme-app",
      date: "2026-03-11",
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
          state: "active",
          migration: "create-topic",
          aliases: [],
          mappedScopes: [],
        },
        {
          scope: "resume-flow",
          topic: "resume-flow",
          state: "active",
          migration: "alias-add",
          aliases: ["resume-legacy"],
          mappedScopes: [],
        },
      ],
    },
    context,
  );

  const document = upsertCanonicalDoc(
    {
      project: "acme-app",
      topic: "resume policy",
      registryScope: "resume-legacy",
      date: "2026-03-11",
      summary: "Alias-backed resume policy.",
      guidance: ["Treat aliases as transitional compatibility names"],
      references: [],
    },
    context,
  );

  assert.equal(document.metadata.registry_scope, "resume-legacy");

  const result = auditTaxonomyConsistency({ project: "acme-app" }, context);

  assert.equal(result.passed, true);
  assert.deepEqual(result.issues.map((issue) => issue.code), ["alias-scope-usage"]);
  assert.equal(result.issues[0]?.severity, "warning");
  assert.match(result.issues[0]?.message ?? "", /resume-legacy/);
  assert.match(result.issues[0]?.message ?? "", /resume-flow/);
});

test("auditTaxonomyConsistency resolves alias-backed docs to their owner scope for duplicate and retired checks", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  bootstrapProject(
    {
      project: "acme-app",
      date: "2026-03-11",
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
          state: "active",
          migration: "create-topic",
          aliases: [],
          mappedScopes: [],
        },
        {
          scope: "resume-flow",
          topic: "resume-flow",
          state: "active",
          migration: "alias-add",
          aliases: ["resume-legacy"],
          mappedScopes: [],
        },
        {
          scope: "legacy-flow",
          topic: "legacy-flow",
          state: "retired",
          migration: "alias-add",
          aliases: ["legacy-archive"],
          mappedScopes: [],
        },
      ],
    },
    context,
  );
  writeRawCanonicalDoc(
    rootDir,
    "projects/acme-app/canonical-docs/resume-flow/resume-policy.md",
    "resume-flow",
    "resume-policy",
  );
  writeRawCanonicalDoc(
    rootDir,
    "projects/acme-app/canonical-docs/resume-legacy/resume-policy-shadow.md",
    "resume-legacy",
    "resume-policy-shadow",
  );
  writeRawCanonicalDoc(
    rootDir,
    "projects/acme-app/canonical-docs/legacy-archive/legacy-policy.md",
    "legacy-archive",
    "legacy-policy",
  );

  const result = auditTaxonomyConsistency({ project: "acme-app" }, context);

  assert.equal(result.passed, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["duplicate-authority", "retired-scope-usage", "alias-scope-usage", "alias-scope-usage"],
  );
  assert.equal(result.issues[2]?.severity, "warning");
  assert.equal(result.issues[3]?.severity, "warning");
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
  const sessionEvidence = createSessionNoteEvidence(
    context,
    "acme-app",
    "closeable-slice-session",
    "2026-03-11",
  );

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
      evidence: [sessionEvidence],
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

test("closeWorkItem rejects done when the work item lacks session-note evidence", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "missing-session-evidence",
      date: "2026-03-11",
      summary: "Try to close without linked chronology.",
      outcome: "Done should be rejected without a session note in evidence.",
      origin: {
        kind: "ad-hoc",
        note: "Close helper validation coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Attempt closure without session-note evidence."],
      evidence: [],
      workItemState: "in_progress",
    },
    context,
  );

  assert.throws(
    () =>
      closeWorkItem(
        {
          project: "acme-app",
          topic: "missing-session-evidence",
          date: "2026-03-11",
          state: "done",
        },
        context,
      ),
    /Done work items must include at least one session-note locator in evidence/,
  );
});

test("readPlanningBacklog uses timeline ordering within the same planning state", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "ready morning slice",
      date: "2026-03-11",
      recordedAt: "2026-03-11T09:00:00.000Z",
      summary: "Keep a same-day ready item from the morning.",
      outcome: "Planning backlog should place newer ready work later unless timeline ordering is applied.",
      origin: {
        kind: "ad-hoc",
        note: "Ready backlog ordering coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Read planning backlog and inspect ready ordering."],
      evidence: [],
    },
    context,
  );
  upsertWorkItem(
    {
      project: "acme-app",
      topic: "ready evening slice",
      date: "2026-03-11",
      recordedAt: "2026-03-11T18:00:00.000Z",
      summary: "Keep a same-day ready item from the evening.",
      outcome: "Planning backlog should prefer the evening item first.",
      origin: {
        kind: "ad-hoc",
        note: "Ready backlog ordering coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Read planning backlog and inspect ready ordering."],
      evidence: [],
    },
    context,
  );

  const result = readPlanningBacklog({ project: "acme-app" }, context);

  assert.deepEqual(
    result.documents.map((document) => document.metadata.topic),
    ["ready-evening-slice", "ready-morning-slice"],
  );
});

// Bug #1: invalid done work-items must not abort planning backlog reads.
test("readPlanningBacklog skips invalid done work-items and reports diagnostics", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  upsertWorkItem(
    {
      project: "acme-app",
      topic: "ready slice",
      date: "2026-03-11",
      summary: "Keep one valid ready item in the backlog.",
      outcome: "Planning backlog should still return this item even if another work-item is invalid.",
      origin: {
        kind: "ad-hoc",
        note: "Fail-soft planning backlog coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Read planning backlog and inspect invalid-document diagnostics."],
      evidence: [],
    },
    context,
  );

  const invalidRelativePath = writeRawInvalidDoneWorkItem(
    rootDir,
    "acme-app",
    "broken-done-slice",
    "2026-03-11",
  );

  assert.throws(
    () => readDocument(context, invalidRelativePath),
    /Done work items must include at least one session-note locator in evidence/,
  );

  const result = readPlanningBacklog({ project: "acme-app" }, context);

  assert.deepEqual(
    result.documents.map((document) => document.metadata.topic),
    ["ready-slice"],
  );
  assert.equal(result.invalidDocuments.length, 1);
  assert.equal(result.invalidDocuments[0]?.relativePath, invalidRelativePath);
  assert.equal(result.invalidDocuments[0]?.documentType, "work-item");
  assert.match(
    result.invalidDocuments[0]?.message ?? "",
    /Done work items must include at least one session-note locator in evidence/,
  );
  assert.match(result.notes.join("\n"), /Skipped 1 invalid work-item document during planning aggregation/);
});

// Bug #2: upsertWorkItem must repair invalid done work-items before strict stored validation would block the rewrite.
test("upsertWorkItem repairs invalid done work-items by adding evidence or changing state", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  const evidenceRepairPath = writeRawInvalidDoneWorkItem(
    rootDir,
    "acme-app",
    "repair-done-with-evidence",
    "2026-03-11",
    "2026-03-11T08:30:00.000Z",
  );
  const stateRepairPath = writeRawInvalidDoneWorkItem(
    rootDir,
    "acme-app",
    "repair-done-with-state-change",
    "2026-03-11",
    "2026-03-11T09:45:00.000Z",
  );
  const sessionEvidence = createSessionNoteEvidence(
    context,
    "acme-app",
    "repair-done-with-evidence-session",
    "2026-03-11",
  );

  assert.throws(
    () => readDocument(context, evidenceRepairPath),
    /Done work items must include at least one session-note locator in evidence/,
  );
  assert.throws(
    () => readDocument(context, stateRepairPath),
    /Done work items must include at least one session-note locator in evidence/,
  );

  const repairedDoneItem = upsertWorkItem(
    {
      project: "acme-app",
      topic: "repair-done-with-evidence",
      date: "2026-03-11",
      summary: "Repair the invalid done work-item by adding chronology evidence.",
      outcome: "The work-item becomes valid without losing its existing timeline key.",
      origin: {
        kind: "ad-hoc",
        note: "Bug #2 evidence repair coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Repair the invalid done work-item through upsertWorkItem."],
      evidence: [sessionEvidence],
      workItemState: "done",
    },
    context,
  );

  const repairedOpenItem = upsertWorkItem(
    {
      project: "acme-app",
      topic: "repair-done-with-state-change",
      date: "2026-03-11",
      summary: "Repair the invalid done work-item by moving it back to open.",
      outcome: "The work-item becomes valid without requiring done-only evidence.",
      origin: {
        kind: "ad-hoc",
        note: "Bug #2 state repair coverage.",
      },
      dependencies: [],
      context: [],
      verification: ["Repair the invalid done work-item by changing workItemState."],
      evidence: [],
      workItemState: "open",
    },
    context,
  );

  assert.equal(repairedDoneItem.metadata.recorded_at, "2026-03-11T08:30:00.000Z");
  assert.equal(repairedDoneItem.metadata.work_item_state, "done");
  assert.equal(readDocument(context, evidenceRepairPath).metadata.work_item_state, "done");

  assert.equal(repairedOpenItem.metadata.recorded_at, "2026-03-11T09:45:00.000Z");
  assert.equal(repairedOpenItem.metadata.work_item_state, "open");
  assert.equal(readDocument(context, stateRepairPath).metadata.work_item_state, "open");
});

test("archiveWorkItem archives terminal work items without moving them into the archive tree", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);
  const sessionEvidence = createSessionNoteEvidence(
    context,
    "acme-app",
    "archivable-slice-session",
    "2026-03-11",
  );

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
      evidence: [sessionEvidence],
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
      stableGuidanceReview: "reviewed-no-change",
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
      evidence: [createSessionNoteEvidence(context, "acme-app", "done-slice-session", "2026-03-11")],
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
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );

  const createWorkItem = (
    topic: string,
    date: string,
    overrides: Partial<Parameters<typeof upsertWorkItem>[0]> = {},
  ) => {
    const { evidence: overrideEvidence = [], ...restOverrides } = overrides;
    const evidence = [...overrideEvidence];

    if (
      overrides.workItemState === "done"
      && !evidence.some((locator) => locator.type === "session-note")
    ) {
      evidence.unshift(
        createSessionNoteEvidence(
          context,
          "acme-app",
          `${topic.replaceAll(" ", "-")}-session`,
          date,
        ),
      );
    }

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
        ...restOverrides,
        evidence,
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
    const { evidence: overrideEvidence = [], ...restOverrides } = overrides;
    const evidence = [...overrideEvidence];

    if (
      overrides.workItemState === "done"
      && !evidence.some((locator) => locator.type === "session-note")
    ) {
      evidence.unshift(
        createSessionNoteEvidence(
          context,
          project,
          `${topic.replaceAll(" ", "-")}-session`,
          date,
        ),
      );
    }

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
        ...restOverrides,
        evidence,
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

  const result = commitPendingChanges(
    { project: "acme-app", summary: "commit flow validation" },
    context,
  );
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
    { project: "acme-app", summary: "enforce managed commit scope" },
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

test("commitPendingChanges rejects a selected project with no pending managed changes", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  appendSessionNote(
    {
      project: "acme-app",
      topic: "missing selected project",
      date: "2026-03-11",
      summary: "Prepared project-specific commit validation.",
      actions: ["Created a session note"],
      followUp: ["Reject another project"],
    },
    context,
  );

  assert.throws(
    () => commitPendingChanges({ project: "beta-app", summary: "invalid selected project" }, context),
    /No approved document changes are available for project beta-app/,
  );
});

test("commitPendingChanges commits only the selected project when multiple projects have pending managed changes", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  appendSessionNote(
    {
      project: "acme-app",
      topic: "first selected project",
      date: "2026-03-11",
      summary: "Prepared project-aware commit validation.",
      actions: ["Created a session note"],
      followUp: ["Commit only acme changes"],
    },
    context,
  );

  createDecision(
    {
      project: "beta-app",
      topic: "second selected project",
      date: "2026-03-11",
      context: "Prepared a second project change in the same worktree.",
      decision: "Project-scoped commits should ignore unrelated pending changes.",
      consequences: ["Only selected project paths should be committed"],
      stableGuidanceReview: "reviewed-no-change",
    },
    context,
  );

  const result = commitPendingChanges(
    { project: "acme-app", summary: "selected project commit" },
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

  assert.equal(result.message, "docs(acme-app/session): selected project commit");
  assert.deepEqual(result.committedPaths, ["projects/acme-app/session-log/2026/03/2026-03-11-first-selected-project.md"]);
  assert.match(committedFiles.stdout, /projects\/acme-app\/session-log\//);
  assert.doesNotMatch(committedFiles.stdout, /projects\/beta-app\//);
  assert.match(status.stdout, /projects\/beta-app\/decisions\//);
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
    { project: "acme-app", summary: "resume policy baseline" },
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
    { project: "acme-app", summary: "work-item planning baseline" },
    context,
  );
  const log = spawnSync("git", ["log", "--oneline", "-1"], { cwd: rootDir, encoding: "utf8" });

  assert.equal(result.message, "docs(acme-app/work-item): work-item planning baseline");
  assert.equal(result.committedPaths.length, 1);
  assert.match(log.stdout, /docs\(acme-app\/work-item\): work-item planning baseline/);
});

test("pushPendingChanges pushes the current branch to origin by default", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  appendSessionNote(
    {
      project: "acme-app",
      topic: "push flow",
      date: "2026-03-11",
      summary: "Prepared push flow validation.",
      actions: ["Created session note"],
      followUp: ["Push it to origin"],
    },
    context,
  );

  commitPendingChanges({ project: "acme-app", summary: "push flow validation" }, context);

  spawnSync("git", ["remote", "add", "origin", "https://example.invalid/project-memory.git"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  const localBranch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: rootDir,
    encoding: "utf8",
  }).stdout.trim();
  const { binDir, logPath } = createPushLoggingGitWrapper();
  const previousPath = process.env.PATH;

  process.env.PATH = `${binDir}:${previousPath ?? ""}`;

  try {
    const result = pushPendingChanges({}, context);
    const pushLog = fs.readFileSync(logPath, "utf8");

    assert.equal(result.remote, "origin");
    assert.equal(result.branch, localBranch);
    assert.equal(result.currentBranch, localBranch);
    assert.match(pushLog, /^push$/m);
    assert.match(pushLog, /^origin$/m);
    assert.match(pushLog, new RegExp(`^${localBranch}$`, "m"));
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
  }
});

test("pushPendingChanges rejects missing origin remote", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  appendSessionNote(
    {
      project: "acme-app",
      topic: "push without remote",
      date: "2026-03-11",
      summary: "Prepared missing remote validation.",
      actions: ["Created session note"],
      followUp: ["Reject missing origin"],
    },
    context,
  );

  commitPendingChanges({ project: "acme-app", summary: "missing remote validation" }, context);

  assert.throws(
    () => pushPendingChanges({}, context),
    /Remote origin is not configured/,
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
      stableGuidanceReview: "reviewed-no-change",
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
      stableGuidanceReview: "reviewed-no-change",
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
      stableGuidanceReview: "reviewed-no-change",
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
      stableGuidanceReview: "reviewed-no-change",
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
      stableGuidanceReview: "reviewed-no-change",
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
      stableGuidanceReview: "reviewed-no-change",
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
