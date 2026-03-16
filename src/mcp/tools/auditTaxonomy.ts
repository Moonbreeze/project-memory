import { auditTaxonomyConsistency, createRepositoryContext } from "../../core/index.ts";
import { parseTaxonomyAuditInput } from "../types.ts";

/**
 * Executes the `audit_taxonomy` MCP tool.
 */
export const auditTaxonomyTool = (params: unknown): unknown => {
  return auditTaxonomyConsistency(parseTaxonomyAuditInput(params), createRepositoryContext());
};
