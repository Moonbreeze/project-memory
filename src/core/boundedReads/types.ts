import type {
  BoundedReadStrategy,
  DocumentStatus,
  DocumentType,
  ParsedDocument,
} from "../types/index.ts";

/**
 * Path matching mode used while collecting bounded candidate files.
 */
export type PathMatchMode = "all" | "exact" | "contains";

/**
 * Directory layout used for dated document collections.
 */
export type DatedDirectoryShape = "flat" | "year-month";

/**
 * Selected documents returned from one bounded-read stage.
 */
export type StageDocuments = {
  /** Parsed documents selected for the stage. */
  documents: ParsedDocument[];
  /** Relative paths selected for the stage. */
  relativePaths: string[];
};

/**
 * Internal configuration for one bounded-read stage.
 *
 * Runtime selection behavior is determined by the precomputed `candidatePaths`
 * and status filters. `strategy` is reporting-only metadata that is copied into
 * the result so callers can see which bounded selection rule produced the stage.
 */
export type StageInput = {
  /** Stable stage name surfaced in the result. */
  name: string;
  /** Document type returned by the stage. */
  documentType: DocumentType;
  /** Reporting-only selection label surfaced in stage metadata. */
  strategy: BoundedReadStrategy;
  /** Maximum number of documents the stage may return. */
  limit: number;
  /** Human-readable stage description. */
  description: string;
  /** Candidate relative paths prepared upstream. */
  candidatePaths: string[];
  /** Allowed document statuses for the stage. */
  allowedStatuses: DocumentStatus[];
};
