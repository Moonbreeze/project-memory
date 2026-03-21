import { createRepositoryContext } from "../config/index.ts";
import {
  compareDocumentsByTimeline,
  listAllActiveDocumentPaths,
  readDocumentsSkippingInvalidWorkItems,
} from "../documents/index.ts";
import { buildWorkItemPlanningEntries } from "../workItems/index.ts";
import type {
  AppliedListDocumentsQuery,
  DocumentStatus,
  ListDocumentsQuery,
  ListDocumentsResult,
  ListedDocument,
  ParsedDocument,
  SearchQuery,
  SearchResult,
} from "../types/index.ts";
import type { WorkItemPlanningMetadata } from "../workItems/index.ts";

const backlogExcludedStatuses: DocumentStatus[] = ["superseded", "archived"];
const ideasPresetDefaults: Partial<AppliedListDocumentsQuery> = {
  type: "decision",
  status: "draft",
  sort: "date",
  order: "desc",
};
const workItemBacklogPlanningStatePriority: Record<string, number> = {
  ready: 0,
  in_progress: 1,
  blocked: 2,
  draft: 3,
  done: 4,
  canceled: 5,
  archived: 6,
};

/**
 * Returns `true` when a parsed document satisfies the query filters.
 */
const matchesQuery = (document: ParsedDocument, query: SearchQuery): boolean => {
  if (query.project && document.metadata.project !== query.project) {
    return false;
  }

  if (query.type && document.type !== query.type) {
    return false;
  }

  if (query.text) {
    const haystack = `${document.relativePath}\n${document.body}`.toLowerCase();
    if (!haystack.includes(query.text.toLowerCase())) {
      return false;
    }
  }

  return true;
};

/**
 * Applies list-documents-specific filters to one parsed document.
 */
const matchesListDocumentsQuery = (
  document: ParsedDocument,
  query: AppliedListDocumentsQuery,
): boolean => {
  if (query.project && document.metadata.project !== query.project) {
    return false;
  }

  if (query.type && document.type !== query.type) {
    return false;
  }

  if (query.status && document.metadata.status !== query.status) {
    return false;
  }

  if (query.excludeStatuses?.includes(document.metadata.status)) {
    return false;
  }

  return true;
};

/**
 * Returns `true` when the selected project already has active work-item documents.
 */
const hasProjectWorkItems = (
  documents: ParsedDocument[],
  project: string | undefined,
): boolean => {
  if (!project) {
    return false;
  }

  return documents.some((document) => {
    return document.type === "work-item" && document.metadata.project === project;
  });
};

/**
 * Expands presets and defaults into one normalized list-documents query.
 */
const normalizeListDocumentsQuery = (
  query: ListDocumentsQuery,
  documents: ParsedDocument[],
): AppliedListDocumentsQuery => {
  const useWorkItemBacklog = query.preset === "backlog" && hasProjectWorkItems(documents, query.project);
  const presetDefaults: Partial<AppliedListDocumentsQuery> =
    query.preset === "backlog"
      ? useWorkItemBacklog
        ? {
            type: "work-item",
            status: "active",
            sort: "date",
            order: "desc",
          }
        : {
            type: "decision",
            excludeStatuses: backlogExcludedStatuses,
            sort: "date",
            order: "desc",
          }
      : query.preset === "ideas"
        ? ideasPresetDefaults
      : {};

  const statusOverridesPreset = query.status !== undefined || query.excludeStatuses !== undefined;
  const normalizedQuery: AppliedListDocumentsQuery = {
    sort: query.sort ?? presetDefaults.sort ?? "date",
    order: query.order ?? presetDefaults.order ?? "desc",
    limit: query.limit ?? 100,
    includeBody: query.includeBody ?? false,
  };

  if (query.project) {
    normalizedQuery.project = query.project;
  }

  if (query.type ?? presetDefaults.type) {
    normalizedQuery.type = query.type ?? presetDefaults.type;
  }

  if (query.status ?? presetDefaults.status) {
    normalizedQuery.status = query.status ?? presetDefaults.status;
  }

  const excludeStatuses = statusOverridesPreset
    ? query.excludeStatuses
    : (query.excludeStatuses ?? presetDefaults.excludeStatuses);
  if (excludeStatuses) {
    normalizedQuery.excludeStatuses = excludeStatuses;
  }

  if (query.preset) {
    normalizedQuery.preset = query.preset;
  }

  return normalizedQuery;
};

/**
 * Compares two documents using the configured list sort.
 */
