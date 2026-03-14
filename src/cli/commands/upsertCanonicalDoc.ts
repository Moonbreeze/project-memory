import { upsertCanonicalDoc } from "../../core/index.ts";
import {
  parseList,
  parseOptionalDocumentSource,
  parseOptionalDocumentStatus,
  printJson,
  requireFlag,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `upsert-canonical-doc` CLI command.
 */
export const upsertCanonicalDocCommand: CliCommandHandler = (flags, io) => {
  printJson(
    upsertCanonicalDoc({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
      registryScope: requireFlag(flags, "registry-scope"),
      summary: requireFlag(flags, "summary"),
      guidance: parseList(flags.guidance),
      references: parseList(flags.references),
      source: parseOptionalDocumentSource(flags.source),
      status: parseOptionalDocumentStatus(flags.status),
      date: flags.date,
      projectCommit: flags.projectCommit,
    }),
    io,
  );
};
