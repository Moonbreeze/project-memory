import { spawnSync } from "node:child_process";
import path from "node:path";

import { resolveArchiveRelativePath } from "../archive/index.ts";
import { createRepositoryContext } from "../config/index.ts";
import { isManagedDocumentRelativePath, resolveManagedDocumentPathInfo } from "../documents/index.ts";
import type { CommitPendingChangesInput, ManagedDocumentPathInfo } from "../types/index.ts";

type CommitScope =
  | "session"
  | "verification"
  | "provider"
  | "decision"
  | "runbook"
  | "canonical"
  | "work-item"
  | "archive"
  | "mixed";

type EligibleManagedPath = ManagedDocumentPathInfo & {
  relativePath: string;
};

/**
 * Inferred managed-doc commit target derived from the staged path set.
 */
type CommitTarget = {
  project: string;
  scope: CommitScope;
};

const commitMessagePattern =
  /^docs\(([a-z0-9]+(?:-[a-z0-9]+)*)\/(session|verification|provider|decision|runbook|canonical|work-item|archive|mixed)\): (\S(?:.*\S)?)$/;

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

const inferCommitScope = (approvedPaths: EligibleManagedPath[]): CommitScope => {
  const archivePaths = approvedPaths.filter((approvedPath) => approvedPath.archived);
  if (archivePaths.length > 0) {
    const archivePathSet = new Set(archivePaths.map((approvedPath) => approvedPath.relativePath));
    const projectPaths = approvedPaths.filter((approvedPath) => !approvedPath.archived);
    const hasOnlyArchiveSourcePaths = projectPaths.every((projectPath) => {
      try {
        return archivePathSet.has(path.normalize(resolveArchiveRelativePath(projectPath.relativePath)));
      } catch {
        return false;
      }
    });

    return hasOnlyArchiveSourcePaths ? "archive" : "mixed";
  }

  const documentTypes = new Set(approvedPaths.map((approvedPath) => approvedPath.type));

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
    case "canonical-doc":
      return "canonical";
    case "work-item":
      return "work-item";
  }
};

/**
 * Collects managed document paths eligible for one project-aware commit.
 */
const collectApprovedManagedPaths = (cwd: string): EligibleManagedPath[] => {
  return collectChangedPaths(cwd)
    .filter((changedPath) => {
      return isManagedDocumentRelativePath(changedPath);
    })
    .map((relativePath) => {
      return {
        relativePath,
        ...resolveManagedDocumentPathInfo(relativePath),
      };
    });
};

/**
 * Infers the required project and scope for one managed-document commit batch.
 */
const inferCommitTarget = (approvedPaths: EligibleManagedPath[]): CommitTarget => {
  const projects = [...new Set(approvedPaths.map((approvedPath) => approvedPath.project))].sort();
  if (projects.length !== 1) {
    throw new Error(
      `Pending managed document changes span multiple projects (${projects.join(", ")}). Commit one project at a time; cross-project commits require an explicit special-case path.`,
    );
  }

  const [project] = projects;
  if (!project) {
    throw new Error("Pending managed document changes are missing a project slug");
  }

  return {
    project,
    scope: inferCommitScope(approvedPaths),
  };
};

const validateCommitMessage = (message: string, expectedTarget: CommitTarget): void => {
  const match = commitMessagePattern.exec(message);
  if (!match) {
    throw new Error(
      "Commit message must use the format docs(<project>/<scope>): <summary> with scope in session|verification|provider|decision|runbook|canonical|work-item|archive|mixed",
    );
  }

  const actualProject = match[1];
  const actualScope = match[2] as CommitScope;
  if (actualProject !== expectedTarget.project || actualScope !== expectedTarget.scope) {
    throw new Error(
      `Commit message must be docs(${expectedTarget.project}/${expectedTarget.scope}): for the current changes`,
    );
  }
};

/**
 * Stages approved managed documents and creates one git commit.
 */
export const commitPendingChanges = (
  input: CommitPendingChangesInput,
  context = createRepositoryContext(),
): { message: string; committedPaths: string[] } => {
  const approvedPaths = collectApprovedManagedPaths(context.memoryRootDir);

  if (approvedPaths.length === 0) {
    throw new Error("No approved document changes are available for commit");
  }

  const commitTarget = inferCommitTarget(approvedPaths);
  const approvedRelativePaths = approvedPaths.map((approvedPath) => approvedPath.relativePath);
  validateCommitMessage(input.message, commitTarget);

  runGit(["add", "--", ...approvedRelativePaths], context.memoryRootDir);

  const staged = readGitPathList(
    ["diff", "--cached", "--name-only", "--", ...approvedRelativePaths],
    context.memoryRootDir,
  );

  if (staged.length === 0) {
    throw new Error("No approved document changes are staged for commit");
  }

  runGit(
    ["commit", "-m", input.message, "--only", "--", ...approvedRelativePaths],
    context.memoryRootDir,
  );

  return {
    message: input.message,
    committedPaths: staged.map((entry) => path.normalize(entry)),
  };
};
