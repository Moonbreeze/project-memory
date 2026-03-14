/**
 * Work-item spec constants for the future Session 6 implementation.
 */
export {
  WorkItemContextLocatorType,
  WorkItemDocumentStatus,
  WorkItemEvidenceLocatorType,
  WorkItemLocatorType,
  WorkItemOriginKind,
  WorkItemPlanningState,
  WorkItemSectionHeading,
  WorkItemState,
} from "./constants.ts";

/**
 * Work-item spec types and type guards.
 */
export type {
  CanonicalDocLocator,
  DecisionLocator,
  SessionNoteLocator,
  VerificationResultLocator,
  WorkItemAdHocOrigin,
  WorkItemContextLocator,
  WorkItemContextLocatorType,
  WorkItemDefinition,
  WorkItemDocumentLocator,
  WorkItemDocumentOrigin,
  WorkItemDocumentStatus,
  WorkItemEvidenceLocator,
  WorkItemEvidenceLocatorType,
  WorkItemLocatorType,
  WorkItemMetadata,
  WorkItemOrigin,
  WorkItemOriginKind,
  WorkItemPlanningState,
  WorkItemPlanningStateInput,
  WorkItemRecordLocator,
  WorkItemSectionHeading,
  WorkItemState,
} from "./types.ts";

/**
 * Work-item spec type guards.
 */
export {
  isWorkItemContextLocatorType,
  isWorkItemDocumentStatus,
  isWorkItemEvidenceLocatorType,
  isWorkItemLocatorType,
  isWorkItemOriginKind,
  isWorkItemPlanningState,
  isWorkItemSectionHeading,
  isWorkItemState,
} from "./types.ts";

/**
 * Work-item spec helpers.
 */
export {
  deriveWorkItemPlanningState,
  resolveWorkItemLocatorRelativePath,
  validateWorkItemDefinition,
} from "./spec.ts";
