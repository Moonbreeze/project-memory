import {
  CloseWorkItemStateValues,
  DocumentSourceValues,
  DocumentStatusValues,
  DocumentTypeValues,
  ListDocumentsPresetValues,
  ListDocumentsSortFieldValues,
  SortOrderValues,
  StableGuidanceReviewValues,
  TaxonomyRegistryEntryStateValues,
  TaxonomyRegistryMigrationKindValues,
  WorkItemDocumentStatusValues,
  WorkItemOriginKindValues,
  WorkItemStateValues,
  isCloseWorkItemState,
  isDocumentSource,
  isDocumentStatus,
  isDocumentType,
  isListDocumentsPreset,
  isListDocumentsSortField,
  isRecord,
  isSortOrder,
  isStableGuidanceReview,
  isTaxonomyRegistryEntryState,
  isTaxonomyRegistryMigrationKind,
  isWorkItemDocumentStatus,
  isWorkItemOriginKind,
  isWorkItemState,
  parseWorkItemLocatorString,
} from "../../core/index.ts";
import type {
  ArchiveDocumentInput,
  ArchiveWorkItemInput,
  BootstrapProjectInput,
  CanonicalDocInput,
  ColdStartInput,
  CloseWorkItemInput,
  CloseWorkItemState,
  CommitPendingChangesInput,
  DecisionInput,
  DocumentSource,
  DocumentStatus,
  DocumentType,
  ListDocumentsPreset,
  ListDocumentsQuery,
  ListDocumentsSortField,
  PlanningBacklogInput,
  PlanningTopicEntryInput,
  ProviderNoteInput,
  PushPendingChangesInput,
  RationaleEntryInput,
  RunbookInput,
  SearchQuery,
  SessionNoteInput,
  StableGuidanceReview,
  SortOrder,
  TaxonomyAuditInput,
  TaxonomyRegistryEntry,
  TaxonomyRegistryInput,
  TopicEntryInput,
  VerificationResultInput,
  WorkItemContextLocator,
  WorkItemEvidenceLocator,
  WorkItemInput,
  WorkItemOrigin,
  WorkItemRecordLocator,
} from "../../core/index.ts";

import { JsonRpcResponseError } from "./protocol.ts";
import type { ToolCallRequest } from "./results.ts";

/**
 * Input for the fallback workflow chooser tool.
 */
export type ChooseWorkflowInput = {
  /** Short natural-language goal or question. */
  goal: string;
  /** Optional description of the current lifecycle position or recent action. */
  currentStep?: string;
};

/**
 * Reads a required non-empty string field from unknown input.
 */
const readRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid or missing string field: ${fieldName}`);
  }

  return value;
};

/**
 * Reads an optional string field from unknown input.
 */
const readOptionalString = (value: unknown, fieldName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return readRequiredString(value, fieldName);
};

/**
 * Builds one actionable invalid-enum error with the allowed values surfaced.
 */
const createInvalidEnumValueError = (
  fieldName: string,
  value: string,
  allowedValues: readonly string[],
): Error => {
  return new Error(
    `Invalid ${fieldName}: ${value}. Allowed values: ${allowedValues.join(", ")}`,
  );
};

/**
 * Reads one required enum-constrained string field from unknown input.
 */
const readRequiredEnumString = <T extends string>(
  value: unknown,
  fieldName: string,
  isAllowedValue: (value: unknown) => value is T,
  allowedValues: readonly T[],
): T => {
  const parsedValue = readRequiredString(value, fieldName);
  if (!isAllowedValue(parsedValue)) {
    throw createInvalidEnumValueError(fieldName, parsedValue, allowedValues);
  }

  return parsedValue;
};

/**
 * Reads one optional enum-constrained string field from unknown input.
 */
const readOptionalEnumString = <T extends string>(
  value: unknown,
  fieldName: string,
  isAllowedValue: (value: unknown) => value is T,
  allowedValues: readonly T[],
): T | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return readRequiredEnumString(value, fieldName, isAllowedValue, allowedValues);
};

/**
 * Reads an optional stable-guidance review outcome field from unknown input.
 */
const readOptionalStableGuidanceReview = (
  value: unknown,
  fieldName: string,
): StableGuidanceReview | undefined => {
  return readOptionalEnumString(
    value,
    fieldName,
    isStableGuidanceReview,
    StableGuidanceReviewValues,
  );
};

/**
 * Reads a required string-array field from unknown input.
 */
const readStringArray = (value: unknown, fieldName: string): string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Invalid string array field: ${fieldName}`);
  }

  return value;
};

