import { recordVerificationResult } from "../../core/index.ts";
import {
  parseList,
  parseOptionalDocumentSource,
  parseOptionalDocumentStatus,
  printJson,
  requireFlag,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Handles the `record-verification-result` CLI command.
 */
export const recordVerificationResultCommand: CliCommandHandler = (flags, io) => {
  printJson(
    recordVerificationResult({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
      scope: requireFlag(flags, "scope"),
      steps: parseList(flags.steps),
      result: requireFlag(flags, "result"),
      source: parseOptionalDocumentSource(flags.source),
      status: parseOptionalDocumentStatus(flags.status),
      date: flags.date,
    }),
    io,
  );
};
