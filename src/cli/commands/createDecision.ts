import { createDecision } from "../../core/index.ts";
import {
  parseList,
  parseOptionalDocumentSource,
  parseOptionalDocumentStatus,
  printJson,
  requireFlag,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `create-decision` CLI command.
 */
export const createDecisionCommand: CliCommandHandler = (flags, io) => {
  printJson(
    createDecision({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
      context: requireFlag(flags, "context"),
      decision: requireFlag(flags, "decision"),
      consequences: parseList(flags.consequences),
      source: parseOptionalDocumentSource(flags.source),
      status: parseOptionalDocumentStatus(flags.status),
      date: flags.date,
      projectCommit: flags.projectCommit,
    }),
    io,
  );
};
