/**
 * Core repository configuration helpers.
 */
export { createRepositoryContext } from "./config/index.ts";

/**
 * Core document operations.
 */
export {
  appendSessionNote,
  archiveWorkItem,
  closeWorkItem,
  createDecision,
  createRunbook,
  isActiveDocumentRelativePath,
  isManagedDocumentRelativePath,
  listAllActiveDocumentPaths,
  readDocumentsSkippingInvalidWorkItems,
  readDocument,
  resolveManagedDocumentPathInfo,
  resolveDocumentTypeFromRelativePath,
  resolveDocumentRelativePath,
  recordVerificationResult,
  upsertCanonicalDoc,
  upsertWorkItem,
  upsertProviderNote,
} from "./documents/index.ts";

/**
 * Core document search operations.
 */
export { listDocuments, searchDocuments } from "./search/index.ts";

/**
 * Core bounded read entrypoints.
 */
export {
  readColdStart,
  readPlanningBacklog,
  readPlanningTopicEntry,
  readRationaleEntry,
  readTopicEntry,
} from "./boundedReads/index.ts";

/**
 * Future work-item spec helpers.
 */
export * from "./workItems/index.ts";

/**
 * Shared primitive helpers.
 */
export * from "./shared/index.ts";

/**
 * Core archive operations.
 */
export { archiveDocument, resolveArchiveRelativePath } from "./archive/index.ts";

/**
 * Core managed Web runtime operations.
 */
export * from "./webRuntime/index.ts";

/**
 * Core git operations.
 */
export { commitPendingChanges, pushPendingChanges } from "./git/index.ts";

/**
 * Core validation operations.
 */
export { validateBody, validateFrontmatter } from "./validation/index.ts";

/**
 * Core taxonomy operations.
 */
export * from "./taxonomy/index.ts";

/**
 * Core domain types and constants.
 */
export * from "./types/index.ts";
