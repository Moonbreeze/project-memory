import path from "node:path";

import {
  isoDatePatternSource,
  kebabCaseSlugPatternSource,
} from "../shared/index.ts";
import { isDocumentType } from "../types/index.ts";
import type { DocumentType, ManagedDocumentPathInfo } from "../types/index.ts";

/**
 * One path-pattern rule used to classify managed document paths.
 */
type DocumentPathPattern = {
  type: DocumentType;
  archived: boolean;
  pattern: RegExp;
};

const yearPattern = "\\d{4}";
const monthPattern = "\\d{2}";

/**
 * Builds the document-classification regex for one repository subtree.
 */
const docPattern = (root: string, rest: string): RegExp => {
  return new RegExp(`^${root}\\/${kebabCaseSlugPatternSource}\\/${rest}\\.md$`);
};

const documentPathPatterns: DocumentPathPattern[] = [
  {
    type: "session-note",
    archived: false,
    pattern: docPattern(
      "projects",
      `session-log\\/${yearPattern}\\/${monthPattern}\\/${isoDatePatternSource}-${kebabCaseSlugPatternSource}`,
    ),
  },
  {
    type: "verification-result",
    archived: false,
    pattern: docPattern(
      "projects",
      `verification\\/${yearPattern}\\/${isoDatePatternSource}-${kebabCaseSlugPatternSource}`,
    ),
  },
  {
    type: "provider-note",
    archived: false,
    pattern: docPattern("projects", `provider-notes\\/${kebabCaseSlugPatternSource}`),
  },
  {
    type: "decision",
    archived: false,
    pattern: docPattern(
      "projects",
      `decisions\\/${yearPattern}\\/${isoDatePatternSource}-${kebabCaseSlugPatternSource}`,
    ),
  },
  {
    type: "runbook",
    archived: false,
    pattern: docPattern("projects", `runbooks\\/${kebabCaseSlugPatternSource}`),
  },
  {
    type: "canonical-doc",
    archived: false,
    pattern: docPattern(
      "projects",
      `canonical-docs\\/${kebabCaseSlugPatternSource}\\/${kebabCaseSlugPatternSource}`,
    ),
  },
  {
    type: "work-item",
    archived: false,
    pattern: docPattern(
      "projects",
      `work-items\\/${yearPattern}\\/${isoDatePatternSource}-${kebabCaseSlugPatternSource}`,
    ),
  },
  {
    type: "session-note",
    archived: true,
    pattern: docPattern(
      "archives",
      `session-log\\/${yearPattern}\\/${monthPattern}\\/${isoDatePatternSource}-${kebabCaseSlugPatternSource}`,
    ),
  },
  {
    type: "verification-result",
    archived: true,
    pattern: docPattern(
      "archives",
      `verification\\/${yearPattern}\\/${isoDatePatternSource}-${kebabCaseSlugPatternSource}`,
    ),
  },
];

/**
 * Converts an arbitrary label into a filesystem-safe slug.
 */
const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
};

/**
 * Converts a repository-relative path to POSIX separators.
 */
const normalizeRelativePath = (relativePath: string): string => {
  return relativePath.split(path.sep).join("/");
};

/**
 * Matches one repository-relative path against the managed document layout.
 */
const matchDocumentPath = (relativePath: string): DocumentPathPattern | undefined => {
  const normalized = normalizeRelativePath(relativePath);
  return documentPathPatterns.find(({ pattern }) => pattern.test(normalized));
};

/**
 * Resolves the repository-relative path for a document kind.
 */
const relativePathForType = (
  project: string,
  type: DocumentType,
  topic: string,
  date: string,
  options: {
    provider?: string;
    registryScope?: string;
  } = {},
): string => {
  const [year, month] = date.split("-");
  const topicSlug = ensureSlug(topic, "Topic");

  switch (type) {
    case "session-note":
      return path.join("projects", project, "session-log", year, month, `${date}-${topicSlug}.md`);
    case "verification-result":
      return path.join("projects", project, "verification", year, `${date}-${topicSlug}.md`);
    case "provider-note":
      return path.join(
        "projects",
        project,
        "provider-notes",
        `${ensureSlug(options.provider ?? topic, "Provider")}.md`,
      );
    case "decision":
      return path.join("projects", project, "decisions", year, `${date}-${topicSlug}.md`);
    case "runbook":
      return path.join("projects", project, "runbooks", `${topicSlug}.md`);
    case "canonical-doc":
      return path.join(
        "projects",
        project,
        "canonical-docs",
        ensureSlug(options.registryScope ?? "", "registryScope"),
        `${topicSlug}.md`,
      );
    case "work-item":
      return path.join("projects", project, "work-items", year, `${date}-${topicSlug}.md`);
  }
};

/**
 * Returns the current UTC date formatted as `YYYY-MM-DD`.
 */
export const currentDate = (): string => {
  return new Date().toISOString().slice(0, 10);
};

/**
 * Normalizes one slug-like label and rejects empty results.
 */
export const ensureSlug = (value: string, fieldName: string): string => {
  const normalized = slugify(value);
  if (!normalized) {
    throw new Error(`${fieldName} must not be empty`);
  }

  return normalized;
};

/**
 * Normalizes and validates a project slug candidate.
 */
export const ensureKebabCaseProject = (project: string): string => {
  return ensureSlug(project, "Project");
};

/**
 * Infers the document kind from a stored repository-relative path.
 */
export const resolveDocumentTypeFromRelativePath = (relativePath: string): DocumentType => {
  const matchedPath = matchDocumentPath(relativePath);
  if (!matchedPath) {
    throw new Error(`Unsupported document path: ${relativePath}`);
  }

  return matchedPath.type;
};

/**
 * Infers project, type, and archive state from one managed document path.
 */
export const resolveManagedDocumentPathInfo = (
  relativePath: string,
): ManagedDocumentPathInfo => {
  const matchedPath = matchDocumentPath(relativePath);
  if (!matchedPath) {
    throw new Error(`Unsupported document path: ${relativePath}`);
  }

  const normalized = normalizeRelativePath(relativePath);
  const [, project] = normalized.split("/");
  if (!project) {
    throw new Error(`Managed document path is missing a project slug: ${relativePath}`);
  }

  return {
    project,
    type: matchedPath.type,
    archived: matchedPath.archived,
  };
};

/**
 * Returns `true` when the path points to one supported active document.
 */
export const isActiveDocumentRelativePath = (relativePath: string): boolean => {
  const matchedPath = matchDocumentPath(relativePath);
  return matchedPath !== undefined && !matchedPath.archived;
};

/**
 * Returns `true` when the path points to one supported managed document.
 */
export const isManagedDocumentRelativePath = (relativePath: string): boolean => {
  return matchDocumentPath(relativePath) !== undefined;
};

/**
 * Resolves the repository-relative path for a document.
 */
export const resolveDocumentRelativePath = (
  project: string,
  type: DocumentType,
  topic: string,
  date = currentDate(),
  options: {
    provider?: string;
    registryScope?: string;
  } = {},
): string => {
  if (!isDocumentType(type)) {
    throw new Error(`Unsupported document type: ${String(type)}`);
  }

  return relativePathForType(ensureKebabCaseProject(project), type, topic, date, options);
};
