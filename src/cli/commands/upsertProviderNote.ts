import { upsertProviderNote } from "../../core/index.ts";
import {
  parseList,
  parseOptionalDocumentSource,
  parseOptionalDocumentStatus,
  printJson,
  requireFlag,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `upsert-provider-note` CLI command.
 */
export const upsertProviderNoteCommand: CliCommandHandler = (flags, io) => {
  printJson(
    upsertProviderNote({
      project: requireFlag(flags, "project"),
      topic: flags.topic ?? requireFlag(flags, "provider"),
      provider: requireFlag(flags, "provider"),
      overview: requireFlag(flags, "overview"),
      constraints: parseList(flags.constraints),
      guidance: parseList(flags.guidance),
      source: parseOptionalDocumentSource(flags.source),
      status: parseOptionalDocumentStatus(flags.status),
      date: flags.date,
    }),
    io,
  );
};
