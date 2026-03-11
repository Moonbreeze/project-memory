import { createRepositoryContext } from "../config/index.ts";
import { listAllActiveDocumentPaths, readDocument } from "../documents/index.ts";
import type { ParsedDocument, SearchQuery, SearchResult } from "../types/index.ts";

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
 * Lists active documents filtered by project, type, and limit.
 */
export const listDocuments = (
  query: Omit<SearchQuery, "text"> = {},
  context = createRepositoryContext(),
): ParsedDocument[] => {
  const documents = listAllActiveDocumentPaths(context).map((relativePath) => readDocument(context, relativePath));
  return documents
    .filter((document) => matchesQuery(document, query))
    .slice(0, query.limit ?? 100);
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
