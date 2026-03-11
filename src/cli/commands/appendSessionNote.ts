import { appendSessionNote } from "../../core/index.ts";
import {
  parseList,
  parseOptionalDocumentSource,
  parseOptionalDocumentStatus,
  printJson,
  requireFlag,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `append-session-note` CLI command.
 */
export const appendSessionNoteCommand: CliCommandHandler = (flags, io) => {
  printJson(
    appendSessionNote({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
      summary: requireFlag(flags, "summary"),
      actions: parseList(flags.actions),
      followUp: parseList(flags["follow-up"]),
      source: parseOptionalDocumentSource(flags.source),
      status: parseOptionalDocumentStatus(flags.status),
      date: flags.date,
      projectCommit: flags.projectCommit,
    }),
    io,
  );
};
