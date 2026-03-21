import {
  BoundedReadEntrypoint as BoundedReadEntrypointValues,
  BoundedReadStrategy as BoundedReadStrategyValues,
  DocumentSource as DocumentSourceValues,
  DocumentStatus as DocumentStatusValues,
  DocumentType as DocumentTypeValues,
  FrontmatterKey as FrontmatterKeyValues,
  ListDocumentsPreset as ListDocumentsPresetValues,
  ListDocumentsSortField as ListDocumentsSortFieldValues,
  StableGuidanceReview as StableGuidanceReviewValues,
  SortOrder as SortOrderValues,
} from "./constants.ts";
import { isLiteralMember } from "../shared/index.ts";
import type { WorkItemState } from "../workItems/types.ts";

/**
 * A supported project-memory document kind.
 */
export type DocumentType = typeof DocumentTypeValues[number];

/**
 * A supported bounded-read entrypoint.
 */
export type BoundedReadEntrypoint = typeof BoundedReadEntrypointValues[number];

/**
 * A supported bounded-read selection strategy.
 */
export type BoundedReadStrategy = typeof BoundedReadStrategyValues[number];

/**
 * A supported project-memory document source.
 */
export type DocumentSource = typeof DocumentSourceValues[number];

/**
 * A supported project-memory document lifecycle status.
 */
export type DocumentStatus = typeof DocumentStatusValues[number];

/**
 * A supported stable-guidance review outcome for decision writes.
 */
export type StableGuidanceReview = typeof StableGuidanceReviewValues[number];

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
  /** Optional UTC ISO 8601 timeline timestamp for intra-day ordering. */
  recorded_at?: string;
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
  /** Optional work-item lifecycle state stored only on work-item documents. */
  work_item_state?: WorkItemState;
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
 * Diagnostic returned when one managed document is skipped during a mass-read flow.
 */
export type InvalidDocumentDiagnostic = {
  /** Repository-relative path that could not be read successfully. */
  relativePath: string;
  /** Document kind inferred from the managed path. */
  documentType: DocumentType;
  /** Validation or parse error raised while reading the document. */
  message: string;
};

/**
 * Parsed layout details for one managed document path.
 */
