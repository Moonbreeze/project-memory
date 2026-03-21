import fs from "node:fs";
import path from "node:path";

import { sortRelativePathsByDocumentTimeline } from "../documents/index.ts";
import { isRecord } from "../shared/index.ts";
import { ReservedTaxonomyRegistryScope } from "../taxonomy/index.ts";
import type { RepositoryContext } from "../types/index.ts";

import type { DatedDirectoryShape, PathMatchMode } from "./types.ts";

/**
 * Returns `true` when one caught error represents a missing file on disk.
 */
export const isMissingFileError = (error: unknown): boolean => {
  return isRecord(error) && error.code === "ENOENT";
};

/**
 * Returns `true` when the candidate path exists on disk as a file.
 */
export const hasFile = (absolutePath: string): boolean => {
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
};

/**
 * Returns sorted directory entries for one absolute directory path.
 */
const readSortedEntries = (
  absoluteDir: string,
  order: "asc" | "desc" = "asc",
): fs.Dirent[] => {
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  return fs
    .readdirSync(absoluteDir, { withFileTypes: true })
    .sort((left, right) =>
      order === "asc"
        ? left.name.localeCompare(right.name)
        : right.name.localeCompare(left.name),
    );
};

/**
 * Collects bounded candidate paths from a single-level topic directory.
 */
export const collectFlatTopicPaths = (
  context: RepositoryContext,
  project: string,
  directoryName: "runbooks" | "provider-notes",
  topic: string,
  limit: number,
  matchMode: PathMatchMode,
): string[] => {
  const absoluteDir = path.join(context.projectsDir, project, directoryName);
  const relativeDir = path.join("projects", project, directoryName);

  if (matchMode === "exact") {
    const relativePath = path.join(relativeDir, `${topic}.md`);
    return hasFile(path.join(context.memoryRootDir, relativePath)) ? [relativePath] : [];
  }

  const matches: string[] = [];
  for (const entry of readSortedEntries(absoluteDir)) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const topicSlug = entry.name.slice(0, -3);
    if (matchMode === "contains" && !topicSlug.includes(topic)) {
      continue;
    }

    matches.push(path.join(relativeDir, entry.name));
    if (matches.length === limit) {
      break;
    }
  }

  return matches;
};

/**
 * Collects bounded canonical-doc candidates using scope directories.
 */
export const collectCanonicalDocPaths = (
  context: RepositoryContext,
  project: string,
  topic: string,
  limit: number,
  matchMode: PathMatchMode,
): string[] => {
  const absoluteRoot = path.join(context.projectsDir, project, "canonical-docs");
  const relativeRoot = path.join("projects", project, "canonical-docs");
  const matches: string[] = [];

  for (const scopeEntry of readSortedEntries(absoluteRoot)) {
    if (!scopeEntry.isDirectory()) {
      continue;
    }

    const absoluteScopeDir = path.join(absoluteRoot, scopeEntry.name);
    const relativeScopeDir = path.join(relativeRoot, scopeEntry.name);

    if (matchMode === "exact") {
      const relativePath = path.join(relativeScopeDir, `${topic}.md`);
      if (hasFile(path.join(context.memoryRootDir, relativePath))) {
        matches.push(relativePath);
      }
    } else {
      for (const fileEntry of readSortedEntries(absoluteScopeDir)) {
        if (!fileEntry.isFile() || !fileEntry.name.endsWith(".md")) {
          continue;
        }

        const topicSlug = fileEntry.name.slice(0, -3);
        if (matchMode === "contains" && !topicSlug.includes(topic)) {
          continue;
        }

        matches.push(path.join(relativeScopeDir, fileEntry.name));
        if (matches.length === limit) {
          return matches;
        }
      }
    }

    if (matches.length === limit) {
      return matches;
    }
  }

  return matches;
};

/**
 * Removes the reserved taxonomy registry control-plane doc from cold-start current-truth reads.
 */
