/**
 * Future document-status values allowed for work-item documents.
 */
export const WorkItemDocumentStatus = ["draft", "active", "archived"] as const;

/**
 * Future execution lifecycle states for work-item documents.
 */
export const WorkItemState = [
  "open",
  "in_progress",
  "blocked",
  "done",
  "canceled",
] as const;

/**
 * Derived planning states used by future backlog and bounded-read helpers.
 */
export const WorkItemPlanningState = [
  "draft",
  "ready",
  "blocked",
  "in_progress",
  "done",
  "canceled",
  "archived",
] as const;

/**
 * Supported provenance origins for future work-item documents.
 */
export const WorkItemOriginKind = ["decision", "session-note", "ad-hoc"] as const;

/**
 * Supported locator types referenced by the future work-item schema.
 */
export const WorkItemLocatorType = [
  "decision",
  "session-note",
  "verification-result",
  "canonical-doc",
  "work-item",
] as const;

/**
 * Locator types allowed in the future work-item context section.
 */
export const WorkItemContextLocatorType = [
  "decision",
  "canonical-doc",
  "session-note",
] as const;

/**
 * Locator types allowed in the future work-item evidence section.
 */
export const WorkItemEvidenceLocatorType = [
  "verification-result",
  "session-note",
] as const;

/**
 * Planned required Markdown headings for one future work-item document.
 */
export const WorkItemSectionHeading = [
  "## Summary",
  "## Outcome",
  "## Provenance",
  "## Dependencies",
  "## Context",
  "## Verification",
  "## Evidence",
] as const;
