import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../../src/cli/dispatch.ts";
import { createTestRepositoryContext, setupTestProjectTaxonomy, setupTestRepo } from "../fixtures/setupTestRepo.ts";

type CapturedIo = {
  stdout: string[];
  stderr: string[];
};

const rawDumpText = Array.from({ length: 18 }, (_value, index) => `$ command ${index + 1}`).join("\n");

/**
 * Copies the minimal runnable tool repository into a temporary directory.
 */
const createIsolatedToolRepo = (): string => {
  const testFilePath = fileURLToPath(import.meta.url);
  const sourceRepoRoot = path.resolve(path.dirname(testFilePath), "../..");
  const isolatedRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-tool-"));

  for (const directoryName of ["src", "scripts", "templates"]) {
    fs.cpSync(
      path.join(sourceRepoRoot, directoryName),
      path.join(isolatedRepoRoot, directoryName),
      { recursive: true },
    );
  }

  for (const fileName of ["package.json", "package-lock.json", "tsconfig.json"]) {
    fs.copyFileSync(path.join(sourceRepoRoot, fileName), path.join(isolatedRepoRoot, fileName));
  }

  fs.symlinkSync(
    path.join(sourceRepoRoot, "node_modules"),
    path.join(isolatedRepoRoot, "node_modules"),
    "dir",
  );

  return isolatedRepoRoot;
};

/**
 * Returns `true` when a value is a plain object.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * Creates in-memory stdout and stderr collectors for CLI tests.
 */
