import { createRunbook } from "../../core/index.ts";
import {
  parseList,
  parseOptionalDocumentSource,
  parseOptionalDocumentStatus,
  printJson,
  requireFlag,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `create-runbook` CLI command.
 */
export const createRunbookCommand: CliCommandHandler = (flags, io) => {
  printJson(
    createRunbook({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
      purpose: requireFlag(flags, "purpose"),
      procedure: parseList(flags.procedure),
      verification: parseList(flags.verification),
      source: parseOptionalDocumentSource(flags.source),
      status: parseOptionalDocumentStatus(flags.status),
      date: flags.date,
      projectCommit: flags.projectCommit,
    }),
    io,
  );
};
