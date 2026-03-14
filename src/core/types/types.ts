import {
  DocumentSource as DocumentSourceValues,
  DocumentStatus as DocumentStatusValues,
  DocumentType as DocumentTypeValues,
  FrontmatterKey as FrontmatterKeyValues,
  ListDocumentsPreset as ListDocumentsPresetValues,
  ListDocumentsSortField as ListDocumentsSortFieldValues,
  SortOrder as SortOrderValues,
} from "./constants.ts";

/**
 * A supported project-memory document kind.
 */
export type DocumentType = typeof DocumentTypeValues[number];

/**
 * A supported project-memory document source.
 */
export type DocumentSource = typeof DocumentSourceValues[number];

/**
 * A supported project-memory document lifecycle status.
 */
export type DocumentStatus = typeof DocumentStatusValues[number];

/**
 * A supported list-documents preset.
 */
export type ListDocumentsPreset = typeof ListDocumentsPresetValues[number];

/**
 * A supported list-documents sort field.
 */
export type ListDocumentsSortField = typeof ListDocumentsSortFieldValues[number];

/**
 * A supported ascending or descending sort order.
 */
export type SortOrder = typeof SortOrderValues[number];

/**
 * A supported top-level frontmatter field.
 */
export type FrontmatterKey = typeof FrontmatterKeyValues[number];

/**
 * Structured metadata stored in Markdown frontmatter.
 */
export type Frontmatter = {
  /** Document date in `YYYY-MM-DD` format. */
  date: string;
  /** Project slug owning the document. */
  project: string;
  /** Document topic slug. */
  topic: string;
  /** Optional taxonomy-registry scope slug for canonical docs. */
  registry_scope?: string;
  /** Source that produced the document. */
  source: DocumentSource;
  /** Current document lifecycle status. */
  status: DocumentStatus;
};

/**
 * Parsed Markdown document with validated metadata.
 */
export type ParsedDocument = {
  /** Absolute path on disk. */
  path: string;
  /** Repository-relative path. */
  relativePath: string;
  /** Inferred document kind. */
  type: DocumentType;
  /** Validated frontmatter metadata. */
  metadata: Frontmatter;
  /** Markdown body without frontmatter. */
  body: string;
};

/**
 * Optional root overrides used to build one repository context.
 */
export type RepositoryContextOptions = {
  /** Absolute or relative tool repository root. */
  toolRootDir?: string;
  /** Absolute or relative memory repository root. */
  memoryRootDir?: string;
};

/**
 * Repository paths and runtime limits used by shared core modules.
 */
export type RepositoryContext = {
  /** Absolute tool repository root. */
  toolRootDir: string;
  /** Absolute memory repository root. */
  memoryRootDir: string;
  /** Absolute active-project directory inside the memory repository. */
  projectsDir: string;
  /** Absolute archive directory inside the memory repository. */
  archivesDir: string;
  /** Absolute template directory inside the tool repository. */
  templatesDir: string;
  /** Allowed source values. */
  allowedSources: DocumentSource[];
  /** Allowed status values. */
  allowedStatuses: DocumentStatus[];
  /** Maximum allowed document size in bytes. */
  maxDocumentBytes: number;
};

/**
 * Shared fields used by document creation commands.
 */
export type CreateDocumentInput = {
  /** Target project slug. */
  project: string;
  /** Topic label or slug. */
  topic: string;
  /** Optional explicit date in `YYYY-MM-DD` format. */
  date?: string;
  /** Optional explicit document source. */
  source?: DocumentSource;
  /** Optional explicit document status. */
  status?: DocumentStatus;
};

/**
 * Input required to append a session note.
 */
export type SessionNoteInput = CreateDocumentInput & {
  /** High-level session summary. */
  summary: string;
  /** Concrete actions performed during the session. */
  actions: string[];
  /** Follow-up tasks left after the session. */
  followUp: string[];
};

/**
 * Input required to record a verification result.
 */
export type VerificationResultInput = CreateDocumentInput & {
  /** Verification scope or target. */
  scope: string;
  /** Verification steps that were executed. */
  steps: string[];
  /** Final verification outcome. */
  result: string;
};

/**
 * Input required to upsert a provider note.
 */
export type ProviderNoteInput = CreateDocumentInput & {
  /** Provider identifier used for file naming. */
  provider: string;
  /** Short provider overview. */
  overview: string;
  /** Known provider constraints. */
  constraints: string[];
  /** Guidance for future work with the provider. */
  guidance: string[];
};

/**
 * Input required to create a decision record.
 */
export type DecisionInput = CreateDocumentInput & {
  /** Background and decision context. */
  context: string;
  /** Final decision statement. */
  decision: string;
  /** Consequences of the decision. */
  consequences: string[];
};

/**
 * Input required to create a runbook.
 */
export type RunbookInput = CreateDocumentInput & {
  /** Runbook purpose. */
  purpose: string;
  /** Step-by-step procedure. */
  procedure: string[];
  /** Verification steps for the runbook. */
  verification: string[];
};

/**
 * Input required to upsert one canonical document.
 */
