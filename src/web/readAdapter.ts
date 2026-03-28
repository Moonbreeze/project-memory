import {
  isDocumentStatus,
  isDocumentType,
  isManagedDocumentRelativePath,
  listDocuments,
  readColdStart,
  readDocument,
  readPlanningBacklog,
  readPlanningTopicEntry,
  readRationaleEntry,
  readTopicEntry,
} from "../core/index.ts";
import type {
  BoundedReadResult,
  ListDocumentsQuery,
  ListedDocument,
  ParsedDocument,
  RepositoryContext,
} from "../core/index.ts";

import type {
  WebBoundedReadRequest,
  WebBoundedReadView,
  WebDocumentDetail,
  WebDocumentSummary,
  WebReadError,
  WebReadErrorCode,
  WebTimelineQuery,
  WebTimelineQueryInput,
  WebTimelineView,
} from "./types.ts";

const defaultTimelineLimit = 50;
const maxTimelineLimit = 200;

const createDocumentRoutePath = (relativePath: string): string => {
  return `/documents/${encodeURIComponent(relativePath)}`;
};

const createWebReadError = (
  code: WebReadErrorCode,
  message: string,
  statusCode: number,
): WebReadError => {
  return Object.assign(new Error(message), { code, statusCode });
};

const trimOptionalValue = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  return trimmedValue;
};

const parseLimit = (value: string | undefined): number => {
  if (!value) {
    return defaultTimelineLimit;
  }

  const parsedLimit = Number.parseInt(value, 10);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > maxTimelineLimit) {
    throw createWebReadError(
      "invalid-query",
      `Timeline limit must be an integer between 1 and ${maxTimelineLimit}.`,
      400,
    );
  }

  return parsedLimit;
};

const getPlanningState = (
  document: ListedDocument | ParsedDocument,
): WebDocumentSummary["planningState"] => {
  if (!("planningState" in document)) {
    return undefined;
  }

  return document.planningState;
};

const getDependencyCount = (
  document: ListedDocument | ParsedDocument,
): WebDocumentSummary["dependencyCount"] => {
  if (!("dependencyCount" in document)) {
    return undefined;
  }

  return document.dependencyCount;
};

const getUnresolvedDependencyCount = (
  document: ListedDocument | ParsedDocument,
): WebDocumentSummary["unresolvedDependencyCount"] => {
  if (!("unresolvedDependencyCount" in document)) {
    return undefined;
  }

  return document.unresolvedDependencyCount;
};

const toWebDocumentSummary = (
  document: ListedDocument | ParsedDocument,
): WebDocumentSummary => {
  return {
    routePath: createDocumentRoutePath(document.relativePath),
    relativePath: document.relativePath,
    type: document.type,
    project: document.metadata.project,
    topic: document.metadata.topic,
    status: document.metadata.status,
    date: document.metadata.date,
    recordedAt: document.metadata.recorded_at,
    planningState: getPlanningState(document),
    dependencyCount: getDependencyCount(document),
    unresolvedDependencyCount: getUnresolvedDependencyCount(document),
  };
};

const toWebDocumentDetail = (document: ParsedDocument): WebDocumentDetail => {
  return {
    ...toWebDocumentSummary(document),
    metadata: document.metadata,
    body: document.body,
  };
};

const toListDocumentsQuery = (query: WebTimelineQuery): ListDocumentsQuery => {
  return {
    limit: query.limit,
    project: query.project,
    status: query.status,
    type: query.type,
  };
};

const readBoundedResult = (
  request: WebBoundedReadRequest,
  context: RepositoryContext,
): BoundedReadResult => {
  if (request.entrypoint === "cold-start") {
    return readColdStart({ project: request.project }, context);
  }

  if (request.entrypoint === "planning-backlog") {
    return readPlanningBacklog({ project: request.project }, context);
  }

  if (request.entrypoint === "planning-topic-entry") {
    return readPlanningTopicEntry(
      {
        project: request.project,
        topic: request.topic,
      },
      context,
    );
  }

  if (request.entrypoint === "topic-entry") {
    return readTopicEntry(
      {
        project: request.project,
        topic: request.topic,
      },
      context,
    );
  }

  return readRationaleEntry(
    {
      project: request.project,
      topic: request.topic,
    },
    context,
  );
};

/**
 * Returns `true` when `error` matches the normalized Web adapter error shape.
 */
export const isWebReadError = (error: unknown): error is WebReadError => {
  if (!(error instanceof Error)) {
    return false;
  }

  if (!("code" in error) || !("statusCode" in error)) {
    return false;
  }

  return typeof error.code === "string" && typeof error.statusCode === "number";
};

/**
 * Normalizes raw timeline query parameters into typed shared-core filters.
 */
export const normalizeWebTimelineQuery = (
  input: WebTimelineQueryInput,
): WebTimelineQuery => {
  const project = trimOptionalValue(input.project);
  const type = trimOptionalValue(input.type);
  const status = trimOptionalValue(input.status);

  if (type && !isDocumentType(type)) {
    throw createWebReadError("invalid-query", `Unsupported document type: ${type}`, 400);
  }

  if (status && !isDocumentStatus(status)) {
    throw createWebReadError("invalid-query", `Unsupported document status: ${status}`, 400);
  }

  return {
    limit: parseLimit(trimOptionalValue(input.limit)),
    project,
    status,
    type,
  };
};

/**
 * Reads one timeline list through the shared-core list-documents surface.
 */
export const readWebTimeline = (
  query: WebTimelineQuery,
  context: RepositoryContext,
): WebTimelineView => {
  const result = listDocuments(toListDocumentsQuery(query), context);

  return {
    appliedQuery: query,
    rows: result.documents.map((document) => toWebDocumentSummary(document)),
    invalidDocuments: result.invalidDocuments,
  };
};

/**
 * Reads one managed document through the shared-core exact-read surface.
 */
export const readWebDocument = (
  relativePath: string,
  context: RepositoryContext,
): WebDocumentDetail => {
  if (!isManagedDocumentRelativePath(relativePath)) {
    throw createWebReadError("not-found", "Document path is outside managed routes.", 404);
  }

  try {
    const document = readDocument(context, relativePath);
    return toWebDocumentDetail(document);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      throw createWebReadError("not-found", "Managed document was not found.", 404);
    }

    throw createWebReadError("invalid-document", message, 500);
  }
};

/**
 * Reads one bounded package through the shared-core bounded-read entrypoints.
 */
export const readWebBoundedRead = (
  request: WebBoundedReadRequest,
  context: RepositoryContext,
): WebBoundedReadView => {
  const result = readBoundedResult(request, context);

  return {
    entrypoint: result.entrypoint,
    project: result.project,
    topic: result.topic,
    documents: result.documents.map((document) => toWebDocumentSummary(document)),
    stages: result.stages,
    planningExplainability: result.planningExplainability,
    invalidDocuments: result.invalidDocuments,
    notes: result.notes,
  };
};
