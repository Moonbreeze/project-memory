import fs from "node:fs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  appendSessionNote,
  archiveDocument,
  commitPendingChanges,
  createDecision,
  listDocuments,
  recordVerificationResult,
  resolveArchiveRelativePath,
  resolveDocumentRelativePath,
  searchDocuments,
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

  const result = commitPendingChanges({ message: "docs(session): commit flow validation" }, context);
  const log = spawnSync("git", ["log", "--oneline", "-1"], { cwd: rootDir, encoding: "utf8" });

  assert.equal(result.message, "docs(session): commit flow validation");
  assert.equal(result.committedPaths.length, 1);
  assert.match(log.stdout, /docs\(session\): commit flow validation/);
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

  const result = commitPendingChanges({ message: "docs(session): enforce managed commit scope" }, context);
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
    () => commitPendingChanges({ message: "docs(provider): invalid scope" }, context),
    /docs\(session\)/,
  );
});
