/**
 * Supported document kinds stored in project memory.
 */
export const DocumentType = [
  "session-note",
  "verification-result",
  "provider-note",
  "decision",
  "runbook",
] as const;

/**
 * Supported document sources.
 */
export const DocumentSource = ["agent", "user", "manual", "tool", "imported"] as const;

/**
 * Supported document lifecycle statuses.
 */
export const DocumentStatus = ["draft", "active", "superseded", "archived"] as const;

/**
 * Allowed top-level frontmatter keys.
 */
export const FrontmatterKey = [
  "date",
  "project",
  "topic",
  "source",
  "status",
  "project_commit",
] as const;

/**
 * Allowed required frontmatter keys.
 */
export const RequiredFrontmatterKey = [
  "date",
  "project",
  "topic",
  "source",
  "status",
] as const;
