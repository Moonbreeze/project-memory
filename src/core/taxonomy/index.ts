/**
 * Taxonomy constants and type guards.
 */
export {
  ReservedTaxonomyRegistryScope,
  ReservedTaxonomyRegistryTopic,
  TaxonomyAuditIssueCode as TaxonomyAuditIssueCodeValues,
  TaxonomyAuditIssueSeverity as TaxonomyAuditIssueSeverityValues,
  TaxonomyRegistryEntryState as TaxonomyRegistryEntryStateValues,
  TaxonomyRegistryMigrationKind as TaxonomyRegistryMigrationKindValues,
} from "./constants.ts";

/**
 * Taxonomy types and helpers.
 */
export type {
  BootstrapProjectInput,
  BootstrapProjectResult,
  CanonicalDocTaxonomyValidationInput,
  TaxonomyAuditInput,
  TaxonomyAuditIssue,
  TaxonomyAuditIssueCode,
  TaxonomyAuditIssueSeverity,
  TaxonomyAuditResult,
  TaxonomyContext,
  TaxonomyRegistryDocument,
  TaxonomyRegistryEntry,
  TaxonomyRegistryEntryState,
  TaxonomyRegistryInput,
  TaxonomyRegistryMigrationKind,
} from "./types.ts";

/**
 * Taxonomy type guards.
 */
export {
  isTaxonomyAuditIssueCode,
  isTaxonomyAuditIssueSeverity,
  isTaxonomyRegistryEntryState,
  isTaxonomyRegistryMigrationKind,
} from "./types.ts";

/**
 * Taxonomy registry operations.
 */
export {
  assertCanonicalDocWriteAllowed,
  auditTaxonomyConsistency,
  readActiveTaxonomyRegistry,
  upsertTaxonomyRegistry,
} from "./registry.ts";

/**
 * Project bootstrap helper with reserved taxonomy registry creation.
 */
export { bootstrapProject } from "./bootstrap.ts";
