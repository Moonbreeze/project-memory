import fs from "node:fs";
import path from "node:path";

import { createRepositoryContext } from "../config/index.ts";
import { readDocument, resolveManagedDocumentPathInfo } from "../documents/index.ts";
import { writeDocument } from "../documents/storage.ts";
import type {
  ArchiveDocumentInput,
  DocumentType,
  Frontmatter,
  ParsedDocument,
} from "../types/index.ts";

/**
 * Returns `true` when a document type archives by moving into `archives/`.
 */
const isMoveArchivedDocumentType = (type: DocumentType): boolean => {
  return type === "session-note" || type === "verification-result";
};

/**
 * Returns `true` when a document type archives in place via `status: archived`.
 */
const isStatusArchivedDocumentType = (type: DocumentType): boolean => {
  return (
    type === "provider-note"
    || type === "decision"
    || type === "runbook"
    || type === "canonical-doc"
  );
};

/**
 * Maps an active project document path to its archive path.
 */
const archiveRelativePath = (relativePath: string): string => {
  const normalized = relativePath.split(path.sep).join("/");
  const pathInfo = resolveManagedDocumentPathInfo(normalized);

  if (pathInfo.archived) {
    throw new Error("Archived documents cannot be archived again");
  }

  if (pathInfo.type === "work-item") {
    throw new Error("Use archiveWorkItem to archive work-item documents");
  }

  if (!isMoveArchivedDocumentType(pathInfo.type)) {
    throw new Error(`${pathInfo.type} documents archive in place and do not move into archives/`);
  }

  if (!normalized.startsWith("projects/")) {
    throw new Error("Only active project documents can be archived");
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
 * Archives one managed document in place by updating its status.
 */
const archiveDocumentInPlace = (
  document: ParsedDocument,
  context: ReturnType<typeof createRepositoryContext>,
): ParsedDocument => {
  if (document.metadata.status === "archived") {
    return document;
  }

  const metadata: Frontmatter = {
    ...document.metadata,
    status: "archived",
  };

  return writeDocument(context, document.relativePath, metadata, document.body);
};

/**
 * Moves one active document into the archive tree.
 */
export const archiveDocument = (
  input: ArchiveDocumentInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const normalizedRelativePath = input.relativePath.split(path.sep).join("/");
  const pathInfo = resolveManagedDocumentPathInfo(normalizedRelativePath);

  if (pathInfo.archived) {
    throw new Error("Archived documents cannot be archived again");
  }

  if (pathInfo.type === "work-item") {
    throw new Error("Use archiveWorkItem to archive work-item documents");
  }

  if (isStatusArchivedDocumentType(pathInfo.type)) {
    const existingDocument = readDocument(context, normalizedRelativePath);
    return archiveDocumentInPlace(existingDocument, context);
  }

  const sourcePath = path.join(context.memoryRootDir, normalizedRelativePath);
  const targetRelativePath = archiveRelativePath(normalizedRelativePath);
  const targetPath = path.join(context.memoryRootDir, targetRelativePath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Document does not exist: ${normalizedRelativePath}`);
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
