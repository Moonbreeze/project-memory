import type {
  BoundedReadEntrypoint,
  BoundedReadPlanningExplainability,
  BoundedReadStage,
  DocumentStatus,
  DocumentType,
  Frontmatter,
  InvalidDocumentDiagnostic,
  RepositoryContext,
  WorkItemPlanningState,
} from "../core/index.ts";

/**
 * Runtime configuration for the local read-only Web server.
 */
export type WebRuntimeConfig = {
  /** Network host to bind. */
  host: string;
  /** Network port to bind. */
  port: number;
  /** Shared repository context reused by the Web layer when configuration is valid. */
  context?: RepositoryContext;
  /** Optional configuration failure surfaced as a deterministic route state. */
  configurationError?: string;
};

/**
 * Minimal request shape needed by the Web route handler.
 */
export type WebRequestInput = {
  /** Optional HTTP method. */
  method?: string;
  /** Optional request URL or path. */
  url?: string;
};

/**
 * Serialized HTTP response returned by the Web route handler.
 */
export type WebResponsePayload = {
  /** Response body text. */
  body: string;
  /** Response content type. */
  contentType: string;
  /** HTTP status code. */
  statusCode: number;
};

/**
 * Raw timeline filter values received from Web route query parameters.
 */
export type WebTimelineQueryInput = {
  /** Optional project slug filter. */
  project?: string;
  /** Optional document type filter. */
  type?: string;
  /** Optional lifecycle status filter. */
  status?: string;
  /** Optional result limit. */
  limit?: string;
};

/**
 * Normalized timeline filter values accepted by the shared-core list adapter.
 */
export type WebTimelineQuery = {
  /** Optional project slug filter. */
  project?: string;
  /** Optional document type filter. */
  type?: DocumentType;
  /** Optional lifecycle status filter. */
  status?: DocumentStatus;
  /** Final result limit. */
  limit: number;
};

/**
 * Normalized read error code surfaced by the Web adapter.
 */
export type WebReadErrorCode =
  | "configuration-error"
  | "invalid-document"
  | "invalid-query"
  | "not-found";

/**
 * Normalized read error surfaced by the Web adapter.
 */
export type WebReadError = Error & {
  /** Stable error code for route handling. */
  code: WebReadErrorCode;
  /** Suggested HTTP status code for route responses. */
  statusCode: number;
};

/**
 * Minimal document summary shaped for Web navigation.
 */
export type WebDocumentSummary = {
  /** Stable document route path. */
  routePath: string;
  /** Repository-relative path. */
  relativePath: string;
  /** Managed document kind. */
  type: DocumentType;
  /** Owning project slug. */
  project: string;
  /** Document topic slug. */
  topic: string;
  /** Lifecycle status. */
  status: DocumentStatus;
  /** Day bucket used by the document path. */
  date: string;
  /** Optional timeline timestamp for intra-day ordering. */
  recordedAt?: string;
  /** Optional derived planning state for work-item rows. */
  planningState?: WorkItemPlanningState;
  /** Optional total dependency count for work-item rows. */
  dependencyCount?: number;
  /** Optional unresolved dependency count for work-item rows. */
  unresolvedDependencyCount?: number;
};

/**
 * Timeline list view returned by the Web adapter.
 */
export type WebTimelineView = {
  /** Normalized filters that produced the rows. */
  appliedQuery: WebTimelineQuery;
  /** Available project slugs discovered from active managed documents. */
  availableProjects: string[];
  /** Timeline rows in display order. */
  rows: WebDocumentSummary[];
  /** Invalid managed documents skipped during aggregation. */
  invalidDocuments: InvalidDocumentDiagnostic[];
};

/**
 * Exact document view returned by the Web adapter.
 */
export type WebDocumentDetail = WebDocumentSummary & {
  /** Validated frontmatter metadata. */
  metadata: Frontmatter;
  /** Raw Markdown body. */
  body: string;
};

/**
 * Supported bounded-read requests exposed to the Web layer.
 */
export type WebBoundedReadRequest =
  | {
      /** Requested bounded-read entrypoint. */
      entrypoint: "cold-start";
      /** Target project slug. */
      project: string;
    }
  | {
      /** Requested bounded-read entrypoint. */
      entrypoint: "planning-backlog";
      /** Target project slug. */
      project: string;
    }
  | {
      /** Requested bounded-read entrypoint. */
      entrypoint: "planning-topic-entry";
      /** Target project slug. */
      project: string;
      /** Requested topic label or slug. */
      topic: string;
    }
  | {
      /** Requested bounded-read entrypoint. */
      entrypoint: "topic-entry";
      /** Target project slug. */
      project: string;
      /** Requested topic label or slug. */
      topic: string;
    }
  | {
      /** Requested bounded-read entrypoint. */
      entrypoint: "rationale-entry";
      /** Target project slug. */
      project: string;
      /** Requested topic label or slug. */
      topic: string;
    };

/**
 * Bounded-read package shaped for future Web projections.
 */
export type WebBoundedReadView = {
  /** Entrypoint that produced the package. */
  entrypoint: BoundedReadEntrypoint;
  /** Target project slug. */
  project: string;
  /** Optional requested topic slug. */
  topic?: string;
  /** Web-oriented document summaries in bounded order. */
  documents: WebDocumentSummary[];
  /** Explainable bounded-read stages. */
  stages: BoundedReadStage[];
  /** Optional planning explainability copied from the shared core. */
  planningExplainability?: BoundedReadPlanningExplainability[];
  /** Invalid managed documents skipped during bounded aggregation. */
  invalidDocuments: InvalidDocumentDiagnostic[];
  /** Informational notes from the bounded read. */
  notes: string[];
};
