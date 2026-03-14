import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Returns `true` when a value is a plain object.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * Escapes one string value for POSIX shell single-quoted usage.
 */
const escapeShellString = (value: string): string => {
  return `'${value.replaceAll("'", `'\\''`)}'`;
};

/**
 * Copies the minimal runnable tool repository into a temporary directory.
 */
const createIsolatedToolRepo = (): string => {
  const testFilePath = fileURLToPath(import.meta.url);
  const sourceRepoRoot = path.resolve(path.dirname(testFilePath), "../..");
  const isolatedRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-tool-e2e-"));

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
 * Runs one install command through the shell wrapper.
 */
const runInstallScript = (
  toolRootDir: string,
  homeDir: string,
  memoryRootDir: string,
): void => {
  const installResult = spawnSync(
    "bash",
    ["scripts/install.sh", "--memory-root", memoryRootDir, "--project", "Acme App", "--git-init", "true"],
    {
      cwd: toolRootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: homeDir,
      },
    },
  );

  if (installResult.status !== 0) {
    throw new Error(installResult.stderr || installResult.stdout || "install.sh failed");
  }
};

/**
 * Runs one installed CLI wrapper command through a shell and captures stdout in a file.
 */
const runCliWrapperCommand = (
  toolRootDir: string,
  homeDir: string,
  args: string[],
): string => {
  const outputFilePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-wrapper-output-")),
    "stdout.txt",
  );
  const shellCommand = [
    "HOME=",
    escapeShellString(homeDir),
    " ",
    escapeShellString(path.join(toolRootDir, "scripts", "run-cli.sh")),
    " ",
    args.map(escapeShellString).join(" "),
    " > ",
    escapeShellString(outputFilePath),
  ].join("");
  const result = spawnSync("bash", ["-lc", shellCommand], {
    cwd: toolRootDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "run-cli.sh failed");
  }

  return fs.readFileSync(outputFilePath, "utf8");
};

/**
 * Appends one session note through the installed CLI wrapper.
 */
const appendSessionNoteThroughCliWrapper = (
  toolRootDir: string,
  homeDir: string,
): void => {
  runCliWrapperCommand(toolRootDir, homeDir, [
    "append-session-note",
    "--project",
    "acme-app",
    "--topic",
    "install-smoke",
    "--date",
    "2026-03-11",
    "--summary",
    "Validated install-to-wrapper flow.",
    "--actions",
    "Ran install.sh in an isolated tool repo",
    "--follow-up",
    "List the managed document back",
  ]);
};

/**
 * Lists documents through the installed CLI wrapper and returns the parsed payload.
 */
const listDocumentsThroughCliWrapper = (
  toolRootDir: string,
  homeDir: string,
): unknown => {
  return JSON.parse(
    runCliWrapperCommand(toolRootDir, homeDir, [
      "list-documents",
      "--project",
      "acme-app",
    ]),
  );
};

test("install script provisions wrappers and local wrapper flow reaches the external memory repo", () => {
  const toolRootDir = createIsolatedToolRepo();
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-home-e2e-"));
  const memoryRootDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-data-e2e-")), "memory-store");
  const codexConfigPath = path.join(homeDir, ".codex", "config.toml");
  const claudeConfigPath = path.join(homeDir, ".claude.json");
  const envFilePath = path.join(toolRootDir, ".project-memory.env");
  const runCliScriptPath = path.join(toolRootDir, "scripts", "run-cli.sh");
  const runMcpScriptPath = path.join(toolRootDir, "scripts", "run-mcp.sh");

  runInstallScript(toolRootDir, homeDir, memoryRootDir);
  assert(fs.existsSync(envFilePath));
  assert(fs.existsSync(runCliScriptPath));
  assert(fs.existsSync(runMcpScriptPath));
  assert(fs.existsSync(codexConfigPath));
  assert(fs.existsSync(claudeConfigPath));
  assert(fs.existsSync(path.join(memoryRootDir, ".git")));
  assert(fs.existsSync(path.join(memoryRootDir, "projects", "acme-app")));
  assert.match(fs.readFileSync(envFilePath, "utf8"), /PROJECT_MEMORY_ROOT/);
  assert.match(fs.readFileSync(codexConfigPath, "utf8"), /\[mcp_servers\.project-memory\]/);
  assert.match(fs.readFileSync(codexConfigPath, "utf8"), /--experimental-strip-types/);
  assert.match(fs.readFileSync(codexConfigPath, "utf8"), /src\/mcp\/server\.ts/);
  assert.match(fs.readFileSync(claudeConfigPath, "utf8"), /"project-memory"/);

  appendSessionNoteThroughCliWrapper(toolRootDir, homeDir);

  const listedDocuments = listDocumentsThroughCliWrapper(toolRootDir, homeDir);
  if (!isRecord(listedDocuments) || !Array.isArray(listedDocuments.documents)) {
    throw new Error("Expected list-documents to return a structured result");
  }

  const firstDocument = listedDocuments.documents[0];
  if (!isRecord(firstDocument) || typeof firstDocument.relativePath !== "string") {
    throw new Error("Expected managed document metadata from list-documents");
  }

  assert.match(firstDocument.relativePath, /projects\/acme-app\/session-log\/2026\/03\//);

  const sessionNotePath = path.join(
    memoryRootDir,
    "projects",
    "acme-app",
    "session-log",
    "2026",
    "03",
    "2026-03-11-install-smoke.md",
  );
  assert(fs.existsSync(sessionNotePath));
  assert.match(fs.readFileSync(sessionNotePath, "utf8"), /Validated install-to-wrapper flow/);
});