const compareDocuments = (
  left: ParsedDocument,
  right: ParsedDocument,
  query: AppliedListDocumentsQuery,
  planningMetadataByPath: Map<string, WorkItemPlanningMetadata>,
): number => {
  if (query.preset === "backlog" && query.type === "work-item") {
    const leftPlanningState = planningMetadataByPath.get(left.relativePath)?.planningState;
    const rightPlanningState = planningMetadataByPath.get(right.relativePath)?.planningState;
    const leftPriority = leftPlanningState ? workItemBacklogPlanningStatePriority[leftPlanningState] : undefined;
    const rightPriority = rightPlanningState ? workItemBacklogPlanningStatePriority[rightPlanningState] : undefined;

    if (leftPriority !== undefined && rightPriority !== undefined && leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
  }

  const ascendingFactor = query.order === "asc" ? 1 : -1;

  if (query.sort === "date") {
    return compareDocumentsByTimeline(left, right, query.order);
  }

  return left.relativePath.localeCompare(right.relativePath) * ascendingFactor;
};

/**
 * Removes the body field from list results unless it was explicitly requested.
 */
const toListedDocument = (
  document: ParsedDocument,
  includeBody: boolean,
  planningMetadata?: WorkItemPlanningMetadata,
): ListedDocument => {
  const { body: _body, ...documentWithoutBody } = document;
  const listedDocument: ListedDocument = includeBody ? { ...document } : documentWithoutBody;

  if (planningMetadata) {
    listedDocument.planningState = planningMetadata.planningState;
    listedDocument.dependencyCount = planningMetadata.dependencyCount;
    listedDocument.unresolvedDependencyCount = planningMetadata.unresolvedDependencyCount;
  }

  return listedDocument;
};

/**
 * Builds one short search excerpt, optionally centered around the query text.
 */
const buildExcerpt = (document: ParsedDocument, queryText?: string): string => {
  const body = document.body.replace(/\s+/g, " ").trim();
  if (!queryText) {
    return body.slice(0, 160);
  }

  const lower = body.toLowerCase();
  const queryIndex = lower.indexOf(queryText.toLowerCase());
  if (queryIndex === -1) {
    return body.slice(0, 160);
  }

  const start = Math.max(0, queryIndex - 40);
  const end = Math.min(body.length, queryIndex + queryText.length + 80);
  return body.slice(start, end);
};

/**
 * Converts one parsed document into a compact search hit.
 */
const toSearchResult = (
  document: ParsedDocument,
  includeBody: boolean,
  queryText?: string,
): SearchResult => {
  const searchResult: SearchResult = {
    relativePath: document.relativePath,
    type: document.type,
    metadata: document.metadata,
    excerpt: buildExcerpt(document, queryText),
  };

  if (includeBody) {
    searchResult.body = document.body;
  }

  return searchResult;
};

/**
 * Builds planning metadata lookup for active work-item documents by relative path.
 */
const buildWorkItemPlanningMetadata = (
  documents: ParsedDocument[],
): Map<string, WorkItemPlanningMetadata> => {
  const planningMetadataByPath = new Map<string, WorkItemPlanningMetadata>();
  for (const entry of buildWorkItemPlanningEntries(documents)) {
    planningMetadataByPath.set(entry.document.relativePath, entry.planning);
  }

  return planningMetadataByPath;
};

/**
 * Returns `true` when planning metadata belongs to the backlog-facing active states.
 */
const matchesWorkItemBacklogPlanningState = (
  planningMetadata: WorkItemPlanningMetadata | undefined,
): boolean => {
  return (
    planningMetadata?.planningState === "ready"
    || planningMetadata?.planningState === "in_progress"
    || planningMetadata?.planningState === "blocked"
  );
};

/**
 * Lists active documents filtered by project, status, type, and sort options.
 */
export const listDocuments = (
  query: ListDocumentsQuery = {},
  context = createRepositoryContext(),
): ListDocumentsResult => {
  const { documents, invalidDocuments } = readDocumentsSkippingInvalidWorkItems(
    context,
    listAllActiveDocumentPaths(context),
  );
  const planningMetadataByPath = buildWorkItemPlanningMetadata(documents);
  const appliedQuery = normalizeListDocumentsQuery(query, documents);

  return {
    documents: documents
      .filter((document) => matchesListDocumentsQuery(document, appliedQuery))
      .filter((document) => {
        if (appliedQuery.preset !== "backlog" || appliedQuery.type !== "work-item") {
          return true;
        }

        return matchesWorkItemBacklogPlanningState(
          planningMetadataByPath.get(document.relativePath),
        );
      })
      .sort((left, right) => compareDocuments(left, right, appliedQuery, planningMetadataByPath))
      .slice(0, appliedQuery.limit)
      .map((document) => {
        return toListedDocument(
          document,
          appliedQuery.includeBody,
          planningMetadataByPath.get(document.relativePath),
        );
      }),
    appliedQuery,
    invalidDocuments,
  };
};

/**
 * Performs a simple full-text search over active documents.
 */
export const searchDocuments = (
  query: SearchQuery,
  context = createRepositoryContext(),
): SearchResult[] => {
  const { documents } = readDocumentsSkippingInvalidWorkItems(
    context,
    listAllActiveDocumentPaths(context),
  );

  return documents
    .filter((document) => matchesQuery(document, query))
    .sort((left, right) => compareDocumentsByTimeline(left, right, "desc"))
    .slice(0, query.limit ?? 50)
    .map((document) => toSearchResult(document, query.includeBody ?? false, query.text));
};
