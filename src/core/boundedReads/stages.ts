import { ensureSlug, readDocument } from "../documents/index.ts";
import type {
  BoundedReadEntrypoint,
  BoundedReadPlanningExplainability,
  BoundedReadResult,
  BoundedReadStage,
  InvalidDocumentDiagnostic,
  ParsedDocument,
  RepositoryContext,
} from "../types/index.ts";

import { isMissingFileError } from "./filesystem.ts";
import type { StageInput } from "./types.ts";

/**
 * Reads selected candidate paths with dedupe and status filtering.
 */
const readStageDocuments = (
  input: StageInput,
  context: RepositoryContext,
  seenRelativePaths: Set<string>,
) => {
  const documents: ParsedDocument[] = [];
  const relativePaths: string[] = [];

  for (const candidatePath of input.candidatePaths) {
    if (seenRelativePaths.has(candidatePath)) {
      continue;
    }

    let document: ParsedDocument;
    try {
      document = readDocument(context, candidatePath);
    } catch (error) {
      if (isMissingFileError(error)) {
        continue;
      }

      throw error;
    }

    if (!input.allowedStatuses.includes(document.metadata.status)) {
      continue;
    }

    seenRelativePaths.add(candidatePath);
    documents.push(document);
    relativePaths.push(candidatePath);

    if (documents.length === input.limit) {
      break;
    }
  }

  return { documents, relativePaths };
};

/**
 * Extracts topic references from a canonical-doc references section.
 */
export const collectReferenceTopics = (
  document: ParsedDocument,
  prefix: "decision" | "runbook",
): string[] => {
  const lines = document.body.split("\n");
  const topics: string[] = [];
  const referencePattern = new RegExp(`^\\s*-\\s*${prefix}:\\s*(.+?)\\s*$`);
  let inReferences = false;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      inReferences = line.trim() === "## References";
      continue;
    }

    if (!inReferences) {
      continue;
    }

    const match = line.match(referencePattern);
    if (!match) {
      continue;
    }

    try {
      topics.push(ensureSlug(match[1], `${prefix} reference`));
    } catch {
      continue;
    }
  }

  return [...new Set(topics)];
};

/**
 * Creates one stage result and appends selected documents in order.
 *
 * Selection logic comes from the candidate list prepared upstream; this helper
 * only applies dedupe, status filtering, and result shaping.
 */
export const appendStage = (
  stages: BoundedReadStage[],
  documents: ParsedDocument[],
  seenRelativePaths: Set<string>,
  input: StageInput,
  context: RepositoryContext,
): ParsedDocument[] => {
  const selected = readStageDocuments(input, context, seenRelativePaths);

  stages.push({
    name: input.name,
    documentType: input.documentType,
    strategy: input.strategy,
    limit: input.limit,
    description: input.description,
    relativePaths: selected.relativePaths,
  });

  documents.push(...selected.documents);
  return selected.documents;
};

/**
 * Finalizes one bounded-read result.
 */
export const createBoundedReadResult = (
  entrypoint: BoundedReadEntrypoint,
  project: string,
  stages: BoundedReadStage[],
  documents: ParsedDocument[],
  notes: string[],
  topic?: string,
  planningExplainability?: BoundedReadPlanningExplainability[],
  invalidDocuments: InvalidDocumentDiagnostic[] = [],
): BoundedReadResult => {
  return {
    entrypoint,
    project,
    topic,
    documents,
    stages,
    planningExplainability,
    invalidDocuments,
    notes,
  };
};
