/**
 * Core domain constants.
 */
export {
  DocumentSource as DocumentSourceValues,
  DocumentStatus as DocumentStatusValues,
  DocumentType as DocumentTypeValues,
  FrontmatterKey as FrontmatterKeyValues,
  RequiredFrontmatterKey,
} from "./constants.ts";

/**
 * Core domain types and type guards.
 */
export type {
  ArchiveDocumentInput,
  CommitPendingChangesInput,
  CreateDocumentInput,
  DocumentSource,
  DocumentStatus,
  DocumentType,
  Frontmatter,
  FrontmatterKey,
  ParsedDocument,
  ProviderNoteInput,
  RepositoryContext,
  RepositoryContextOptions,
  RunbookInput,
  SearchQuery,
  SearchResult,
  SessionNoteInput,
  ValidationResult,
  VerificationResultInput,
  DecisionInput,
} from "./types.ts";

/**
 * Core type guards.
 */
export {
  isDocumentSource,
  isDocumentStatus,
  isDocumentType,
  isFrontmatterKey,
} from "./types.ts";