export const filterColdStartCanonicalPaths = (candidatePaths: string[]): string[] => {
  return candidatePaths.filter((candidatePath) => {
    return !candidatePath.includes(`/canonical-docs/${ReservedTaxonomyRegistryScope}/`);
  });
};

/**
 * Collects bounded candidates from dated document directories.
 */
export const collectDatedTopicPaths = (
  context: RepositoryContext,
  project: string,
  directoryName: "decisions" | "verification" | "session-log",
  topic: string,
  limit: number,
  matchMode: PathMatchMode,
  shape: DatedDirectoryShape,
): string[] => {
  const absoluteRoot = path.join(context.projectsDir, project, directoryName);
  const relativeRoot = path.join("projects", project, directoryName);
  const matches: string[] = [];

  const pushMatch = (relativePath: string): boolean => {
    matches.push(relativePath);
    return matches.length === limit;
  };

  const processFileEntries = (absoluteDir: string, relativeDir: string): boolean => {
    for (const fileEntry of readSortedEntries(absoluteDir, "desc")) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith(".md")) {
        continue;
      }

      const topicSlug = fileEntry.name.replace(/^\d{4}-\d{2}-\d{2}-/, "").slice(0, -3);
      if (matchMode === "exact" && topicSlug !== topic) {
        continue;
      }

      if (matchMode === "contains" && !topicSlug.includes(topic)) {
        continue;
      }

      if (pushMatch(path.join(relativeDir, fileEntry.name))) {
        return true;
      }
    }

    return false;
  };

  for (const yearEntry of readSortedEntries(absoluteRoot, "desc")) {
    if (!yearEntry.isDirectory()) {
      continue;
    }

    const absoluteYearDir = path.join(absoluteRoot, yearEntry.name);
    const relativeYearDir = path.join(relativeRoot, yearEntry.name);

    if (shape === "flat") {
      if (processFileEntries(absoluteYearDir, relativeYearDir)) {
        return matches;
      }

      continue;
    }

    for (const monthEntry of readSortedEntries(absoluteYearDir, "desc")) {
      if (!monthEntry.isDirectory()) {
        continue;
      }

      const absoluteMonthDir = path.join(absoluteYearDir, monthEntry.name);
      const relativeMonthDir = path.join(relativeYearDir, monthEntry.name);
      if (processFileEntries(absoluteMonthDir, relativeMonthDir)) {
        return matches;
      }
    }
  }

  return matches;
};

/**
 * Collects all dated work-item paths for one project in newest-first path order.
 */
export const collectProjectWorkItemPaths = (
  context: RepositoryContext,
  project: string,
): string[] => {
  const absoluteRoot = path.join(context.projectsDir, project, "work-items");
  const relativeRoot = path.join("projects", project, "work-items");
  const matches: string[] = [];

  for (const yearEntry of readSortedEntries(absoluteRoot, "desc")) {
    if (!yearEntry.isDirectory()) {
      continue;
    }

    const absoluteYearDir = path.join(absoluteRoot, yearEntry.name);
    const relativeYearDir = path.join(relativeRoot, yearEntry.name);
    for (const fileEntry of readSortedEntries(absoluteYearDir, "desc")) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith(".md")) {
        continue;
      }

      matches.push(path.join(relativeYearDir, fileEntry.name));
    }
  }

  return matches;
};

/**
 * Collects bounded dated candidate paths and reorders them by document timeline.
 */
export const collectTimelineOrderedDatedTopicPaths = (
  context: RepositoryContext,
  project: string,
  directoryName: "decisions" | "verification" | "session-log",
  topic: string,
  limit: number,
  matchMode: PathMatchMode,
  shape: DatedDirectoryShape,
): string[] => {
  return sortRelativePathsByDocumentTimeline(
    context,
    collectDatedTopicPaths(context, project, directoryName, topic, limit, matchMode, shape),
  );
};
