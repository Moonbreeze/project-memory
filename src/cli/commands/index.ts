import { appendSessionNoteCommand } from "./appendSessionNote.ts";
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
import { readRationaleEntryCommand } from "./readRationaleEntry.ts";
import { readTopicEntryCommand } from "./readTopicEntry.ts";
import { recordVerificationResultCommand } from "./recordVerificationResult.ts";
import { searchDocumentsCommand } from "./searchDocuments.ts";
import { upsertCanonicalDocCommand } from "./upsertCanonicalDoc.ts";
import { upsertProviderNoteCommand } from "./upsertProviderNote.ts";
import { upsertWorkItemCommand } from "./upsertWorkItem.ts";

import type { CliCommandHandler } from "../types.ts";

/**
 * CLI command handlers keyed by command name.
 */
export const cliCommandHandlers: Record<string, CliCommandHandler> = {
  install: installCommand,
  bootstrap: bootstrapCommand,
  "append-session-note": appendSessionNoteCommand,
  "record-verification-result": recordVerificationResultCommand,
  "upsert-provider-note": upsertProviderNoteCommand,
  "upsert-canonical-doc": upsertCanonicalDocCommand,
  "upsert-work-item": upsertWorkItemCommand,
  "close-work-item": closeWorkItemCommand,
  "archive-work-item": archiveWorkItemCommand,
  "create-decision": createDecisionCommand,
  "create-runbook": createRunbookCommand,
  "list-documents": listDocumentsCommand,
  "search-documents": searchDocumentsCommand,
  "read-document": readDocumentCommand,
  "read-cold-start": readColdStartCommand,
  "read-topic-entry": readTopicEntryCommand,
  "read-rationale-entry": readRationaleEntryCommand,
  "commit-pending-changes": commitPendingChangesCommand,
  "archive-document": archiveDocumentCommand,
};
