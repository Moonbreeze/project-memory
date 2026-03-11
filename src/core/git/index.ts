import { spawnSync } from "node:child_process";
import path from "node:path";

import { resolveArchiveRelativePath } from "../archive/index.ts";
import { createRepositoryContext } from "../config/index.ts";
import { isManagedDocumentRelativePath, resolveDocumentTypeFromRelativePath } from "../documents/index.ts";
import type { CommitPendingChangesInput } from "../types/index.ts";

type CommitScope = "session" | "verification" | "provider" | "decision" | "runbook" | "archive" | "mixed";

const commitMessagePattern =
  /^docs\((session|verification|provider|decision|runbook|archive|mixed)\): (\S(?:.*\S)?)$/;

/**
 * Executes a git command and returns trimmed stdout.
 */
const runGit = (args: string[], cwd: string): string => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    throw new Error(stderr || stdout || `git ${args.join(" ")} failed`);
  }

  return result.stdout.trim();
};

const readGitPathList = (args: string[], cwd: string): string[] => {
  const output = runGit(args, cwd);
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const collectChangedPaths = (cwd: string): string[] => {
  const changedPaths = new Set<string>();
  const gitCommands = [
    ["diff", "--name-only", "--", "projects", "archives"],
    ["diff", "--cached", "--name-only", "--", "projects", "archives"],
    ["ls-files", "--others", "--exclude-standard", "--", "projects", "archives"],
  ];

  for (const command of gitCommands) {
    for (const changedPath of readGitPathList(command, cwd)) {
      changedPaths.add(path.normalize(changedPath));
    }
  }

  return [...changedPaths];
};

const isArchiveRelativePath = (relativePath: string): boolean => {
  return relativePath.startsWith(`archives${path.sep}`) || relativePath.startsWith("archives/");
};

const isProjectRelativePath = (relativePath: string): boolean => {
  return relativePath.startsWith(`projects${path.sep}`) || relativePath.startsWith("projects/");
};

const inferCommitScope = (approvedPaths: string[]): CommitScope => {
  const archivePaths = approvedPaths.filter(isArchiveRelativePath);
  if (archivePaths.length > 0) {
    const archivePathSet = new Set(archivePaths);
    const projectPaths = approvedPaths.filter(isProjectRelativePath);
    const hasOnlyArchiveSourcePaths = projectPaths.every((projectPath) => {
      try {
        return archivePathSet.has(path.normalize(resolveArchiveRelativePath(projectPath)));
      } catch {
        return false;
      }
    });

    return hasOnlyArchiveSourcePaths ? "archive" : "mixed";
  }

  const documentTypes = new Set(
    approvedPaths.map((approvedPath) => resolveDocumentTypeFromRelativePath(approvedPath)),
  );

  if (documentTypes.size !== 1) {
    return "mixed";
  }

  const documentType = [...documentTypes][0];
  switch (documentType) {
    case "session-note":
      return "session";
    case "verification-result":
      return "verification";
    case "provider-note":
      return "provider";
    case "decision":
      return "decision";
    case "runbook":
      return "runbook";
  }
};

const validateCommitMessage = (message: string, expectedScope: CommitScope): void => {
  const match = commitMessagePattern.exec(message);
  if (!match) {
    throw new Error(
      "Commit message must use the format docs(<scope>): <summary> with scope in session|verification|provider|decision|runbook|archive|mixed",
    );
  }

  const actualScope = match[1] as CommitScope;
  if (actualScope !== expectedScope) {
    throw new Error(`Commit message scope must be docs(${expectedScope}): for the current changes`);
  }
};

/**
 * Stages approved managed documents and creates one git commit.
 */
export const commitPendingChanges = (
  input: CommitPendingChangesInput,
  context = createRepositoryContext(),
): { message: string; committedPaths: string[] } => {
  const approvedPaths = collectChangedPaths(context.memoryRootDir).filter((changedPath) => {
    return isManagedDocumentRelativePath(changedPath);
  });

  if (approvedPaths.length === 0) {
    throw new Error("No approved document changes are available for commit");
  }

  validateCommitMessage(input.message, inferCommitScope(approvedPaths));

  runGit(["add", "--", ...approvedPaths], context.memoryRootDir);

  const staged = readGitPathList(
    ["diff", "--cached", "--name-only", "--", ...approvedPaths],
    context.memoryRootDir,
  );

  if (staged.length === 0) {
    throw new Error("No approved document changes are staged for commit");
  }

  runGit(["commit", "-m", input.message, "--only", "--", ...approvedPaths], context.memoryRootDir);

  return {
    message: input.message,
    committedPaths: staged.map((entry) => path.normalize(entry)),
  };
};
