import type { DocumentStatus } from "../types/index.ts";

/**
 * Active-or-draft statuses used by bounded reads that include current work.
 */
export const currentStatuses: DocumentStatus[] = ["active", "draft"];

/**
 * Active-only statuses used by bounded reads that require current truth.
 */
export const activeStatuses: DocumentStatus[] = ["active"];

/**
 * Decision statuses used by rationale reads, including superseded history.
 */
export const rationaleDecisionStatuses: DocumentStatus[] = [
  "active",
  "draft",
  "superseded",
];

/**
 * Cold-start stage limits.
 */
export const coldStartLimits = {
  runbooks: 2,
  canonicalDocs: 3,
  decisions: 3,
} as const;

/**
 * Planning-backlog stage limits.
 */
export const planningBacklogLimits = {
  ready: 4,
  inProgress: 2,
  blocked: 2,
} as const;

/**
 * Planning-topic-entry stage limits.
 */
export const planningTopicEntryLimits = {
  workItems: 4,
  dependencies: 2,
  canonicalDocs: 2,
  decisions: 2,
  sessionNotes: 1,
  verificationResults: 2,
  evidenceSessionNotes: 1,
} as const;

/**
 * Topic-entry stage limits.
 */
export const topicEntryLimits = {
  canonicalDocs: 3,
  runbooks: 1,
  providerNotes: 1,
  decisions: 2,
  sessionNotes: 1,
  verificationResults: 1,
  fallbackCanonicalDocs: 2,
  fallbackRunbooks: 1,
  fallbackProviderNotes: 1,
  fallbackDecisions: 2,
} as const;

/**
 * Rationale-entry stage limits.
 */
export const rationaleEntryLimits = {
  canonicalDocs: 2,
  referencedDecisions: 2,
  referencedRunbooks: 1,
  exactDecisions: 2,
  exactRunbooks: 1,
  exactProviderNotes: 1,
  sessionNotes: 1,
  verificationResults: 1,
  fallbackCanonicalDocs: 2,
  fallbackDecisions: 2,
  fallbackRunbooks: 1,
} as const;

/**
 * Returns a bounded candidate-window size used before status filtering.
 */
export const candidateLimitForStage = (limit: number): number => {
  return limit * 4;
};
