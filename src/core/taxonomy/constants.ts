/**
 * Reserved registry scope used by the project taxonomy control plane.
 */
export const ReservedTaxonomyRegistryScope = "taxonomy-registry";

/**
 * Reserved registry topic used by the project taxonomy control plane.
 */
export const ReservedTaxonomyRegistryTopic = "taxonomy-registry";

/**
 * Supported lifecycle states for one taxonomy registry entry.
 */
export const TaxonomyRegistryEntryState = [
  "active",
  "transitional",
  "retired",
] as const;

/**
 * Supported explicit taxonomy migration markers.
 */
export const TaxonomyRegistryMigrationKind = [
  "none",
  "alias-add",
  "rename",
  "split",
  "merge",
  "boundary-change",
  "create-topic",
  "retire-topic",
] as const;

/**
 * Supported taxonomy audit issue severities.
 */
export const TaxonomyAuditIssueSeverity = ["error", "warning"] as const;

/**
 * Supported taxonomy audit issue codes.
 */
export const TaxonomyAuditIssueCode = [
  "missing-registry",
  "invalid-registry",
  "duplicate-registry",
  "duplicate-registry-entry",
  "alias-scope-usage",
  "unknown-scope",
  "retired-scope-usage",
  "duplicate-authority",
] as const;
