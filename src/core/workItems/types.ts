import {
  WorkItemContextLocatorType as WorkItemContextLocatorTypeValues,
  WorkItemDocumentStatus as WorkItemDocumentStatusValues,
  WorkItemEvidenceLocatorType as WorkItemEvidenceLocatorTypeValues,
  WorkItemLocatorType as WorkItemLocatorTypeValues,
  WorkItemOriginKind as WorkItemOriginKindValues,
  WorkItemPlanningState as WorkItemPlanningStateValues,
  WorkItemSectionHeading as WorkItemSectionHeadingValues,
  WorkItemState as WorkItemStateValues,
} from "./constants.ts";
import type { DocumentSource } from "../types/index.ts";
import { isLiteralMember } from "../shared/index.ts";

/**
 * A future document-status value allowed for work-item documents.
 */
export type WorkItemDocumentStatus = typeof WorkItemDocumentStatusValues[number];

/**
 * A future execution lifecycle state for work-item documents.
 */
export type WorkItemState = typeof WorkItemStateValues[number];

/**
 * A derived planning state for future backlog and bounded-read helpers.
 */
export type WorkItemPlanningState = typeof WorkItemPlanningStateValues[number];

/**
 * A supported provenance origin kind for future work-item documents.
 */
export type WorkItemOriginKind = typeof WorkItemOriginKindValues[number];

/**
 * A supported locator type referenced by the future work-item schema.
 */
export type WorkItemLocatorType = typeof WorkItemLocatorTypeValues[number];

/**
 * A locator type allowed in the future work-item context section.
 */
export type WorkItemContextLocatorType = typeof WorkItemContextLocatorTypeValues[number];

/**
 * A locator type allowed in the future work-item evidence section.
 */
export type WorkItemEvidenceLocatorType = typeof WorkItemEvidenceLocatorTypeValues[number];

/**
 * A planned required Markdown heading for future work-item documents.
 */
export type WorkItemSectionHeading = typeof WorkItemSectionHeadingValues[number];

/**
 * Stable locator for one decision document.
 */
export type DecisionLocator = {
  /** Locator kind. */
  type: "decision";
  /** Owning project slug. */
  project: string;
  /** Decision date in `YYYY-MM-DD` format. */
  date: string;
  /** Decision topic slug. */
  topic: string;
};

/**
 * Stable locator for one session-note document.
 */
export type SessionNoteLocator = {
  /** Locator kind. */
  type: "session-note";
  /** Owning project slug. */
  project: string;
  /** Session date in `YYYY-MM-DD` format. */
  date: string;
  /** Session topic slug. */
  topic: string;
};

/**
 * Stable locator for one verification-result document.
 */
export type VerificationResultLocator = {
  /** Locator kind. */
  type: "verification-result";
  /** Owning project slug. */
  project: string;
  /** Verification date in `YYYY-MM-DD` format. */
  date: string;
  /** Verification topic slug. */
  topic: string;
};

/**
 * Stable locator for one canonical-doc document.
 */
export type CanonicalDocLocator = {
  /** Locator kind. */
  type: "canonical-doc";
  /** Owning project slug. */
  project: string;
  /** Declared registry scope slug. */
  registryScope: string;
  /** Canonical topic slug. */
  topic: string;
};

/**
 * Stable locator for one future work-item document.
 */
export type WorkItemRecordLocator = {
  /** Locator kind. */
  type: "work-item";
  /** Owning project slug. */
  project: string;
  /** Work-item creation date in `YYYY-MM-DD` format. */
  date: string;
  /** Work-item topic slug. */
  topic: string;
};

/**
 * Stable same-project locator used by future work-item relationships.
 */
export type WorkItemDocumentLocator =
  | DecisionLocator
  | SessionNoteLocator
  | VerificationResultLocator
  | CanonicalDocLocator
  | WorkItemRecordLocator;

/**
 * Stable locator allowed in the future work-item context section.
 */
export type WorkItemContextLocator =
  | DecisionLocator
  | CanonicalDocLocator
  | SessionNoteLocator;

/**
 * Stable locator allowed in the future work-item evidence section.
 */
export type WorkItemEvidenceLocator = VerificationResultLocator | SessionNoteLocator;

/**
 * Provenance link back to the originating decision or session note.
 */
export type WorkItemDocumentOrigin =
  | {
      /** Origin kind. */
      kind: "decision";
      /** Exact originating document locator. */
      locator: DecisionLocator;
    }
  | {
      /** Origin kind. */
      kind: "session-note";
      /** Exact originating document locator. */
      locator: SessionNoteLocator;
    };

/**
 * Ad-hoc provenance used when no prior managed document exists.
 */
export type WorkItemAdHocOrigin = {
  /** Origin kind. */
  kind: "ad-hoc";
  /** Short explanation for why the work item was created ad hoc. */
  note: string;
};

/**
 * Minimal provenance model for one future work-item document.
 */
