/**
 * Core repository configuration helpers.
 */
export { createRepositoryContext } from "./config/index.ts";

/**
 * Core document operations.
 */
export {
  appendSessionNote,
  createDecision,
  createRunbook,
  isActiveDocumentRelativePath,
  isManagedDocumentRelativePath,
  listAllActiveDocumentPaths,
  readDocument,
  resolveDocumentTypeFromRelativePath,
  resolveDocumentRelativePath,
  recordVerificationResult,
  upsertProviderNote,
} from "./documents/index.ts";

/**
 * Core document search operations.
 */
export { listDocuments, searchDocuments } from "./search/index.ts";

/**
 * Core archive operations.
 */
export { archiveDocument, resolveArchiveRelativePath } from "./archive/index.ts";

/**
 * Core git operations.
 */
export { commitPendingChanges } from "./git/index.ts";

/**
 * Core validation operations.
 */
export { validateBody, validateFrontmatter } from "./validation/index.ts";

/**
 * Core domain types and constants.
 */
export * from "./types/index.ts";