/**
 * Reads an optional finite numeric field from unknown input.
 */
const readOptionalNumber = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid numeric field: ${fieldName}`);
  }

  return value;
};

/**
 * Reads an optional boolean field from unknown input.
 */
const readOptionalBoolean = (value: unknown, fieldName: string): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Invalid boolean field: ${fieldName}`);
  }

  return value;
};

/**
 * Reads one validated taxonomy registry entry state from unknown input.
 */
const readRequiredTaxonomyRegistryEntryState = (
  value: unknown,
): TaxonomyRegistryEntry["state"] => {
  return readRequiredEnumString(
    value,
    "taxonomy registry entry state",
    isTaxonomyRegistryEntryState,
    TaxonomyRegistryEntryStateValues,
  );
};

/**
 * Reads one validated taxonomy registry migration marker from unknown input.
 */
const readRequiredTaxonomyRegistryMigrationKind = (
  value: unknown,
): TaxonomyRegistryEntry["migration"] => {
  return readRequiredEnumString(
    value,
    "taxonomy registry migration",
    isTaxonomyRegistryMigrationKind,
    TaxonomyRegistryMigrationKindValues,
  );
};

/**
 * Reads an optional validated document source from unknown input.
 */
const readOptionalDocumentSource = (value: unknown): DocumentSource | undefined => {
  return readOptionalEnumString(
    value,
    "document source",
    isDocumentSource,
    DocumentSourceValues,
  );
};

/**
 * Reads an optional validated document status from unknown input.
 */
const readOptionalDocumentStatus = (value: unknown): DocumentStatus | undefined => {
  return readOptionalEnumString(
    value,
    "document status",
    isDocumentStatus,
    DocumentStatusValues,
  );
};

/**
 * Reads an optional validated document type from unknown input.
 */
const readOptionalDocumentType = (value: unknown): DocumentType | undefined => {
  return readOptionalEnumString(
    value,
    "document type",
    isDocumentType,
    DocumentTypeValues,
  );
};

/**
 * Reads an optional validated work-item document status from unknown input.
 */
const readOptionalWorkItemDocumentStatus = (value: unknown) => {
  return readOptionalEnumString(
    value,
    "work-item document status",
    isWorkItemDocumentStatus,
    WorkItemDocumentStatusValues,
  );
};

/**
 * Reads an optional validated work-item lifecycle state from unknown input.
 */
const readOptionalWorkItemState = (value: unknown) => {
  return readOptionalEnumString(
    value,
    "work-item state",
    isWorkItemState,
    WorkItemStateValues,
  );
};

/**
 * Reads one validated close-work-item target state from unknown input.
 */
const readCloseWorkItemState = (value: unknown): CloseWorkItemState => {
  return readRequiredEnumString(
    value,
    "close-work-item state",
    isCloseWorkItemState,
    CloseWorkItemStateValues,
  );
};

/**
 * Reads an optional validated document-status array from unknown input.
 */