const createCapturedIo = (): {
  io: {
    stdout: { write: (chunk: string) => void };
    stderr: { write: (chunk: string) => void };
    context?: { toolRootDir?: string };
  };
  captured: CapturedIo;
} => {
  const captured: CapturedIo = {
    stdout: [],
    stderr: [],
  };

  return {
    io: {
      stdout: {
        write: (chunk: string) => {
          captured.stdout.push(chunk);
        },
      },
      stderr: {
        write: (chunk: string) => {
          captured.stderr.push(chunk);
        },
      },
    },
    captured,
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

/**
 * Parses the last JSON payload written by the CLI.
 */
const parseLastJson = (chunks: string[]): unknown => {
  const payload = chunks.join("").trim();
  return JSON.parse(payload);
};

test("CLI install creates an external memory repository and bootstraps one project", async () => {
  const memoryRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-install-"));
  const targetMemoryRootDir = path.join(memoryRootDir, "memory-store");
  const toolRootDir = createIsolatedToolRepo();
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-home-"));
  const codexConfigPath = path.join(homeDir, ".codex", "config.toml");
  const claudeConfigPath = path.join(homeDir, ".claude.json");
  const { io, captured } = createCapturedIo();
  const previousHome = process.env.HOME;
  io.context = { toolRootDir };
  process.env.HOME = homeDir;
  try {
    await runCli(
      [
        "install",
        "--memory-root",
        targetMemoryRootDir,
        "--project",
        "Acme App",
        "--git-init",
        "true",
      ],
      io,
    );

    const result = parseLastJson(captured.stdout);
    if (
      !isRecord(result) ||
      typeof result.memoryRootDir !== "string" ||
      typeof result.toolRootDir !== "string" ||
      typeof result.gitInitialized !== "boolean" ||
      !Array.isArray(result.created) ||
      typeof result.project !== "string" ||
      typeof result.envFilePath !== "string" ||
      typeof result.codexConfigPath !== "string" ||
      typeof result.codexGlobalConfigPath !== "string" ||
      typeof result.codexGlobalConfigUpdated !== "boolean" ||
      typeof result.claudeConfigPath !== "string" ||
      typeof result.claudeGlobalConfigPath !== "string" ||
      typeof result.claudeGlobalConfigUpdated !== "boolean" ||
      !Array.isArray(result.nextSteps)
    ) {
      throw new Error("Unexpected install result shape");
    }

    assert.equal(result.memoryRootDir, path.resolve(targetMemoryRootDir));
    assert.equal(result.toolRootDir, path.resolve(toolRootDir));
    assert.equal(result.project, "acme-app");
    assert.equal(result.gitInitialized, true);
    assert(fs.existsSync(path.join(targetMemoryRootDir, ".git")));
    assert(fs.existsSync(path.join(targetMemoryRootDir, "projects", "acme-app", "runbooks")));
    assert(fs.existsSync(path.join(targetMemoryRootDir, "archives", "acme-app", "verification")));
    assert.equal(result.envFilePath, path.join(toolRootDir, ".project-memory.env"));
    assert.equal(result.codexConfigPath, path.join(toolRootDir, ".project-memory.codex.toml"));
    assert.equal(result.codexGlobalConfigPath, codexConfigPath);
    assert.equal(result.codexGlobalConfigUpdated, true);
    assert.equal(result.claudeConfigPath, path.join(toolRootDir, ".project-memory.claude.mcp.json"));
    assert.equal(result.claudeGlobalConfigPath, claudeConfigPath);
    assert.equal(result.claudeGlobalConfigUpdated, true);
    assert.match(fs.readFileSync(result.envFilePath, "utf8"), /PROJECT_MEMORY_ROOT=/);
    assert.match(fs.readFileSync(result.codexConfigPath, "utf8"), /\[mcp_servers\.project-memory\]/);
    assert.match(fs.readFileSync(result.codexConfigPath, "utf8"), /command = "node"/);
    assert.match(fs.readFileSync(result.codexConfigPath, "utf8"), /--experimental-strip-types/);
    assert.match(fs.readFileSync(result.codexConfigPath, "utf8"), /src\/mcp\/server\.ts/);
    assert.match(fs.readFileSync(result.codexConfigPath, "utf8"), /cwd = "/);
    assert.match(fs.readFileSync(result.codexGlobalConfigPath, "utf8"), /\[mcp_servers\.project-memory\]/);
    assert.match(fs.readFileSync(result.codexGlobalConfigPath, "utf8"), /cwd = "/);
    assert.match(fs.readFileSync(result.claudeGlobalConfigPath, "utf8"), /"project-memory"/);

    const mcpConfig = JSON.parse(fs.readFileSync(result.claudeConfigPath, "utf8"));
    if (!isRecord(mcpConfig) || !isRecord(mcpConfig.mcpServers)) {
      throw new Error("Unexpected MCP config result shape");
    }

    assert(
      result.nextSteps.includes(
        `grep -n "mcp_servers.project-memory" '${result.codexGlobalConfigPath}'`,
      ),
    );
    assert(
      result.nextSteps.includes(`grep -n '"project-memory"' '${result.claudeGlobalConfigPath}'`),
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test("CLI install updates only the project-memory section in global Codex config", async () => {
  const memoryRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-install-"));
  const targetMemoryRootDir = path.join(memoryRootDir, "memory-store");
  const toolRootDir = createIsolatedToolRepo();
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-home-"));
  const codexDir = path.join(homeDir, ".codex");
  const codexConfigPath = path.join(codexDir, "config.toml");
  const { io } = createCapturedIo();
  const previousHome = process.env.HOME;

  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(
    codexConfigPath,
    [
      'model = "gpt-5.4"',
      "",
      "[mcp_servers.ai-inst]",
      'command = "npx"',
      'args = ["tsx", "/tmp/ai-inst.ts"]',
      "",
      "[mcp_servers.project-memory]",
      'command = "node"',
      'args = ["--experimental-strip-types", "/tmp/old-server.ts"]',
      "",
      "[mcp_servers.project-memory.env]",
      'PROJECT_MEMORY_ROOT = "/tmp/old-memory"',
      "",
    ].join("\n"),
    "utf8",
  );

  io.context = { toolRootDir };
  process.env.HOME = homeDir;
  try {
    await runCli(["install", "--memory-root", targetMemoryRootDir], io);

    const updatedConfig = fs.readFileSync(codexConfigPath, "utf8");
    const projectMemorySectionMatches = updatedConfig.match(/\[mcp_servers\.project-memory\]/g);
    assert.equal(projectMemorySectionMatches?.length, 1);
    assert.match(updatedConfig, /\[mcp_servers\.ai-inst\]/);
    assert.match(updatedConfig, /\/memory-store/);
    assert.match(updatedConfig, /cwd = "/);
    assert.doesNotMatch(updatedConfig, /\/tmp\/old-memory/);
    assert.doesNotMatch(updatedConfig, /\/tmp\/old-server\.ts/);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test("CLI install updates only the project-memory section in global Claude config", async () => {
  const memoryRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-install-"));
  const targetMemoryRootDir = path.join(memoryRootDir, "memory-store");
  const toolRootDir = createIsolatedToolRepo();
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-home-"));
  const claudeConfigPath = path.join(homeDir, ".claude.json");
  const { io } = createCapturedIo();
  const previousHome = process.env.HOME;

  fs.writeFileSync(
    claudeConfigPath,
    `${JSON.stringify(
      {
        numStartups: 3,
        mcpServers: {
          "ai-inst": {
            type: "stdio",
            command: "npx",
            args: ["tsx", "/tmp/ai-inst.ts"],
            env: {},
          },
          "project-memory": {
            type: "stdio",
            command: "node",
            args: ["/tmp/old-server.ts"],
            env: {
              PROJECT_MEMORY_ROOT: "/tmp/old-memory",
            },
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  io.context = { toolRootDir };
  process.env.HOME = homeDir;
  try {
    await runCli(["install", "--memory-root", targetMemoryRootDir], io);

    const updatedConfig = JSON.parse(fs.readFileSync(claudeConfigPath, "utf8"));
    if (!isRecord(updatedConfig) || !isRecord(updatedConfig.mcpServers)) {
      throw new Error("Unexpected global Claude config shape");
    }

    const projectMemoryConfig = updatedConfig.mcpServers["project-memory"];
    const aiInstConfig = updatedConfig.mcpServers["ai-inst"];
    if (!isRecord(projectMemoryConfig) || !isRecord(aiInstConfig)) {
      throw new Error("Unexpected global Claude MCP server shape");
    }

    assert.equal(updatedConfig.numStartups, 3);
    assert.equal(projectMemoryConfig.command, "node");
    assert.deepEqual(projectMemoryConfig.args, [
      "--experimental-strip-types",
      path.join(toolRootDir, "src", "mcp", "server.ts"),
    ]);
    assert.deepEqual(projectMemoryConfig.env, {
      PROJECT_MEMORY_ROOT: path.resolve(targetMemoryRootDir),
    });
    assert.equal(aiInstConfig.command, "npx");
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test("CLI install rejects memory roots that overlap the tool repository", async () => {
  const toolRootDir = createIsolatedToolRepo();
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-home-"));
  const invalidMemoryRoots = [
    toolRootDir,
    path.join(toolRootDir, "memory-store"),
    path.dirname(toolRootDir),
  ];
  const previousHome = process.env.HOME;

  process.env.HOME = homeDir;
  try {
    for (const invalidMemoryRoot of invalidMemoryRoots) {
      const { io } = createCapturedIo();
      io.context = { toolRootDir };

      await assert.rejects(
        () => runCli(["install", "--memory-root", invalidMemoryRoot], io),
        /external repository that does not overlap the tool repository/,
      );
    }
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});

test("CLI requires PROJECT_MEMORY_ROOT for document commands", async () => {
  delete process.env.PROJECT_MEMORY_ROOT;

  await assert.rejects(
    () => runCli(["list-documents", "--project", "acme-app"]),
    /PROJECT_MEMORY_ROOT is required/,
  );
});

test("CLI bootstrap creates the expected project directory structure", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const { io, captured } = createCapturedIo();
  await runCli(["bootstrap", "--project", "Acme App"], io);

  const result = parseLastJson(captured.stdout);
  if (
    !isRecord(result)
    || typeof result.project !== "string"
    || !Array.isArray(result.created)
    || typeof result.registryRelativePath !== "string"
  ) {
    throw new Error("Unexpected bootstrap result shape");
  }

  assert.equal(result.project, "acme-app");
  assert(result.created.includes("projects/acme-app/provider-notes"));
  assert(fs.existsSync(path.join(rootDir, "projects/acme-app/provider-notes")));
  assert(fs.existsSync(path.join(rootDir, result.registryRelativePath)));

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI can upsert and audit the taxonomy registry", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;
  try {
    await runCli(["bootstrap", "--project", "Acme App"]);

    const upsertCapture = createCapturedIo();
    await runCli(
      [
        "upsert-taxonomy-registry",
        "--project",
        "acme-app",
        "--date",
        "2026-03-11",
        "--entries",
        JSON.stringify([
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
        ]),
      ],
      upsertCapture.io,
    );

    const auditCapture = createCapturedIo();
    await runCli(["audit-taxonomy", "--project", "acme-app"], auditCapture.io);
    const auditResult = parseLastJson(auditCapture.captured.stdout);
    if (!isRecord(auditResult) || auditResult.passed !== true || auditResult.registryEntryCount !== 2) {
      throw new Error("Unexpected audit-taxonomy result shape");
    }
  } finally {
    delete process.env.PROJECT_MEMORY_ROOT;
  }
});

test("CLI upsert-taxonomy-registry reports allowed migration values for invalid entries", async () => {
  await assert.rejects(
    () => runCli(
      [
        "upsert-taxonomy-registry",
        "--project",
        "acme-app",
        "--entries",
        JSON.stringify([
          {
            scope: "resume-flow",
            topic: "resume-flow",
            state: "active",
            migration: "bad-marker",
            aliases: [],
            mappedScopes: [],
          },
        ]),
      ],
    ),
    /Invalid --entries JSON payload: unsupported migration bad-marker\. Allowed values: .*create-topic.*retire-topic/,
  );
});

test("CLI can append, list, read, and archive documents", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const appendCapture = createCapturedIo();
  await runCli(
    [
      "append-session-note",
      "--project",
      "acme-app",
      "--topic",
      "cli flow",
      "--summary",
      "Validated CLI document flow.",
      "--actions",
      "created note|checked parser",
      "--follow-up",
      "archive note",
      "--date",
      "2026-03-11",
    ],
    appendCapture.io,
  );

  const appended = parseLastJson(appendCapture.captured.stdout);
  if (!isRecord(appended) || typeof appended.relativePath !== "string") {
    throw new Error("Unexpected append-session-note result shape");
  }

  assert.match(appended.relativePath, /projects\/acme-app\/session-log\/2026\/03\/2026-03-11-cli-flow\.md/);

  const listCapture = createCapturedIo();
  await runCli(["list-documents", "--project", "acme-app"], listCapture.io);
  const listed = parseLastJson(listCapture.captured.stdout);
  if (!isRecord(listed) || !Array.isArray(listed.documents) || !isRecord(listed.appliedQuery)) {
    throw new Error("Unexpected list-documents result shape");
  }

  assert.equal(listed.documents.length, 1);
  assert.equal("body" in (listed.documents[0] ?? {}), false);
  assert.equal(listed.appliedQuery.includeBody, false);

  const readCapture = createCapturedIo();
  await runCli(["read-document", "--path", appended.relativePath], readCapture.io);
  const readResult = parseLastJson(readCapture.captured.stdout);
  if (!isRecord(readResult) || typeof readResult.body !== "string") {
    throw new Error("Unexpected read-document result shape");
  }

  assert.match(readResult.body, /Validated CLI document flow/);

  const archiveCapture = createCapturedIo();
  await runCli(["archive-document", "--path", appended.relativePath], archiveCapture.io);
  const archived = parseLastJson(archiveCapture.captured.stdout);
  if (!isRecord(archived) || typeof archived.relativePath !== "string") {
    throw new Error("Unexpected archive-document result shape");
  }

  assert.match(archived.relativePath, /^archives\/acme-app\/session-log\//);
  assert(fs.existsSync(path.join(rootDir, archived.relativePath)));

  const searchCapture = createCapturedIo();
  await runCli(["search-documents", "--project", "acme-app", "--text", "Validated"], searchCapture.io);
  const searchResult = parseLastJson(searchCapture.captured.stdout);
  if (!Array.isArray(searchResult)) {
    throw new Error("Unexpected search-documents result shape");
  }

  assert.equal(searchResult.length, 0);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI archive-document archives canonical docs in place", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;
  setupTestProjectTaxonomy(createTestRepositoryContext(rootDir), "acme-app", ["resume-flow"]);

  const createCapture = createCapturedIo();
  await runCli(
    [
      "upsert-canonical-doc",
      "--project",
      "acme-app",
      "--topic",
      "resume policy",
      "--registry-scope",
      "resume-flow",
      "--summary",
      "Keep resume behavior explicit.",
      "--guidance",
      "Use bounded reads",
      "--references",
      "decision: resume-architecture",
      "--date",
      "2026-03-11",
    ],
    createCapture.io,
  );

  const created = parseLastJson(createCapture.captured.stdout);
  if (!isRecord(created) || typeof created.relativePath !== "string") {
    throw new Error("Unexpected upsert-canonical-doc result shape");
  }

  const archiveCapture = createCapturedIo();
  await runCli(["archive-document", "--path", created.relativePath], archiveCapture.io);
  const archived = parseLastJson(archiveCapture.captured.stdout);
  if (!isRecord(archived) || !isRecord(archived.metadata)) {
    throw new Error("Unexpected archive-document result shape for canonical doc");
  }

  assert.equal(archived.relativePath, created.relativePath);
  assert.equal(archived.metadata.status, "archived");

  const backlogCapture = createCapturedIo();
  await runCli(["list-documents", "--project", "acme-app", "--preset", "backlog"], backlogCapture.io);
  const backlog = parseLastJson(backlogCapture.captured.stdout);
  if (!isRecord(backlog) || !Array.isArray(backlog.documents)) {
    throw new Error("Unexpected backlog result shape after archive-document");
  }

  assert.equal(backlog.documents.length, 0);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI creates decisions through the manual interface", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const { io, captured } = createCapturedIo();
  await runCli(
    [
      "create-decision",
      "--project",
      "acme-app",
      "--topic",
      "private docs boundary",
      "--context",
      "Need a private memory store outside the main repository.",
      "--decision",
      "Store agent memory in project-memory.",
      "--consequences",
      "separate repo|manual commit flow",
      "--stable-guidance-review",
      "reviewed-no-change",
      "--date",
      "2026-03-11",
    ],
    io,
  );

  const result = parseLastJson(captured.stdout);
  if (!isRecord(result) || typeof result.relativePath !== "string") {
    throw new Error("Unexpected create-decision result shape");
  }

  assert.match(result.relativePath, /projects\/acme-app\/decisions\/2026\/2026-03-11-private-docs-boundary\.md/);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI rejects non-draft decisions without stable-guidance review", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  await assert.rejects(
    () =>
      runCli([
        "create-decision",
        "--project",
        "acme-app",
        "--topic",
        "missing review",
        "--context",
        "Need durable rationale coverage.",
        "--decision",
        "Reject writes without review outcome.",
        "--consequences",
        "create-decision contract stays explicit",
        "--date",
        "2026-03-11",
      ]),
    /Non-draft decisions require stableGuidanceReview/,
  );

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI lists draft-decision ideas through the ideas preset", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  await runCli(
    [
      "create-decision",
      "--project",
      "acme-app",
      "--topic",
      "older idea",
      "--context",
      "Need one older draft idea.",
      "--decision",
      "Keep this draft visible.",
      "--consequences",
      "shows draft ordering",
      "--status",
      "draft",
      "--date",
      "2026-03-10",
    ],
  );

  await runCli(
    [
      "create-decision",
      "--project",
      "acme-app",
      "--topic",
      "newer idea",
      "--context",
      "Need one newer draft idea.",
      "--decision",
      "Keep newer draft ideas first.",
      "--consequences",
      "shows newest first ordering",
      "--status",
      "draft",
      "--date",
      "2026-03-12",
    ],
  );

  await runCli(
    [
      "create-decision",
      "--project",
      "acme-app",
      "--topic",
      "accepted idea",
      "--context",
      "Need one accepted decision.",
      "--decision",
      "Do not include accepted decisions in ideas.",
      "--consequences",
      "should stay out of ideas",
      "--stable-guidance-review",
      "reviewed-no-change",
      "--status",
      "active",
      "--date",
      "2026-03-13",
    ],
  );

  const ideasCapture = createCapturedIo();
  await runCli(
    ["list-documents", "--project", "acme-app", "--preset", "ideas"],
    ideasCapture.io,
  );

  const ideasResult = parseLastJson(ideasCapture.captured.stdout);
  if (!isRecord(ideasResult) || !Array.isArray(ideasResult.documents) || !isRecord(ideasResult.appliedQuery)) {
    throw new Error("Unexpected ideas preset result shape");
  }

  assert.deepEqual(
    ideasResult.documents.map((document) => {
      if (!isRecord(document) || !isRecord(document.metadata) || typeof document.metadata.topic !== "string") {
        throw new Error("Expected listed idea document metadata");
      }

      return document.metadata.topic;
    }),
    ["newer-idea", "older-idea"],
  );
  assert.equal(ideasResult.appliedQuery.status, "draft");
  assert.equal(ideasResult.appliedQuery.type, "decision");

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI upserts provider notes and commits pending document changes", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  const providerCapture = createCapturedIo();
  await runCli(
    [
      "upsert-provider-note",
      "--project",
      "acme-app",
      "--provider",
      "claude",
      "--overview",
      "Primary coding assistant.",
      "--constraints",
      "needs explicit context|prefers local sources",
      "--guidance",
      "read project rules first|keep edits targeted",
      "--date",
      "2026-03-11",
    ],
    providerCapture.io,
  );

  const providerResult = parseLastJson(providerCapture.captured.stdout);
  if (!isRecord(providerResult) || typeof providerResult.relativePath !== "string") {
    throw new Error("Unexpected upsert-provider-note result shape");
  }

  assert.match(providerResult.relativePath, /projects\/acme-app\/provider-notes\/claude\.md/);

  const commitCapture = createCapturedIo();
  await runCli(
    [
      "commit-pending-changes",
      "--project",
      "acme-app",
      "--summary",
      "claude working note",
    ],
    commitCapture.io,
  );

  const commitResult = parseLastJson(commitCapture.captured.stdout);
  if (
    !isRecord(commitResult) ||
    typeof commitResult.message !== "string" ||
    !Array.isArray(commitResult.committedPaths)
  ) {
    throw new Error("Unexpected commit-pending-changes result shape");
  }

  assert.equal(commitResult.message, "docs(acme-app/provider): claude working note");
  assert(commitResult.committedPaths.includes("projects/acme-app/provider-notes/claude.md"));

  const gitLog = spawnSync("git", ["log", "--oneline", "-1"], { cwd: rootDir, encoding: "utf8" });
  assert.match(gitLog.stdout, /docs\(acme-app\/provider\): claude working note/);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI pushes committed memory-repo changes to origin", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  await runCli([
    "append-session-note",
    "--project",
    "acme-app",
    "--topic",
    "cli push flow",
    "--summary",
    "Prepared push flow validation.",
    "--actions",
    "created note",
    "--follow-up",
    "push it to origin",
    "--date",
    "2026-03-11",
  ]);

  await runCli([
    "commit-pending-changes",
    "--project",
    "acme-app",
    "--summary",
    "cli push flow validation",
  ]);

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
    const pushCapture = createCapturedIo();
    await runCli(["push-pending-changes"], pushCapture.io);

    const pushResult = parseLastJson(pushCapture.captured.stdout);
    if (
      !isRecord(pushResult) ||
      typeof pushResult.remote !== "string" ||
      typeof pushResult.branch !== "string" ||
      typeof pushResult.currentBranch !== "string"
    ) {
      throw new Error("Unexpected push-pending-changes result shape");
    }

    const pushLog = fs.readFileSync(logPath, "utf8");

    assert.equal(pushResult.remote, "origin");
    assert.equal(pushResult.branch, localBranch);
    assert.equal(pushResult.currentBranch, localBranch);
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

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI upserts canonical docs and exposes them through read-document", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;
  setupTestProjectTaxonomy(createTestRepositoryContext(rootDir), "acme-app", ["resume-flow"]);

  const canonicalCapture = createCapturedIo();
  await runCli(
    [
      "upsert-canonical-doc",
      "--project",
      "acme-app",
      "--topic",
      "resume policy",
      "--registry-scope",
      "resume-flow",
      "--summary",
      "Canonical guidance for resume flow.",
      "--guidance",
      "prefer declared scope|keep canonical notes concise",
      "--references",
      "taxonomy-registry-baseline|near-term-implementation-sessions",
      "--date",
      "2026-03-11",
    ],
    canonicalCapture.io,
  );

  const canonicalResult = parseLastJson(canonicalCapture.captured.stdout);
  if (!isRecord(canonicalResult) || typeof canonicalResult.relativePath !== "string") {
    throw new Error("Unexpected upsert-canonical-doc result shape");
  }

  assert.match(
    canonicalResult.relativePath,
    /projects\/acme-app\/canonical-docs\/resume-flow\/resume-policy\.md/,
  );

  const readCapture = createCapturedIo();
  await runCli(["read-document", "--path", canonicalResult.relativePath], readCapture.io);
  const readResult = parseLastJson(readCapture.captured.stdout);
  if (!isRecord(readResult) || !isRecord(readResult.metadata)) {
    throw new Error("Unexpected read-document result shape");
  }

  assert.equal(readResult.metadata.registry_scope, "resume-flow");

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI upserts work items and exposes planning metadata through list-documents", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const workItemCapture = createCapturedIo();
  await runCli(
    [
      "upsert-work-item",
      "--project",
      "acme-app",
      "--topic",
      "resume slice",
      "--summary",
      "Implement the first resumable work slice.",
      "--outcome",
      "Backlog planning can read a real work-item document.",
      "--origin-kind",
      "ad-hoc",
      "--origin-note",
      "CLI coverage.",
      "--verification",
      "Run CLI integration coverage",
      "--date",
      "2026-03-11",
    ],
    workItemCapture.io,
  );

  const workItemResult = parseLastJson(workItemCapture.captured.stdout);
  if (!isRecord(workItemResult) || typeof workItemResult.relativePath !== "string") {
    throw new Error("Unexpected upsert-work-item result shape");
  }

  assert.match(
    workItemResult.relativePath,
    /projects\/acme-app\/work-items\/2026\/2026-03-11-resume-slice\.md/,
  );

  const listCapture = createCapturedIo();
  await runCli(
    ["list-documents", "--project", "acme-app", "--preset", "backlog"],
    listCapture.io,
  );
  const listResult = parseLastJson(listCapture.captured.stdout);
  if (!isRecord(listResult) || !Array.isArray(listResult.documents)) {
    throw new Error("Unexpected list-documents result shape");
  }

  const [listedDocument] = listResult.documents;
  if (!isRecord(listedDocument)) {
    throw new Error("Expected one listed work-item document");
  }

  assert.equal(listedDocument.planningState, "ready");
  assert.equal(listedDocument.unresolvedDependencyCount, 0);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI closes work items through the dedicated lifecycle command", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  await runCli(
    [
      "append-session-note",
      "--project",
      "acme-app",
      "--topic",
      "closeable-slice-session",
      "--summary",
      "Captured closeable slice progress.",
      "--actions",
      "Implemented the closeable slice",
      "--follow-up",
      "Link the session note from the work-item",
      "--date",
      "2026-03-11",
    ],
  );

  await runCli(
    [
      "upsert-work-item",
      "--project",
      "acme-app",
      "--topic",
      "closeable slice",
      "--summary",
      "Implement the closeable work slice.",
      "--outcome",
      "A dedicated lifecycle helper can finish the item.",
      "--origin-kind",
      "ad-hoc",
      "--origin-note",
      "CLI close coverage.",
      "--verification",
      "Run CLI close coverage",
      "--evidence",
      "session-note:acme-app:2026-03-11:closeable-slice-session",
      "--date",
      "2026-03-11",
      "--work-item-state",
      "in_progress",
    ],
  );

  const closeCapture = createCapturedIo();
  await runCli(
    [
      "close-work-item",
      "--project",
      "acme-app",
      "--topic",
      "closeable slice",
      "--date",
      "2026-03-11",
      "--state",
      "done",
    ],
    closeCapture.io,
  );

  const closeResult = parseLastJson(closeCapture.captured.stdout);
  if (!isRecord(closeResult) || !isRecord(closeResult.metadata)) {
    throw new Error("Unexpected close-work-item result shape");
  }

  assert.equal(closeResult.metadata.work_item_state, "done");

  const listCapture = createCapturedIo();
  await runCli(
    ["list-documents", "--project", "acme-app", "--preset", "backlog"],
    listCapture.io,
  );
  const listResult = parseLastJson(listCapture.captured.stdout);
  if (!isRecord(listResult) || !Array.isArray(listResult.documents)) {
    throw new Error("Unexpected backlog result shape after close-work-item");
  }

  assert.equal(listResult.documents.length, 0);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI archives terminal work items through the dedicated lifecycle command", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  await runCli(
    [
      "append-session-note",
      "--project",
      "acme-app",
      "--topic",
      "archivable-slice-session",
      "--summary",
      "Captured archivable slice progress.",
      "--actions",
      "Finished the archivable slice",
      "--follow-up",
      "Archive the finished work-item",
      "--date",
      "2026-03-11",
    ],
  );

  await runCli(
    [
      "upsert-work-item",
      "--project",
      "acme-app",
      "--topic",
      "archivable slice",
      "--summary",
      "Implement the archivable work slice.",
      "--outcome",
      "A dedicated archive helper can retire the item in place.",
      "--origin-kind",
      "ad-hoc",
      "--origin-note",
      "CLI archive coverage.",
      "--verification",
      "Run CLI archive coverage",
      "--evidence",
      "session-note:acme-app:2026-03-11:archivable-slice-session",
      "--date",
      "2026-03-11",
      "--work-item-state",
      "done",
    ],
  );

  const archiveCapture = createCapturedIo();
  await runCli(
    [
      "archive-work-item",
      "--project",
      "acme-app",
      "--topic",
      "archivable slice",
      "--date",
      "2026-03-11",
    ],
    archiveCapture.io,
  );

  const archiveResult = parseLastJson(archiveCapture.captured.stdout);
  if (!isRecord(archiveResult) || !isRecord(archiveResult.metadata)) {
    throw new Error("Unexpected archive-work-item result shape");
  }

  assert.equal(archiveResult.metadata.status, "archived");
  assert.equal(archiveResult.metadata.work_item_state, "done");

  const listCapture = createCapturedIo();
  await runCli(
    ["list-documents", "--project", "acme-app", "--preset", "backlog"],
    listCapture.io,
  );
  const listResult = parseLastJson(listCapture.captured.stdout);
  if (!isRecord(listResult) || !Array.isArray(listResult.documents)) {
    throw new Error("Unexpected backlog result shape after archive-work-item");
  }

  assert.equal(listResult.documents.length, 0);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI archive-document rejects work-item paths", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  await runCli(
    [
      "append-session-note",
      "--project",
      "acme-app",
      "--topic",
      "archive-via-wrong-cli-session",
      "--summary",
      "Captured the negative archive coverage session.",
      "--actions",
      "Prepared the done work-item fixture",
      "--follow-up",
      "Use archive-work-item instead",
      "--date",
      "2026-03-11",
    ],
  );

  await runCli(
    [
      "upsert-work-item",
      "--project",
      "acme-app",
      "--topic",
      "archive via wrong cli",
      "--summary",
      "Verify CLI archive helper boundaries.",
      "--outcome",
      "Generic archive flow rejects work-item paths.",
      "--origin-kind",
      "ad-hoc",
      "--origin-note",
      "CLI negative archive coverage.",
      "--verification",
      "Expect archive-document to fail",
      "--evidence",
      "session-note:acme-app:2026-03-11:archive-via-wrong-cli-session",
      "--date",
      "2026-03-11",
      "--work-item-state",
      "done",
    ],
  );

  await assert.rejects(
    () =>
      runCli([
        "archive-document",
        "--path",
        "projects/acme-app/work-items/2026/2026-03-11-archive-via-wrong-cli.md",
      ]),
    /Use archiveWorkItem to archive work-item documents/,
  );

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI rejects reading unmanaged document paths", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  fs.mkdirSync(path.join(rootDir, "projects", "acme-app", "scratch"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "projects", "acme-app", "scratch", "unmanaged.md"),
    "---\ndate: 2026-03-11\nproject: acme-app\ntopic: unmanaged\nsource: manual\nstatus: active\n---\n\nscratch\n",
    "utf8",
  );

  await assert.rejects(
    () => runCli(["read-document", "--path", "projects/acme-app/scratch/unmanaged.md"]),
    /approved project-memory document paths/,
  );

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI exposes bounded read entrypoints", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;
  setupTestProjectTaxonomy(createTestRepositoryContext(rootDir), "acme-app", ["resume-flow"]);

  await runCli(
    [
      "create-runbook",
      "--project",
      "acme-app",
      "--topic",
      "architecture overview",
      "--purpose",
      "Describe the current architecture.",
      "--procedure",
      "Read the overview",
      "--verification",
      "Confirm the overview is current",
      "--date",
      "2026-03-11",
    ],
  );
  await runCli(
    [
      "upsert-canonical-doc",
      "--project",
      "acme-app",
      "--topic",
      "resume policy",
      "--registry-scope",
      "resume-flow",
      "--summary",
      "Canonical resume guidance.",
      "--guidance",
      "prefer resumable jobs",
      "--references",
      "decision: resume-architecture|runbook: architecture-overview",
      "--date",
      "2026-03-11",
    ],
  );
  await runCli(
    [
      "create-decision",
      "--project",
      "acme-app",
      "--topic",
      "resume-architecture",
      "--context",
      "Need rationale coverage.",
      "--decision",
      "Keep resume architecture explicit.",
      "--consequences",
      "bounded reads can follow a direct rationale source",
      "--stable-guidance-review",
      "reviewed-no-change",
      "--date",
      "2026-03-12",
    ],
  );
  await runCli(
    [
      "append-session-note",
      "--project",
      "acme-app",
      "--topic",
      "resume evidence",
      "--summary",
      "Captured planning evidence in a session note.",
      "--actions",
      "saved explicit evidence note",
      "--follow-up",
      "read it through planning topic entry",
      "--date",
      "2026-03-13",
    ],
  );
  await runCli(
    [
      "record-verification-result",
      "--project",
      "acme-app",
      "--topic",
      "resume check",
      "--scope",
      "Planning topic entry",
      "--steps",
      "run explicit evidence coverage",
      "--result",
      "Pass",
      "--date",
      "2026-03-13",
    ],
  );
  await runCli(
    [
      "upsert-work-item",
      "--project",
      "acme-app",
      "--topic",
      "resume prerequisite",
      "--summary",
      "Complete the prerequisite slice.",
      "--outcome",
      "Main planning work can depend on a bounded prerequisite.",
      "--origin-kind",
      "ad-hoc",
      "--origin-note",
      "CLI bounded planning dependency coverage.",
      "--verification",
      "Confirm the prerequisite stays readable",
      "--evidence",
      "session-note:acme-app:2026-03-13:resume-evidence",
      "--date",
      "2026-03-12",
      "--work-item-state",
      "done",
    ],
  );
  await runCli(
    [
      "upsert-work-item",
      "--project",
      "acme-app",
      "--topic",
      "resume slice",
      "--summary",
      "Implement the planning slice.",
      "--outcome",
      "Dedicated planning reads can return work-item-only context.",
      "--origin-kind",
      "ad-hoc",
      "--origin-note",
      "CLI bounded planning coverage.",
      "--dependencies",
      "work-item:acme-app:2026-03-12:resume-prerequisite",
      "--context",
      "canonical-doc:acme-app:resume-flow:resume-policy|decision:acme-app:2026-03-12:resume-architecture",
      "--evidence",
      "verification-result:acme-app:2026-03-13:resume-check|session-note:acme-app:2026-03-13:resume-evidence",
      "--verification",
      "Run planning backlog coverage",
      "--date",
      "2026-03-13",
    ],
  );

  const coldStartCapture = createCapturedIo();
  await runCli(["read-cold-start", "--project", "acme-app"], coldStartCapture.io);
  const coldStartResult = parseLastJson(coldStartCapture.captured.stdout);
  if (!isRecord(coldStartResult) || !Array.isArray(coldStartResult.documents)) {
    throw new Error("Unexpected read-cold-start result shape");
  }

  assert.equal(coldStartResult.entrypoint, "cold-start");
  assert.equal(coldStartResult.documents.length, 3);

  const planningCapture = createCapturedIo();
  await runCli(["read-planning-backlog", "--project", "acme-app"], planningCapture.io);
  const planningResult = parseLastJson(planningCapture.captured.stdout);
  if (!isRecord(planningResult) || !Array.isArray(planningResult.documents)) {
    throw new Error("Unexpected read-planning-backlog result shape");
  }

  assert.equal(planningResult.entrypoint, "planning-backlog");
  assert.deepEqual(
    planningResult.documents.map((document) => {
      if (!isRecord(document) || !isRecord(document.metadata) || typeof document.metadata.topic !== "string") {
        throw new Error("Expected read-planning-backlog document metadata");
      }

      return document.metadata.topic;
    }),
    ["resume-slice"],
  );
  if (!Array.isArray(planningResult.planningExplainability) || planningResult.planningExplainability.length !== 1) {
    throw new Error("Expected read-planning-backlog planning explainability");
  }

  const planningTopicCapture = createCapturedIo();
  await runCli(
    ["read-planning-topic-entry", "--project", "acme-app", "--topic", "resume slice"],
    planningTopicCapture.io,
  );
  const planningTopicResult = parseLastJson(planningTopicCapture.captured.stdout);
  if (!isRecord(planningTopicResult) || !Array.isArray(planningTopicResult.documents)) {
    throw new Error("Unexpected read-planning-topic-entry result shape");
  }

  assert.equal(planningTopicResult.entrypoint, "planning-topic-entry");
  assert.equal(planningTopicResult.topic, "resume-slice");
  assert.deepEqual(
    planningTopicResult.documents.map((document) => {
      if (!isRecord(document) || !isRecord(document.metadata) || typeof document.metadata.topic !== "string") {
        throw new Error("Expected read-planning-topic-entry document metadata");
      }

      return document.metadata.topic;
    }),
    [
      "resume-slice",
      "resume-prerequisite",
      "resume-policy",
      "resume-architecture",
      "resume-check",
      "resume-evidence",
    ],
  );
  if (
    !Array.isArray(planningTopicResult.planningExplainability)
    || planningTopicResult.planningExplainability.length !== 1
  ) {
    throw new Error("Expected read-planning-topic-entry planning explainability");
  }

  const topicCapture = createCapturedIo();
  await runCli(
    ["read-topic-entry", "--project", "acme-app", "--topic", "resume policy"],
    topicCapture.io,
  );
  const topicResult = parseLastJson(topicCapture.captured.stdout);
  if (!isRecord(topicResult) || !Array.isArray(topicResult.documents)) {
    throw new Error("Unexpected read-topic-entry result shape");
  }

  assert.equal(topicResult.entrypoint, "topic-entry");
  assert.equal(topicResult.topic, "resume-policy");
  assert.equal(topicResult.documents.length, 1);

  const rationaleCapture = createCapturedIo();
  await runCli(
    ["read-rationale-entry", "--project", "acme-app", "--topic", "resume policy"],
    rationaleCapture.io,
  );
  const rationaleResult = parseLastJson(rationaleCapture.captured.stdout);
  if (!isRecord(rationaleResult) || !Array.isArray(rationaleResult.documents)) {
    throw new Error("Unexpected read-rationale-entry result shape");
  }

  assert.equal(rationaleResult.entrypoint, "rationale-entry");
  assert.equal(rationaleResult.documents.length, 3);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI requires a commit summary for commit-pending-changes", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  await runCli(
    [
      "append-session-note",
      "--project",
      "acme-app",
      "--topic",
      "cli invalid commit",
      "--summary",
      "Prepared invalid commit message coverage.",
      "--actions",
      "created note",
      "--follow-up",
      "reject invalid commit message",
      "--date",
      "2026-03-11",
    ],
  );

  await assert.rejects(
    () => runCli(["commit-pending-changes", "--project", "acme-app"]),
    /Missing required flag --summary/,
  );

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI rejects push when origin is not configured", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  await runCli([
    "append-session-note",
    "--project",
    "acme-app",
    "--topic",
    "cli missing push remote",
    "--summary",
    "Prepared missing push remote coverage.",
    "--actions",
    "created note",
    "--follow-up",
    "reject missing origin",
    "--date",
    "2026-03-11",
  ]);

  await runCli([
    "commit-pending-changes",
    "--project",
    "acme-app",
    "--summary",
    "cli missing push remote",
  ]);

  await assert.rejects(
    () => runCli(["push-pending-changes"]),
    /Remote origin is not configured/,
  );

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI rejects secret-like content for append-session-note", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  await assert.rejects(
    () =>
      runCli([
        "append-session-note",
        "--project",
        "acme-app",
        "--topic",
        "unsafe session",
        "--summary",
        "Captured sk-1234567890abcdefghijklmnop during debugging.",
        "--actions",
        "remove secret",
        "--follow-up",
        "rotate token",
        "--date",
        "2026-03-11",
      ]),
    /secret-like content/,
  );

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI rejects env-style content for record-verification-result", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  await assert.rejects(
    () =>
      runCli([
        "record-verification-result",
        "--project",
        "acme-app",
        "--topic",
        "unsafe verification",
        "--scope",
        "Validation scope",
        "--steps",
        "check config",
        "--result",
        "Fail\nFEATURE_FLAG=enabled",
        "--date",
        "2026-03-11",
      ]),
    /\.env-style content/,
  );

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI rejects raw dump content for create-runbook", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  await assert.rejects(
    () =>
      runCli([
        "create-runbook",
        "--project",
        "acme-app",
        "--topic",
        "unsafe runbook",
        "--purpose",
        rawDumpText,
        "--procedure",
        "step one",
        "--verification",
        "step two",
        "--date",
        "2026-03-11",
      ]),
    /raw command output or an unreviewed dump/,
  );

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI archives multiple documents and commits them with archive scope", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  const sessionCapture = createCapturedIo();
  await runCli(
    [
      "append-session-note",
      "--project",
      "acme-app",
      "--topic",
      "archive session",
      "--summary",
      "Prepared archive flow validation.",
      "--actions",
      "created session note",
      "--follow-up",
      "archive it later",
      "--date",
      "2026-03-11",
    ],
    sessionCapture.io,
  );

  const verificationCapture = createCapturedIo();
  await runCli(
    [
      "record-verification-result",
      "--project",
      "acme-app",
      "--topic",
      "archive verification",
      "--scope",
      "Archive flow",
      "--steps",
      "created verification note",
      "--result",
      "Pass",
      "--date",
      "2026-03-11",
    ],
    verificationCapture.io,
  );

  const sessionDocument = parseLastJson(sessionCapture.captured.stdout);
  const verificationDocument = parseLastJson(verificationCapture.captured.stdout);

  if (
    !isRecord(sessionDocument) ||
    typeof sessionDocument.relativePath !== "string" ||
    !isRecord(verificationDocument) ||
    typeof verificationDocument.relativePath !== "string"
  ) {
    throw new Error("Unexpected archive seed result shape");
  }

  await runCli([
    "commit-pending-changes",
    "--project",
    "acme-app",
    "--summary",
    "seed archive fixtures",
  ]);

  await runCli(["archive-document", "--path", sessionDocument.relativePath]);
  await runCli(["archive-document", "--path", verificationDocument.relativePath]);

  const commitCapture = createCapturedIo();
  await runCli(
    [
      "commit-pending-changes",
      "--project",
      "acme-app",
      "--summary",
      "archive stale notes",
    ],
    commitCapture.io,
  );

  const commitResult = parseLastJson(commitCapture.captured.stdout);
  if (
    !isRecord(commitResult) ||
    typeof commitResult.message !== "string" ||
    !Array.isArray(commitResult.committedPaths)
  ) {
    throw new Error("Unexpected archive commit result shape");
  }

  assert.equal(commitResult.message, "docs(acme-app/archive): archive stale notes");
  assert(
    commitResult.committedPaths.some((entry) => {
      return typeof entry === "string" && entry.startsWith("archives/acme-app/session-log/");
    }),
  );
  assert(
    commitResult.committedPaths.some((entry) => {
      return typeof entry === "string" && entry.startsWith("archives/acme-app/verification/");
    }),
  );

  const gitLog = spawnSync("git", ["log", "--oneline", "-1"], { cwd: rootDir, encoding: "utf8" });
  assert.match(gitLog.stdout, /docs\(acme-app\/archive\): archive stale notes/);

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI requires mixed scope when archive changes are combined with active documents", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  const sessionCapture = createCapturedIo();
  await runCli(
    [
      "append-session-note",
      "--project",
      "acme-app",
      "--topic",
      "archive then mixed",
      "--summary",
      "Prepared mixed archive validation.",
      "--actions",
      "created session note",
      "--follow-up",
      "archive it",
      "--date",
      "2026-03-11",
    ],
    sessionCapture.io,
  );

  const sessionDocument = parseLastJson(sessionCapture.captured.stdout);
  if (!isRecord(sessionDocument) || typeof sessionDocument.relativePath !== "string") {
    throw new Error("Unexpected session seed result shape");
  }

  await runCli([
    "commit-pending-changes",
    "--project",
    "acme-app",
    "--summary",
    "seed archive source",
  ]);
  await runCli(["archive-document", "--path", sessionDocument.relativePath]);
  await runCli(
    [
      "create-decision",
      "--project",
      "acme-app",
      "--topic",
      "archive mixed scope",
      "--context",
      "Need to verify commit scope after archive plus active edits.",
      "--decision",
      "Require mixed scope when archive and active changes coexist.",
      "--consequences",
      "clearer git history",
      "--stable-guidance-review",
      "reviewed-no-change",
      "--date",
      "2026-03-11",
    ],
  );

  const commitCapture = createCapturedIo();
  await runCli(
    [
      "commit-pending-changes",
      "--project",
      "acme-app",
      "--summary",
      "archive plus active update",
    ],
    commitCapture.io,
  );

  const commitResult = parseLastJson(commitCapture.captured.stdout);
  if (!isRecord(commitResult) || typeof commitResult.message !== "string") {
    throw new Error("Unexpected mixed commit result shape");
  }

  assert.equal(commitResult.message, "docs(acme-app/mixed): archive plus active update");

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI commits only the selected project when multiple projects have pending managed changes", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  spawnSync("git", ["init", "-q"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "tests@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Project Memory Tests"], { cwd: rootDir, encoding: "utf8" });

  await runCli(
    [
      "append-session-note",
      "--project",
      "acme-app",
      "--topic",
      "cross project one",
      "--summary",
      "Prepared the first project change.",
      "--actions",
      "created acme note",
      "--follow-up",
      "commit separately",
      "--date",
      "2026-03-11",
    ],
  );

  await runCli(
    [
      "create-decision",
      "--project",
      "beta-app",
      "--topic",
      "cross project two",
      "--context",
      "Prepared a second project change in the same worktree.",
      "--decision",
      "Project-scoped commits should ignore unrelated pending changes.",
      "--consequences",
      "commit per project",
      "--stable-guidance-review",
      "reviewed-no-change",
      "--date",
      "2026-03-11",
    ],
  );

  const commitCapture = createCapturedIo();
  await runCli(
    [
      "commit-pending-changes",
      "--project",
      "acme-app",
      "--summary",
      "selected project commit",
    ],
    commitCapture.io,
  );

  const commitResult = parseLastJson(commitCapture.captured.stdout);
  if (
    !isRecord(commitResult) ||
    typeof commitResult.message !== "string" ||
    !Array.isArray(commitResult.committedPaths)
  ) {
    throw new Error("Unexpected selected project commit result shape");
  }

  assert.equal(commitResult.message, "docs(acme-app/session): selected project commit");
  assert(
    commitResult.committedPaths.every((entry) => {
      return typeof entry === "string" && entry.includes("projects/acme-app/");
    }),
  );

  const status = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  assert.match(status.stdout, /projects\/beta-app\/decisions\//);

  delete process.env.PROJECT_MEMORY_ROOT;
});
