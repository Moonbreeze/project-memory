/**
 * Supported document kinds stored in project memory.
 */
export const DocumentType = [
  "session-note",
  "verification-result",
  "provider-note",
  "decision",
  "runbook",
  "canonical-doc",
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
 * Supported list-documents presets.
 */
export const ListDocumentsPreset = ["backlog"] as const;

/**
 * Supported list-documents sort fields.
 */
export const ListDocumentsSortField = ["date", "path"] as const;

/**
 * Supported list-documents sort orders.
 */
export const SortOrder = ["asc", "desc"] as const;

/**
 * Allowed top-level frontmatter keys.
 */
export const FrontmatterKey = [
  "date",
  "project",
  "topic",
  "registry_scope",
  "source",
  "status",
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
