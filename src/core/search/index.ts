import { createRepositoryContext } from "../config/index.ts";
import { listAllActiveDocumentPaths, readDocument } from "../documents/index.ts";
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

const backlogExcludedStatuses: DocumentStatus[] = ["superseded", "archived"];

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
 * Expands presets and defaults into one normalized list-documents query.
 */
const normalizeListDocumentsQuery = (
  query: ListDocumentsQuery,
): AppliedListDocumentsQuery => {
  const presetDefaults: Partial<AppliedListDocumentsQuery> =
    query.preset === "backlog"
      ? {
          type: "decision",
          excludeStatuses: backlogExcludedStatuses,
          sort: "date",
          order: "desc",
        }
      : {};

  const statusOverridesPreset = query.status !== undefined || query.excludeStatuses !== undefined;
  const normalizedQuery: AppliedListDocumentsQuery = {
    sort: query.sort ?? presetDefaults.sort ?? "path",
    order: query.order ?? presetDefaults.order ?? "asc",
    limit: query.limit ?? 100,
    includeBody: query.includeBody ?? false,
  };

  if (query.project) {
    normalizedQuery.project = query.project;
  }

  if (query.type ?? presetDefaults.type) {
    normalizedQuery.type = query.type ?? presetDefaults.type;
  }

  if (query.status) {
    normalizedQuery.status = query.status;
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
): number => {
  const ascendingFactor = query.order === "asc" ? 1 : -1;

  if (query.sort === "date") {
    const dateComparison = left.metadata.date.localeCompare(right.metadata.date);
    if (dateComparison !== 0) {
      return dateComparison * ascendingFactor;
    }
  }

  return left.relativePath.localeCompare(right.relativePath) * ascendingFactor;
};

/**
 * Removes the body field from list results unless it was explicitly requested.
 */
const toListedDocument = (
  document: ParsedDocument,
  includeBody: boolean,
): ListedDocument => {
  if (includeBody) {
    return document;
  }

  const { body: _body, ...listedDocument } = document;
  return listedDocument;
};

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
 * Lists active documents filtered by project, status, type, and sort options.
 */
export const listDocuments = (
  query: ListDocumentsQuery = {},
  context = createRepositoryContext(),
): ListDocumentsResult => {
  const appliedQuery = normalizeListDocumentsQuery(query);
  const documents = listAllActiveDocumentPaths(context).map((relativePath) => readDocument(context, relativePath));

  return {
    documents: documents
      .filter((document) => matchesListDocumentsQuery(document, appliedQuery))
      .sort((left, right) => compareDocuments(left, right, appliedQuery))
      .slice(0, appliedQuery.limit)
      .map((document) => toListedDocument(document, appliedQuery.includeBody)),
    appliedQuery,
  };
};

/**
 * Performs a simple full-text search over active documents.
 */
export const searchDocuments = (
  query: SearchQuery,
  context = createRepositoryContext(),
): SearchResult[] => {
  const documents = listAllActiveDocumentPaths(context).map((relativePath) => readDocument(context, relativePath));

  return documents
    .filter((document) => matchesQuery(document, query))
    .slice(0, query.limit ?? 50)
    .map((document) => ({
      ...document,
      excerpt: buildExcerpt(document, query.text),
    }));
};
