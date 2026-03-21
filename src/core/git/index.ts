import { spawnSync } from "node:child_process";
import path from "node:path";

import { resolveArchiveRelativePath } from "../archive/index.ts";
import { createRepositoryContext } from "../config/index.ts";
import { isManagedDocumentRelativePath, resolveManagedDocumentPathInfo } from "../documents/index.ts";
import { kebabCaseSlugPatternSource } from "../shared/index.ts";
import type {
  CommitPendingChangesInput,
  ManagedDocumentPathInfo,
  PushPendingChangesInput,
} from "../types/index.ts";

/**
 * Supported managed-doc commit scopes used in commit messages.
 */
const CommitScopeValues = [
  "session",
  "verification",
  "provider",
  "decision",
  "runbook",
  "canonical",
  "work-item",
  "archive",
  "mixed",
] as const;

/**
 * Supported managed-doc commit scope.
 */
type CommitScope =
  typeof CommitScopeValues[number];

/**
 * Managed path metadata collected from pending git changes.
 */
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

/**
 * Normalizes the selected project slug for one managed commit request.
 */
const normalizeCommitProject = (project: string): string => {
  const normalizedProject = project.trim();
  if (!normalizedProject) {
    throw new Error("Commit project must not be empty");
  }

  if (!new RegExp(`^${kebabCaseSlugPatternSource}$`).test(normalizedProject)) {
    throw new Error(`Commit project must be a kebab-case slug: ${normalizedProject}`);
  }

  return normalizedProject;
};

/**
 * Normalizes the free-text summary used to build one commit subject.
 */
const normalizeCommitSummary = (summary: string): string => {
  const normalizedSummary = summary.trim();
  if (!normalizedSummary) {
    throw new Error("Commit summary must not be empty");
  }

  if (/[\r\n]/.test(normalizedSummary)) {
    throw new Error("Commit summary must be a single line");
  }

  return normalizedSummary;
};

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

/**
 * Reads one git line-list command and normalizes blank output to an empty array.
 */
const readGitLineList = (args: string[], cwd: string): string[] => {
  const output = runGit(args, cwd);
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

/**
 * Collects changed managed-document candidate paths from tracked and untracked git state.
 */
const collectChangedPaths = (cwd: string): string[] => {
  const changedPaths = new Set<string>();
  const gitCommands = [
    ["diff", "--name-only", "--", "projects", "archives"],
    ["diff", "--cached", "--name-only", "--", "projects", "archives"],
    ["ls-files", "--others", "--exclude-standard", "--", "projects", "archives"],
  ];

  for (const command of gitCommands) {
    for (const changedPath of readGitLineList(command, cwd)) {
      changedPaths.add(path.normalize(changedPath));
    }
  }

  return [...changedPaths];
};

/**
 * Infers the commit scope for one approved managed-path batch.
 */
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

  const unsupportedType: never = documentType;
  throw new Error(`Unsupported document type for commit scope inference: ${unsupportedType}`);
};

/**
 * Collects managed document paths eligible for one project-aware commit.
 */
const collectApprovedManagedPaths = (cwd: string, project: string): EligibleManagedPath[] => {
  return collectChangedPaths(cwd)
    .filter((changedPath) => {
      return isManagedDocumentRelativePath(changedPath);
    })
    .map((relativePath) => {
      return {
        relativePath,
        ...resolveManagedDocumentPathInfo(relativePath),
      };
    })
    .filter((approvedPath) => {
      return approvedPath.project === project;
    });
};

/**
 * Builds the commit subject for one managed-document commit batch.
 */
const buildCommitMessage = (
  approvedPaths: EligibleManagedPath[],
  project: string,
  summary: string,
): string => {
  const target: CommitTarget = {
    project,
    scope: inferCommitScope(approvedPaths),
  };
  return `docs(${target.project}/${target.scope}): ${summary}`;
};

/**
 * Stages approved managed documents and creates one git commit.
 */
export const commitPendingChanges = (
  input: CommitPendingChangesInput,
  context = createRepositoryContext(),
): { message: string; committedPaths: string[] } => {
  const project = normalizeCommitProject(input.project);
  const summary = normalizeCommitSummary(input.summary);
  const approvedPaths = collectApprovedManagedPaths(context.memoryRootDir, project);

  if (approvedPaths.length === 0) {
    throw new Error(`No approved document changes are available for project ${project}`);
  }

  const message = buildCommitMessage(approvedPaths, project, summary);
  const approvedRelativePaths = approvedPaths.map((approvedPath) => approvedPath.relativePath);

  runGit(["add", "--", ...approvedRelativePaths], context.memoryRootDir);

  const staged = readGitLineList(
    ["diff", "--cached", "--name-only", "--", ...approvedRelativePaths],
    context.memoryRootDir,
  );

  if (staged.length === 0) {
    throw new Error("No approved document changes are staged for commit");
  }

  runGit(
    ["commit", "-m", message, "--only", "--", ...approvedRelativePaths],
    context.memoryRootDir,
  );

  return {
    message,
    committedPaths: staged.map((entry) => path.normalize(entry)),
  };
};

/**
 * Pushes the current memory-repo branch to one configured remote.
 */
export const pushPendingChanges = (
  input: PushPendingChangesInput = {},
  context = createRepositoryContext(),
): { remote: string; branch: string; currentBranch: string } => {
  const remote = input.remote?.trim() || "origin";
  const currentBranch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], context.memoryRootDir);
  if (currentBranch === "HEAD") {
    throw new Error("Cannot push pending changes from a detached HEAD; check out a branch first");
  }

  const branch = input.branch?.trim() || currentBranch;
  if (!branch) {
    throw new Error("Push branch must not be empty");
  }

  const configuredRemotes = readGitLineList(["remote"], context.memoryRootDir);
  if (!configuredRemotes.includes(remote)) {
    throw new Error(`Remote ${remote} is not configured for the memory repository`);
  }

  const pushRef = branch === currentBranch ? branch : `HEAD:${branch}`;
  runGit(["push", remote, pushRef], context.memoryRootDir);

  return {
    remote,
    branch,
    currentBranch,
  };
};
