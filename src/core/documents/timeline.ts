import fs from "node:fs";
import path from "node:path";

import type {
  Frontmatter,
  ParsedDocument,
  RepositoryContext,
  SortOrder,
} from "../types/index.ts";

import { currentDate } from "./pathLayout.ts";
import { readDocument, readDocumentFrontmatter } from "./storage.ts";

/**
 * Returns the deterministic fallback timeline timestamp for one day bucket.
 */
export const fallbackRecordedAtForDate = (date: string): string => {
  return `${date}T00:00:00.000Z`;
};

/**
 * Returns the current UTC ISO 8601 timestamp for managed document writes.
 */
export const currentRecordedAt = (): string => {
  return new Date().toISOString();
};

/**
 * Resolves the effective timeline timestamp for one document frontmatter object.
 */
export const resolveDocumentRecordedAt = (
  metadata: Pick<Frontmatter, "date" | "recorded_at">,
): string => {
  return metadata.recorded_at ?? fallbackRecordedAtForDate(metadata.date);
};

/**
 * Compares two documents using timeline-aware chronological ordering.
 */
export const compareDocumentsByTimeline = (
  left: ParsedDocument,
  right: ParsedDocument,
  order: SortOrder = "desc",
): number => {
  const ascendingFactor = order === "asc" ? 1 : -1;
  const dateComparison = left.metadata.date.localeCompare(right.metadata.date);
  if (dateComparison !== 0) {
    return dateComparison * ascendingFactor;
  }

  const recordedAtComparison =
    resolveDocumentRecordedAt(left.metadata).localeCompare(resolveDocumentRecordedAt(right.metadata));
  if (recordedAtComparison !== 0) {
    return recordedAtComparison * ascendingFactor;
  }

  return left.relativePath.localeCompare(right.relativePath) * ascendingFactor;
};

/**
 * Sorts managed relative paths by the timeline of the documents they resolve to.
 */
export const sortRelativePathsByDocumentTimeline = (
  context: RepositoryContext,
  relativePaths: string[],
  order: SortOrder = "desc",
): string[] => {
  return relativePaths
    .map((relativePath) => readDocument(context, relativePath))
    .sort((left, right) => compareDocumentsByTimeline(left, right, order))
    .map((document) => document.relativePath);
};

type ResolveRecordedAtForWriteInput = {
  context: RepositoryContext;
  relativePath: string;
  date: string;
  recordedAt?: string;
};

/**
 * Resolves the timeline timestamp that should be written for one managed document.
 */
export const resolveRecordedAtForWrite = (
  input: ResolveRecordedAtForWriteInput,
): string => {
  if (input.recordedAt) {
    return input.recordedAt;
  }

  const absolutePath = path.join(input.context.memoryRootDir, input.relativePath);
  if (fs.existsSync(absolutePath)) {
    const existingMetadata = readDocumentFrontmatter(input.context, input.relativePath);
    const existingRecordedAt = resolveDocumentRecordedAt(existingMetadata);
    if (existingRecordedAt.slice(0, 10) === input.date) {
      return existingRecordedAt;
    }
  }

  if (input.date === currentDate()) {
    return currentRecordedAt();
  }

  return fallbackRecordedAtForDate(input.date);
};
