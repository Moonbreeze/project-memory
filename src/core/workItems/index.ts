/**
 * Work-item spec constants for the future Session 6 implementation.
 */
export {
  WorkItemContextLocatorType as WorkItemContextLocatorTypeValues,
  WorkItemDocumentStatus as WorkItemDocumentStatusValues,
  WorkItemEvidenceLocatorType as WorkItemEvidenceLocatorTypeValues,
  WorkItemLocatorType as WorkItemLocatorTypeValues,
  WorkItemOriginKind as WorkItemOriginKindValues,
  WorkItemPlanningState as WorkItemPlanningStateValues,
  WorkItemSectionHeading as WorkItemSectionHeadingValues,
  WorkItemState as WorkItemStateValues,
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
  WorkItemInput,
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
  parseWorkItemDocument,
  parseWorkItemLocatorString,
  renderWorkItemBody,
  resolveWorkItemLocatorRelativePath,
  serializeWorkItemLocator,
  validateStoredWorkItemDocument,
  validateWorkItemDefinition,
} from "./document.ts";
