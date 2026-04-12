import { appendSessionNoteCommand } from "./appendSessionNote.ts";
import { auditTaxonomyCommand } from "./auditTaxonomy.ts";
import { archiveDocumentCommand } from "./archiveDocument.ts";
import { archiveWorkItemCommand } from "./archiveWorkItem.ts";
import { bootstrapCommand } from "./bootstrap.ts";
import { commitPendingChangesCommand } from "./commitPendingChanges.ts";
import { closeWorkItemCommand } from "./closeWorkItem.ts";
import { createDecisionCommand } from "./createDecision.ts";
import { createRunbookCommand } from "./createRunbook.ts";
import { installCommand } from "./install.ts";
import { listDocumentsCommand } from "./listDocuments.ts";
import { readDocumentCommand } from "./readDocument.ts";
import { readColdStartCommand } from "./readColdStart.ts";
import { readPlanningBacklogCommand } from "./readPlanningBacklog.ts";
import { readPlanningTopicEntryCommand } from "./readPlanningTopicEntry.ts";
import { readRationaleEntryCommand } from "./readRationaleEntry.ts";
import { readTopicEntryCommand } from "./readTopicEntry.ts";
import { recordVerificationResultCommand } from "./recordVerificationResult.ts";
import { pushPendingChangesCommand } from "./pushPendingChanges.ts";
import { searchDocumentsCommand } from "./searchDocuments.ts";
import { upsertCanonicalDocCommand } from "./upsertCanonicalDoc.ts";
import { upsertProviderNoteCommand } from "./upsertProviderNote.ts";
import { upsertRunbookCommand } from "./upsertRunbook.ts";
import { upsertTaxonomyRegistryCommand } from "./upsertTaxonomyRegistry.ts";
import { upsertWorkItemCommand } from "./upsertWorkItem.ts";
import { webStartCommand } from "./webStart.ts";
import { webStatusCommand } from "./webStatus.ts";
import { webStopCommand } from "./webStop.ts";

import type { CliCommandHandler } from "../types.ts";

/**
 * CLI command handlers keyed by command name.
 */
export const cliCommandHandlers: Record<string, CliCommandHandler> = {
  install: installCommand,
  bootstrap: bootstrapCommand,
  "audit-taxonomy": auditTaxonomyCommand,
  "append-session-note": appendSessionNoteCommand,
  "record-verification-result": recordVerificationResultCommand,
  "upsert-provider-note": upsertProviderNoteCommand,
  "upsert-canonical-doc": upsertCanonicalDocCommand,
  "upsert-runbook": upsertRunbookCommand,
  "upsert-taxonomy-registry": upsertTaxonomyRegistryCommand,
  "upsert-work-item": upsertWorkItemCommand,
  "close-work-item": closeWorkItemCommand,
  "archive-work-item": archiveWorkItemCommand,
  "create-decision": createDecisionCommand,
  "create-runbook": createRunbookCommand,
  "list-documents": listDocumentsCommand,
  "search-documents": searchDocumentsCommand,
  "read-document": readDocumentCommand,
  "read-cold-start": readColdStartCommand,
  "read-planning-backlog": readPlanningBacklogCommand,
  "read-planning-topic-entry": readPlanningTopicEntryCommand,
  "read-topic-entry": readTopicEntryCommand,
  "read-rationale-entry": readRationaleEntryCommand,
  "commit-pending-changes": commitPendingChangesCommand,
  "push-pending-changes": pushPendingChangesCommand,
  "archive-document": archiveDocumentCommand,
  "web-start": webStartCommand,
  "web-status": webStatusCommand,
  "web-stop": webStopCommand,
};
