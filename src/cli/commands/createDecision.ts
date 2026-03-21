import { createDecision } from "../../core/index.ts";
import {
  parseList,
  parseOptionalDocumentSource,
  parseOptionalDocumentStatus,
  parseOptionalStableGuidanceReview,
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
      stableGuidanceReview: parseOptionalStableGuidanceReview(flags["stable-guidance-review"]),
      stableGuidanceReviewNote: flags["stable-guidance-review-note"],
      source: parseOptionalDocumentSource(flags.source),
      status: parseOptionalDocumentStatus(flags.status),
      date: flags.date,
    }),
    io,
  );
};
