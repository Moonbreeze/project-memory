import type { RegisteredMcpTool } from "../toolTypes.ts";
import { bootstrapProjectMcpTool } from "./write/bootstrapProject.ts";
import { appendSessionNoteMcpTool } from "./write/appendSessionNote.ts";
import { createDecisionMcpTool } from "./write/createDecision.ts";
import { createRunbookMcpTool } from "./write/createRunbook.ts";
import { recordVerificationResultMcpTool } from "./write/recordVerificationResult.ts";
import { upsertCanonicalDocMcpTool } from "./write/upsertCanonicalDoc.ts";
import { upsertProviderNoteMcpTool } from "./write/upsertProviderNote.ts";
import { upsertRunbookMcpTool } from "./write/upsertRunbook.ts";
import { upsertTaxonomyRegistryMcpTool } from "./write/upsertTaxonomyRegistry.ts";
import { upsertWorkItemMcpTool } from "./write/upsertWorkItem.ts";

/**
 * MCP write-oriented tool definitions.
 */
export const writeMcpTools: Record<string, RegisteredMcpTool> = {
  bootstrap_project: bootstrapProjectMcpTool,
  append_session_note: appendSessionNoteMcpTool,
  record_verification_result: recordVerificationResultMcpTool,
  upsert_provider_note: upsertProviderNoteMcpTool,
  upsert_canonical_doc: upsertCanonicalDocMcpTool,
  upsert_runbook: upsertRunbookMcpTool,
  upsert_taxonomy_registry: upsertTaxonomyRegistryMcpTool,
  upsert_work_item: upsertWorkItemMcpTool,
  create_decision: createDecisionMcpTool,
  create_runbook: createRunbookMcpTool,
};