export type CanonicalDocInput = CreateDocumentInput & {
  /** Declared taxonomy-registry scope slug owning this canonical doc. */
  registryScope: string;
  /** High-level summary of the canonical guidance. */
  summary: string;
  /** Canonical guidance points for the scoped topic. */
  guidance: string[];
  /** Supporting references or follow-on links. */
  references: string[];
};

/**
 * Query used for listing or searching active documents.
 */
export type SearchQuery = {
  /** Optional project slug filter. */
  project?: string;
  /** Optional full-text search term. */
  text?: string;
  /** Optional document kind filter. */
  type?: DocumentType;
  /** Optional result limit. */
  limit?: number;
};

/**
 * One explicit list-documents query received from a caller.
 */
export type ListDocumentsQuery = {
  /** Optional project slug filter. */
  project?: string;
  /** Optional document kind filter. */
  type?: DocumentType;
  /** Optional exact lifecycle status filter. */
  status?: DocumentStatus;
  /** Optional statuses to exclude. */
  excludeStatuses?: DocumentStatus[];
  /** Optional list preset name. */
  preset?: ListDocumentsPreset;
  /** Optional sort field. */
  sort?: ListDocumentsSortField;
  /** Optional sort order. */
  order?: SortOrder;
  /** Optional result limit. */
  limit?: number;
  /** Includes Markdown bodies when `true`. */
  includeBody?: boolean;
};

/**
 * One normalized list-documents query after presets and defaults are applied.
 */
export type AppliedListDocumentsQuery = {
  /** Optional project slug filter. */
  project?: string;
  /** Optional document kind filter. */
  type?: DocumentType;
  /** Optional exact lifecycle status filter. */
  status?: DocumentStatus;
  /** Optional statuses excluded from the result. */
  excludeStatuses?: DocumentStatus[];
  /** Optional list preset name. */
  preset?: ListDocumentsPreset;
  /** Final sort field. */
  sort: ListDocumentsSortField;
  /** Final sort order. */
  order: SortOrder;
  /** Final result limit. */
  limit: number;
  /** Final body-inclusion flag. */
  includeBody: boolean;
};

/**
 * One document returned by list-documents.
 */
export type ListedDocument = Omit<ParsedDocument, "body"> & {
  /** Optional Markdown body, included only when explicitly requested. */
  body?: string;
};

/**
 * Structured list-documents result.
 */
export type ListDocumentsResult = {
  /** Documents matching the normalized query. */
  documents: ListedDocument[];
  /** Effective query after presets and defaults are applied. */
  appliedQuery: AppliedListDocumentsQuery;
};

/**
 * Search hit with a short excerpt.
 */
export type SearchResult = ParsedDocument & {
  /** Matched excerpt extracted from the body. */
  excerpt: string;
};

/**
 * Input used to commit staged project-memory changes.
 */
export type CommitPendingChangesInput = {
  /** Commit message to use for the git commit. */
  message: string;
};

/**
 * Input used to archive one active document.
 */
export type ArchiveDocumentInput = {
  /** Repository-relative path of the source document. */
  relativePath: string;
};

/**
 * Validation result returned by shared validators.
 */
export type ValidationResult =
  | {
      /** Indicates the validation succeeded. */
      ok: true;
    }
  | {
      /** Indicates the validation failed. */
      ok: false;
      /** Human-readable validation failures. */
      errors: string[];
    };

/**
 * Checks whether an unknown value belongs to a literal string set.
 */
const isLiteralMember = <T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] => {
  return typeof value === "string" && values.includes(value);
};

/**
 * Returns `true` when `value` is a supported document kind.
 */
export const isDocumentType = (value: unknown): value is DocumentType => {
  return isLiteralMember(DocumentTypeValues, value);
};

/**
 * Returns `true` when `value` is a supported document source.
 */
export const isDocumentSource = (value: unknown): value is DocumentSource => {
  return isLiteralMember(DocumentSourceValues, value);
};

/**
 * Returns `true` when `value` is a supported document status.
 */
export const isDocumentStatus = (value: unknown): value is DocumentStatus => {
  return isLiteralMember(DocumentStatusValues, value);
};

/**
 * Returns `true` when `value` is a supported list-documents preset.
 */
export const isListDocumentsPreset = (value: unknown): value is ListDocumentsPreset => {
  return isLiteralMember(ListDocumentsPresetValues, value);
};

/**
 * Returns `true` when `value` is a supported list-documents sort field.
 */
export const isListDocumentsSortField = (value: unknown): value is ListDocumentsSortField => {
  return isLiteralMember(ListDocumentsSortFieldValues, value);
};

/**
 * Returns `true` when `value` is a supported sort order.
 */
export const isSortOrder = (value: unknown): value is SortOrder => {
  return isLiteralMember(SortOrderValues, value);
};

/**
 * Returns `true` when `value` is a supported frontmatter key.
 */
export const isFrontmatterKey = (value: unknown): value is FrontmatterKey => {
  return isLiteralMember(FrontmatterKeyValues, value);
};
