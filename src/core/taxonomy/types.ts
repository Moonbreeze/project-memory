import { isLiteralMember } from "../shared/index.ts";
import type { DocumentSource, ParsedDocument, RepositoryContext } from "../types/index.ts";

import {
  TaxonomyAuditIssueCode as TaxonomyAuditIssueCodeValues,
  TaxonomyAuditIssueSeverity as TaxonomyAuditIssueSeverityValues,
  TaxonomyRegistryEntryState as TaxonomyRegistryEntryStateValues,
  TaxonomyRegistryMigrationKind as TaxonomyRegistryMigrationKindValues,
} from "./constants.ts";

/**
 * One supported lifecycle state for a taxonomy registry entry.
 */
export type TaxonomyRegistryEntryState = typeof TaxonomyRegistryEntryStateValues[number];

/**
 * One supported explicit taxonomy migration marker.
 */
export type TaxonomyRegistryMigrationKind = typeof TaxonomyRegistryMigrationKindValues[number];

/**
 * One supported taxonomy audit issue severity.
 */
export type TaxonomyAuditIssueSeverity = typeof TaxonomyAuditIssueSeverityValues[number];

/**
 * One supported taxonomy audit issue code.
 */
export type TaxonomyAuditIssueCode = typeof TaxonomyAuditIssueCodeValues[number];

/**
 * One declared scope entry stored in the taxonomy registry canonical doc.
 */
export type TaxonomyRegistryEntry = {
  /** Registered taxonomy scope slug. */
  scope: string;
  /** Registered taxonomy topic slug owning the scope. */
  topic: string;
  /** Current lifecycle state for the scope. */
  state: TaxonomyRegistryEntryState;
  /** Explicit alias slugs that are semantically equivalent to the scope. */
  aliases: string[];
  /** Explicit migration marker for the current scope shape. */
  migration: TaxonomyRegistryMigrationKind;
  /** Explicit mapped scopes related through migration or retirement handling. */
  mappedScopes: string[];
};

/**
 * Input for writing the reserved taxonomy registry canonical doc.
 */
export type TaxonomyRegistryInput = {
  /** Target project slug. */
  project: string;
  /** Optional explicit date in `YYYY-MM-DD` format. */
  date?: string;
  /** Optional explicit document source. */
  source?: DocumentSource;
  /** Optional summary override for the registry canonical doc. */
  summary?: string;
  /** Registered scope entries to persist in the registry. */
  entries: TaxonomyRegistryEntry[];
  /** Optional supporting references for the registry canonical doc. */
  references?: string[];
};

/**
 * Input for bootstrapping one managed project tree and reserved registry surface.
 */
export type BootstrapProjectInput = {
  /** Target project slug. */
  project: string;
  /** Optional explicit date in `YYYY-MM-DD` format for the registry document. */
  date?: string;
  /** Optional explicit document source for the registry document. */
  source?: DocumentSource;
};

/**
 * Result returned after bootstrapping one managed project.
 */
export type BootstrapProjectResult = {
  /** Normalized project slug. */
  project: string;
  /** Relative paths for directories or files created during bootstrap. */
  created: string[];
  /** Deterministic relative path for the active taxonomy registry document. */
  registryRelativePath: string;
  /** Indicates whether the registry document was created during this call. */
  registryCreated: boolean;
};

/**
 * Input for auditing taxonomy consistency in one project.
 */
export type TaxonomyAuditInput = {
  /** Target project slug. */
  project: string;
};

/**
 * One concrete taxonomy audit finding.
 */
export type TaxonomyAuditIssue = {
  /** Stable issue code. */
  code: TaxonomyAuditIssueCode;
  /** Severity level for the finding. */
  severity: TaxonomyAuditIssueSeverity;
  /** Human-readable explanation of the finding. */
  message: string;
  /** Optional affected scope slug. */
  scope?: string;
  /** Related managed relative paths. */
  relativePaths: string[];
};

/**
 * Structured project audit result for taxonomy consistency.
 */
export type TaxonomyAuditResult = {
  /** Target project slug. */
  project: string;
  /** Deterministic reserved registry path for the project. */
  registryRelativePath: string;
  /** Number of parsed registry entries. */
  registryEntryCount: number;
  /** Indicates whether no error-severity findings were produced. */
  passed: boolean;
  /** Concrete findings produced by the audit. */
  issues: TaxonomyAuditIssue[];
};

/**
 * Parsed reserved registry document plus normalized entries.
 */
export type TaxonomyRegistryDocument = {
  /** Parsed canonical document backing the registry. */
  document: ParsedDocument;
  /** Normalized registry entries declared by the document. */
  entries: TaxonomyRegistryEntry[];
};

/**
 * Shared inputs needed to validate one canonical-doc write against taxonomy rules.
 */
export type CanonicalDocTaxonomyValidationInput = {
  /** Target project slug. */
  project: string;
  /** Canonical-doc topic slug or label. */
  topic: string;
  /** Declared registry scope slug. */
  registryScope: string;
  /** Lifecycle status being written for the document. */
  status: string;
};

/**
 * Shared explicit context used by taxonomy helpers.
 */
export type TaxonomyContext = {
  /** Shared repository context. */
  context: RepositoryContext;
};

/**
 * Returns `true` when the value is a supported registry entry state.
 */
export const isTaxonomyRegistryEntryState = (
  value: unknown,
): value is TaxonomyRegistryEntryState => {
  return isLiteralMember(TaxonomyRegistryEntryStateValues, value);
};

/**
 * Returns `true` when the value is a supported registry migration marker.
 */
export const isTaxonomyRegistryMigrationKind = (
  value: unknown,
): value is TaxonomyRegistryMigrationKind => {
  return isLiteralMember(TaxonomyRegistryMigrationKindValues, value);
};

/**
 * Returns `true` when the value is a supported taxonomy audit issue severity.
 */
export const isTaxonomyAuditIssueSeverity = (
  value: unknown,
): value is TaxonomyAuditIssueSeverity => {
  return isLiteralMember(TaxonomyAuditIssueSeverityValues, value);
};

/**
 * Returns `true` when the value is a supported taxonomy audit issue code.
 */
export const isTaxonomyAuditIssueCode = (
  value: unknown,
): value is TaxonomyAuditIssueCode => {
  return isLiteralMember(TaxonomyAuditIssueCodeValues, value);
};
