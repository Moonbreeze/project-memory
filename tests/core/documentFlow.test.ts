import fs from "node:fs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  appendSessionNote,
  archiveDocument,
  commitPendingChanges,
  createDecision,
  createRunbook,
  listDocuments,
  readDocument,
  readColdStart,
  readRationaleEntry,
  readTopicEntry,
  recordVerificationResult,
  resolveArchiveRelativePath,
  resolveDocumentRelativePath,
  searchDocuments,
  upsertCanonicalDoc,
} from "../../src/core/index.ts";
import { createTestRepositoryContext, setupTestRepo } from "../fixtures/setupTestRepo.ts";

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
  assert.equal(listed.documents.length, 1);
  assert.equal(listed.documents[0]?.metadata.registry_scope, "resume-flow");
  assert.match(listed.documents[0]?.body ?? "", /Canonical guidance for the resume flow scope/);

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
  assert.equal(result.committedPaths.length, 1);
  assert.match(log.stdout, /docs\(acme-app\/canonical\): resume policy baseline/);
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
  assert(result.notes.includes("Work-item sources are intentionally omitted until work-item support exists."));
});

test("readTopicEntry prefers exact canonical and exact-topic supporting documents", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

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

test("readRationaleEntry follows canonical references before generic fallback", () => {
  const rootDir = setupTestRepo();
  const context = createTestRepositoryContext(rootDir);

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
