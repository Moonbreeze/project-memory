import { upsertRunbook } from "../../core/index.ts";
import {
  parseList,
  parseOptionalDocumentSource,
  parseOptionalDocumentStatus,
  printJson,
  requireFlag,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `upsert-runbook` CLI command.
 */
export const upsertRunbookCommand: CliCommandHandler = (flags, io) => {
  printJson(
    upsertRunbook({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
      purpose: requireFlag(flags, "purpose"),
      procedure: parseList(flags.procedure),
      verification: parseList(flags.verification),
      source: parseOptionalDocumentSource(flags.source),
      status: parseOptionalDocumentStatus(flags.status),
      date: flags.date,
    }),
    io,
  );
};
