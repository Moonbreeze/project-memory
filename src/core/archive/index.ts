import fs from "node:fs";
import path from "node:path";

import { createRepositoryContext } from "../config/index.ts";
import { readDocument } from "../documents/index.ts";
import type { ArchiveDocumentInput, ParsedDocument } from "../types/index.ts";

/**
 * Maps an active project document path to its archive path.
 */
const archiveRelativePath = (relativePath: string): string => {
  const normalized = relativePath.split(path.sep).join("/");
  if (!normalized.startsWith("projects/")) {
    throw new Error("Only active project documents can be archived");
  }

  if (!normalized.includes("/session-log/") && !normalized.includes("/verification/")) {
    throw new Error("Only session notes and verification results can be archived in the MVP");
  }

  return normalized.replace(/^projects\//, "archives/");
};

/**
 * Returns `true` when an unknown error exposes a Node.js errno code.
 */
const isErrnoException = (error: unknown): error is NodeJS.ErrnoException => {
  return error instanceof Error && "code" in error;
};

/**
 * Moves one active document into the archive tree.
 */
export const archiveDocument = (
  input: ArchiveDocumentInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const sourcePath = path.join(context.memoryRootDir, input.relativePath);
  const targetRelativePath = archiveRelativePath(input.relativePath);
  const targetPath = path.join(context.memoryRootDir, targetRelativePath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Document does not exist: ${input.relativePath}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (error) {
    if (!isErrnoException(error) || error.code !== "EXDEV") {
      throw error;
    }

    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  }

  return readDocument(context, targetRelativePath);
};

/**
 * Resolves the target archive path for one active document path.
 */
export const resolveArchiveRelativePath = (relativePath: string): string => {
  return archiveRelativePath(relativePath);
};