export type ManagedDocumentPathInfo = {
  /** Project slug inferred from the managed path. */
  project: string;
  /** Inferred managed document kind. */
  type: DocumentType;
  /** Indicates whether the path lives under `archives/`. */
  archived: boolean;
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
  /** Optional explicit UTC ISO 8601 timeline timestamp. */
  recordedAt?: string;
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
  /**
   * Explicit stable-guidance review outcome for non-draft decisions.
   *
   * Draft decisions are idea-inbox records and do not require this field.
   */
  stableGuidanceReview?: StableGuidanceReview;
  /**
   * Optional note explaining the stable-guidance review outcome.
   *
   * Required when the outcome defers a stable-guidance update or uses the
   * bootstrap exemption.
   */
  stableGuidanceReviewNote?: string;
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
 * Input required to read one bounded cold-start snapshot.
 */
export type ColdStartInput = {
  /** Target project slug. */
  project: string;
};

/**
 * Input required to read one bounded planning backlog snapshot.
 */
export type PlanningBacklogInput = {
  /** Target project slug. */
  project: string;
};

/**
 * Input required to read one bounded exact-topic planning entry.
 */
export type PlanningTopicEntryInput = {
  /** Target project slug. */
  project: string;
  /** Requested topic label or slug. */
  topic: string;
};

/**
 * Input required to read one bounded topic entry.
 */
export type TopicEntryInput = {
  /** Target project slug. */
  project: string;
  /** Requested topic label or slug. */
  topic: string;
};

/**
 * Input required to read one bounded rationale entry.
 */
export type RationaleEntryInput = {
  /** Target project slug. */
  project: string;
  /** Requested topic label or slug. */
  topic: string;
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
  /** Optional derived planning state for listed work-item documents. */
  planningState?: string;
  /** Optional total dependency count for listed work-item documents. */
  dependencyCount?: number;
  /** Optional unresolved dependency count for listed work-item documents. */
  unresolvedDependencyCount?: number;
};

/**
 * Structured list-documents result.
 */
export type ListDocumentsResult = {
  /** Documents matching the normalized query. */
  documents: ListedDocument[];
  /** Effective query after presets and defaults are applied. */
  appliedQuery: AppliedListDocumentsQuery;
  /** Invalid managed documents skipped during the mass-read aggregation. */
  invalidDocuments: InvalidDocumentDiagnostic[];
};

/**
 * Search hit with a short excerpt.
 */
export type SearchResult = ParsedDocument & {
  /** Matched excerpt extracted from the body. */
  excerpt: string;
};

/**
 * One bounded-read selection stage and the documents it returned.
 */
export type BoundedReadStage = {
  /** Stable stage label describing the selection step. */
  name: string;
  /** Document kind targeted by this stage. */
  documentType: DocumentType;
  /**
   * Reporting-only selection label for explainability.
   *
   * The actual stage behavior is determined upstream by how candidate paths are
   * constructed before the stage is read.
   */
  strategy: BoundedReadStrategy;
  /** Hard document limit for this stage. */
  limit: number;
  /** Short human-readable explanation of the stage purpose. */
  description: string;
  /** Repository-relative paths returned by this stage in read order. */
  relativePaths: string[];
};

/**
 * One dependency surface returned for bounded planning explainability.
 */
export type BoundedReadDependencySurface = {
  /** Repository-relative path of the dependency target. */
  relativePath: string;
  /** Indicates whether the dependency currently resolves to a done work item. */
  resolved: boolean;
};

/**
 * Planning explainability returned for one bounded-read work-item document.
 */
export type BoundedReadPlanningExplainability = {
  /** Repository-relative path of the selected work-item document. */
  relativePath: string;
  /** Derived planning state attached to the work item. */
  planningState: string;
  /** Total declared dependency count on the work item. */
  dependencyCount: number;
  /** Count of dependencies that are still unresolved. */
  unresolvedDependencyCount: number;
  /** Explicit dependency surfaces in the stored document order. */
  dependencySurfaces: BoundedReadDependencySurface[];
};

/**
 * Structured result for one bounded read entrypoint.
 */
export type BoundedReadResult = {
  /** Entrypoint that produced this bounded read package. */
  entrypoint: BoundedReadEntrypoint;
  /** Target project slug. */
  project: string;
  /** Optional requested topic slug. */
  topic?: string;
  /** Bounded documents returned in the final read order. */
  documents: ParsedDocument[];
  /** Selection stages attempted by the entrypoint. */
  stages: BoundedReadStage[];
  /** Optional work-item planning explainability for returned documents. */
  planningExplainability?: BoundedReadPlanningExplainability[];
  /** Invalid managed documents skipped during the bounded aggregation. */
  invalidDocuments: InvalidDocumentDiagnostic[];
  /** Notes describing fallbacks or intentional omissions. */
  notes: string[];
};

/**
 * Input used to commit staged project-memory changes.
 */
export type CommitPendingChangesInput = {
  /** Target project whose pending managed-document changes should be committed. */
  project: string;
  /** Free-text one-line summary appended after the generated `docs(<project>/<scope>):` prefix. */
  summary: string;
};

/**
 * Input used to push committed project-memory changes to a remote.
 */
export type PushPendingChangesInput = {
  /** Optional remote name; defaults to `origin`. */
  remote?: string;
  /** Optional remote branch name; defaults to the current local branch. */
  branch?: string;
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
 * Returns `true` when `value` is a supported document kind.
 */
export const isDocumentType = (value: unknown): value is DocumentType => {
  return isLiteralMember(DocumentTypeValues, value);
};

/**
 * Returns `true` when `value` is a supported bounded-read entrypoint.
 */
export const isBoundedReadEntrypoint = (
  value: unknown,
): value is BoundedReadEntrypoint => {
  return isLiteralMember(BoundedReadEntrypointValues, value);
};

/**
 * Returns `true` when `value` is a supported bounded-read selection strategy.
 */
export const isBoundedReadStrategy = (
  value: unknown,
): value is BoundedReadStrategy => {
  return isLiteralMember(BoundedReadStrategyValues, value);
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
 * Returns `true` when `value` is a supported stable-guidance review outcome.
 */
export const isStableGuidanceReview = (
  value: unknown,
): value is StableGuidanceReview => {
  return isLiteralMember(StableGuidanceReviewValues, value);
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