const readOptionalDocumentStatusArray = (
  value: unknown,
  fieldName: string,
): DocumentStatus[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid document status array field: ${fieldName}`);
  }

  const statuses: DocumentStatus[] = [];
  for (const entry of value) {
    statuses.push(
      readRequiredEnumString(
        entry,
        `${fieldName} entry`,
        isDocumentStatus,
        DocumentStatusValues,
      ),
    );
  }

  return statuses;
};

/**
 * Reads an optional validated list-documents preset from unknown input.
 */
const readOptionalListDocumentsPreset = (
  value: unknown,
): ListDocumentsPreset | undefined => {
  return readOptionalEnumString(
    value,
    "list_documents preset",
    isListDocumentsPreset,
    ListDocumentsPresetValues,
  );
};

/**
 * Reads an optional validated list-documents sort field from unknown input.
 */
const readOptionalListDocumentsSortField = (
  value: unknown,
): ListDocumentsSortField | undefined => {
  return readOptionalEnumString(
    value,
    "list_documents sort field",
    isListDocumentsSortField,
    ListDocumentsSortFieldValues,
  );
};

/**
 * Reads an optional validated sort order from unknown input.
 */
const readOptionalSortOrder = (value: unknown): SortOrder | undefined => {
  return readOptionalEnumString(
    value,
    "sort order",
    isSortOrder,
    SortOrderValues,
  );
};

/**
 * Normalizes unknown params into a plain record.
 */
const readParams = (value: unknown): Record<string, unknown> => {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("MCP params must be an object");
  }

  return value;
};

/**
 * Reads one optional string-array field or returns an empty array when omitted.
 */
const readOptionalStringArray = (value: unknown, fieldName: string): string[] => {
  if (value === undefined) {
    return [];
  }

  return readStringArray(value, fieldName);
};

/**
 * Parses one typed origin payload for a work item.
 */
const readWorkItemOrigin = (params: Record<string, unknown>): WorkItemOrigin => {
  const originKind = readRequiredEnumString(
    params.originKind,
    "work-item origin kind",
    isWorkItemOriginKind,
    WorkItemOriginKindValues,
  );

  if (originKind === "ad-hoc") {
    return {
      kind: "ad-hoc",
      note: readRequiredString(params.originNote, "originNote"),
    };
  }

  const originLocator = parseWorkItemLocatorString(
    readRequiredString(params.originLocator, "originLocator"),
  );
  if (originLocator.type !== originKind) {
    throw new Error(`originLocator must use locator type ${originKind}`);
  }

  if (originLocator.type === "decision") {
    return {
      kind: "decision",
      locator: originLocator,
    };
  }

  return {
    kind: "session-note",
    locator: originLocator,
  };
};

/**
 * Parses one locator-string array with allowed work-item locator kinds.
 */
const readWorkItemDependencyList = (
  value: unknown,
): WorkItemRecordLocator[] => {
  return readOptionalStringArray(value, "dependencies").map((entry) => {
    const locator = parseWorkItemLocatorString(entry);
    if (locator.type !== "work-item") {
      throw new Error(`Invalid dependencies locator: ${entry}`);
    }

    return locator;
  });
};

/**
 * Parses one context locator-string array for work-item documents.
 */
const readWorkItemContextList = (value: unknown): WorkItemContextLocator[] => {
  return readOptionalStringArray(value, "context").map((entry) => {
    const locator = parseWorkItemLocatorString(entry);
    if (
      locator.type !== "decision"
      && locator.type !== "canonical-doc"
      && locator.type !== "session-note"
    ) {
      throw new Error(`Invalid context locator: ${entry}`);
    }

    return locator;
  });
};

/**
 * Parses one evidence locator-string array for work-item documents.
 */
const readWorkItemEvidenceList = (value: unknown): WorkItemEvidenceLocator[] => {
  return readOptionalStringArray(value, "evidence").map((entry) => {
    const locator = parseWorkItemLocatorString(entry);
    if (locator.type !== "verification-result" && locator.type !== "session-note") {
      throw new Error(`Invalid evidence locator: ${entry}`);
    }

    return locator;
  });
};

/**
 * Parses `tools/call` params into a validated tool invocation.
 */
export const parseToolCallRequest = (value: unknown): ToolCallRequest => {
  try {
    const params = readParams(value);

    return {
      name: readRequiredString(params.name, "name"),
      arguments: readParams(params.arguments),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JsonRpcResponseError(-32602, message);
  }
};

/**
 * Parses params for `append_session_note`.
 */
export const parseSessionNoteInput = (value: unknown): SessionNoteInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    summary: readRequiredString(params.summary, "summary"),
    actions: readStringArray(params.actions, "actions"),
    followUp: readStringArray(params.followUp, "followUp"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
  };
};

/**
 * Parses params for `record_verification_result`.
 */
export const parseVerificationResultInput = (
  value: unknown,
): VerificationResultInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    scope: readRequiredString(params.scope, "scope"),
    steps: readStringArray(params.steps, "steps"),
    result: readRequiredString(params.result, "result"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
  };
};

/**
 * Parses params for `upsert_provider_note`.
 */
export const parseProviderNoteInput = (value: unknown): ProviderNoteInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readOptionalString(params.topic, "topic") ?? readRequiredString(params.provider, "provider"),
    provider: readRequiredString(params.provider, "provider"),
    overview: readRequiredString(params.overview, "overview"),
    constraints: readStringArray(params.constraints, "constraints"),
    guidance: readStringArray(params.guidance, "guidance"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
  };
};

/**
 * Parses params for `create_decision`.
 */
export const parseDecisionInput = (value: unknown): DecisionInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    context: readRequiredString(params.context, "context"),
    decision: readRequiredString(params.decision, "decision"),
    consequences: readStringArray(params.consequences, "consequences"),
    stableGuidanceReview: readOptionalStableGuidanceReview(
      params.stableGuidanceReview,
      "stableGuidanceReview",
    ),
    stableGuidanceReviewNote: readOptionalString(
      params.stableGuidanceReviewNote,
      "stableGuidanceReviewNote",
    ),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
  };
};

/**
 * Parses params for `create_runbook`.
 */
export const parseRunbookInput = (value: unknown): RunbookInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    purpose: readRequiredString(params.purpose, "purpose"),
    procedure: readStringArray(params.procedure, "procedure"),
    verification: readStringArray(params.verification, "verification"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
  };
};

/**
 * Parses params for `upsert_canonical_doc`.
 */
export const parseCanonicalDocInput = (value: unknown): CanonicalDocInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    registryScope: readRequiredString(params.registryScope, "registryScope"),
    summary: readRequiredString(params.summary, "summary"),
    guidance: readStringArray(params.guidance, "guidance"),
    references: readStringArray(params.references, "references"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalDocumentStatus(params.status),
  };
};

/**
 * Parses params for `bootstrap_project`.
 */
export const parseBootstrapProjectInput = (value: unknown): BootstrapProjectInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
  };
};

/**
 * Parses params for `upsert_taxonomy_registry`.
 */
export const parseTaxonomyRegistryInput = (value: unknown): TaxonomyRegistryInput => {
  const params = readParams(value);
  const entriesValue = params.entries;
  if (!Array.isArray(entriesValue)) {
    throw new Error("Invalid taxonomy registry entries");
  }

  return {
    project: readRequiredString(params.project, "project"),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    summary: readOptionalString(params.summary, "summary"),
    references: readOptionalStringArray(params.references, "references"),
    entries: entriesValue.map((entry) => {
      if (!isRecord(entry)) {
        throw new Error("Invalid taxonomy registry entries");
      }

      return {
        scope: readRequiredString(entry.scope, "scope"),
        topic: readRequiredString(entry.topic, "topic"),
        state: readRequiredTaxonomyRegistryEntryState(entry.state),
        migration: readRequiredTaxonomyRegistryMigrationKind(entry.migration),
        aliases: readOptionalStringArray(entry.aliases, "aliases"),
        mappedScopes: readOptionalStringArray(entry.mappedScopes, "mappedScopes"),
      };
    }),
  };
};

/**
 * Parses params for `upsert_work_item`.
 */
export const parseWorkItemInput = (value: unknown): WorkItemInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    summary: readRequiredString(params.summary, "summary"),
    outcome: readRequiredString(params.outcome, "outcome"),
    origin: readWorkItemOrigin(params),
    dependencies: readWorkItemDependencyList(params.dependencies),
    context: readWorkItemContextList(params.context),
    verification: readStringArray(params.verification, "verification"),
    evidence: readWorkItemEvidenceList(params.evidence),
    date: readOptionalString(params.date, "date"),
    source: readOptionalDocumentSource(params.source),
    status: readOptionalWorkItemDocumentStatus(params.status),
    workItemState: readOptionalWorkItemState(params.workItemState),
  };
};

/**
 * Parses params for `close_work_item`.
 */
export const parseCloseWorkItemInput = (
  value: unknown,
): CloseWorkItemInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    date: readRequiredString(params.date, "date"),
    state: readCloseWorkItemState(params.state),
  };
};

/**
 * Parses params for `archive_work_item`.
 */
export const parseArchiveWorkItemInput = (
  value: unknown,
): ArchiveWorkItemInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
    date: readRequiredString(params.date, "date"),
  };
};

/**
 * Parses params for `archive_document`.
 */
export const parseArchiveDocumentInput = (
  value: unknown,
): ArchiveDocumentInput => {
  const params = readParams(value);

  return {
    relativePath: readRequiredString(params.path, "path"),
  };
};

/**
 * Parses params for `list_documents`.
 */
export const parseListDocumentsQuery = (value: unknown): ListDocumentsQuery => {
  const params = readParams(value);

  return {
    project: readOptionalString(params.project, "project"),
    preset: readOptionalListDocumentsPreset(params.preset),
    type: readOptionalDocumentType(params.type),
    status: readOptionalDocumentStatus(params.status),
    excludeStatuses: readOptionalDocumentStatusArray(params.excludeStatuses, "excludeStatuses"),
    sort: readOptionalListDocumentsSortField(params.sort),
    order: readOptionalSortOrder(params.order),
    limit: readOptionalNumber(params.limit, "limit"),
    includeBody: readOptionalBoolean(params.includeBody, "includeBody"),
  };
};

/**
 * Parses params for `search_documents`.
 */
export const parseSearchDocumentsQuery = (value: unknown): SearchQuery => {
  const params = readParams(value);

  return {
    project: readOptionalString(params.project, "project"),
    text: readOptionalString(params.text, "text"),
    type: readOptionalDocumentType(params.type),
    limit: readOptionalNumber(params.limit, "limit"),
    includeBody: readOptionalBoolean(params.includeBody, "includeBody"),
  };
};

/**
 * Parses params for `read_document`.
 */
export const parseReadDocumentPath = (value: unknown): string => {
  const params = readParams(value);
  return readRequiredString(params.path, "path");
};

/**
 * Parses params for `read_cold_start`.
 */
export const parseColdStartInput = (value: unknown): ColdStartInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
  };
};

/**
 * Parses params for `read_planning_backlog`.
 */
export const parsePlanningBacklogInput = (value: unknown): PlanningBacklogInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
  };
};

/**
 * Parses params for `read_planning_topic_entry`.
 */
export const parsePlanningTopicEntryInput = (value: unknown): PlanningTopicEntryInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
  };
};

/**
 * Parses params for `read_topic_entry`.
 */
export const parseTopicEntryInput = (value: unknown): TopicEntryInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
  };
};

/**
 * Parses params for `read_rationale_entry`.
 */
export const parseRationaleEntryInput = (value: unknown): RationaleEntryInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    topic: readRequiredString(params.topic, "topic"),
  };
};

/**
 * Parses params for `audit_taxonomy`.
 */
export const parseTaxonomyAuditInput = (value: unknown): TaxonomyAuditInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
  };
};

/**
 * Parses params for `commit_pending_changes`.
 */
export const parseCommitPendingChangesInput = (
  value: unknown,
): CommitPendingChangesInput => {
  const params = readParams(value);

  return {
    project: readRequiredString(params.project, "project"),
    summary: readRequiredString(params.summary, "summary"),
  };
};

/**
 * Parses params for `push_pending_changes`.
 */
export const parsePushPendingChangesInput = (
  value: unknown,
): PushPendingChangesInput => {
  const params = readParams(value);

  return {
    remote: readOptionalString(params.remote, "remote"),
    branch: readOptionalString(params.branch, "branch"),
  };
};

/**
 * Parses params for `choose_workflow`.
 */
export const parseChooseWorkflowInput = (value: unknown): ChooseWorkflowInput => {
  const params = readParams(value);

  return {
    goal: readRequiredString(params.goal, "goal"),
    currentStep: readOptionalString(params.currentStep, "currentStep"),
  };
};