export type WorkItemOrigin = WorkItemDocumentOrigin | WorkItemAdHocOrigin;

/**
 * Shared metadata for one future work-item document.
 */
export type WorkItemMetadata = {
  /** Owning project slug. */
  project: string;
  /** Work-item topic slug. */
  topic: string;
  /** Work-item creation date in `YYYY-MM-DD` format. */
  date: string;
  /** Document-lifecycle status kept separate from execution progress. */
  status: WorkItemDocumentStatus;
  /** Execution lifecycle state used for planning and completion semantics. */
  workItemState: WorkItemState;
};

/**
 * Minimal future work-item schema captured in structured form.
 */
export type WorkItemDefinition = {
  /** Shared metadata for the future work-item document. */
  metadata: WorkItemMetadata;
  /** Short description of the work slice. */
  summary: string;
  /** Expected outcome when the work slice is complete. */
  outcome: string;
  /** Required provenance explaining why the work item exists. */
  origin: WorkItemOrigin;
  /** Explicit prerequisite work items that must complete first. */
  dependencies: WorkItemRecordLocator[];
  /** Same-project documents that govern or explain execution. */
  context: WorkItemContextLocator[];
  /** Verification targets promised by the work item. */
  verification: string[];
  /** Same-project evidence documents recorded during or after execution. */
  evidence: WorkItemEvidenceLocator[];
};

/**
 * Input required to create or update one work-item document.
 */
export type WorkItemInput = {
  /** Target project slug. */
  project: string;
  /** Work-item topic slug or label. */
  topic: string;
  /** Optional explicit work-item date in `YYYY-MM-DD` format. */
  date?: string;
  /** Optional explicit document source. */
  source?: DocumentSource;
  /** Optional explicit document status. */
  status?: WorkItemDocumentStatus;
  /** Optional explicit execution state. Defaults to `open`. */
  workItemState?: WorkItemState;
  /** Short description of the work slice. */
  summary: string;
  /** Expected outcome when the work slice is complete. */
  outcome: string;
  /** Required provenance explaining why the work item exists. */
  origin: WorkItemOrigin;
  /** Explicit prerequisite work items that must complete first. */
  dependencies: WorkItemRecordLocator[];
  /** Same-project documents that govern or explain execution. */
  context: WorkItemContextLocator[];
  /** Verification targets promised by the work item. */
  verification: string[];
  /** Same-project evidence documents recorded during or after execution. */
  evidence: WorkItemEvidenceLocator[];
};

/**
 * Inputs used to derive a planning state from lifecycle and dependency data.
 */
export type WorkItemPlanningStateInput = {
  /** Document-lifecycle status of the work item. */
  documentStatus: WorkItemDocumentStatus;
  /** Execution lifecycle state of the work item. */
  workItemState: WorkItemState;
  /** Number of unresolved prerequisite work items. */
  unresolvedDependencyCount: number;
};

/**
 * Returns `true` when `value` is a future work-item document status.
 */
export const isWorkItemDocumentStatus = (
  value: unknown,
): value is WorkItemDocumentStatus => {
  return isLiteralMember(WorkItemDocumentStatusValues, value);
};

/**
 * Returns `true` when `value` is a future work-item lifecycle state.
 */
export const isWorkItemState = (value: unknown): value is WorkItemState => {
  return isLiteralMember(WorkItemStateValues, value);
};

/**
 * Returns `true` when `value` is a derived future planning state.
 */
export const isWorkItemPlanningState = (
  value: unknown,
): value is WorkItemPlanningState => {
  return isLiteralMember(WorkItemPlanningStateValues, value);
};

/**
 * Returns `true` when `value` is a supported future provenance origin kind.
 */
export const isWorkItemOriginKind = (value: unknown): value is WorkItemOriginKind => {
  return isLiteralMember(WorkItemOriginKindValues, value);
};

/**
 * Returns `true` when `value` is a supported future locator type.
 */
export const isWorkItemLocatorType = (value: unknown): value is WorkItemLocatorType => {
  return isLiteralMember(WorkItemLocatorTypeValues, value);
};

/**
 * Returns `true` when `value` is a supported future context locator type.
 */
export const isWorkItemContextLocatorType = (
  value: unknown,
): value is WorkItemContextLocatorType => {
  return isLiteralMember(WorkItemContextLocatorTypeValues, value);
};

/**
 * Returns `true` when `value` is a supported future evidence locator type.
 */
export const isWorkItemEvidenceLocatorType = (
  value: unknown,
): value is WorkItemEvidenceLocatorType => {
  return isLiteralMember(WorkItemEvidenceLocatorTypeValues, value);
};

/**
 * Returns `true` when `value` is a planned future work-item section heading.
 */
export const isWorkItemSectionHeading = (
  value: unknown,
): value is WorkItemSectionHeading => {
  return isLiteralMember(WorkItemSectionHeadingValues, value);
};
