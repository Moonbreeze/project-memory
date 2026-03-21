import { createDecisionTool } from "../../createDecision.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createEnumStringSchema, createObjectSchema } from "../../schema.ts";

import { StableGuidanceReviewValues } from "../../../../core/types/index.ts";
import { optionalDocumentMetadataProperties } from "./common.ts";

/**
 * MCP definition for `create_decision`.
 */
export const createDecisionMcpTool: RegisteredMcpTool = {
  name: "create_decision",
  resultMode: "compact-document",
  description:
    "Create one managed decision record for durable rationale, chosen direction, and lasting constraints. Non-draft decisions must include an explicit stable-guidance review outcome. In the normal lifecycle this happens when policy or architecture changes after execution or investigation, not to track day-to-day execution progress.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
      topic: {
        type: "string",
        description: "Decision topic slug or label.",
      },
      context: {
        type: "string",
        description: "Decision context.",
      },
      decision: {
        type: "string",
        description: "Final decision statement.",
      },
      consequences: {
        type: "array",
        description: "Decision consequences.",
        items: {
          type: "string",
        },
      },
      stableGuidanceReview: createEnumStringSchema(
        StableGuidanceReviewValues,
        "Explicit stable-guidance review outcome for non-draft decisions. Draft decisions omit this field.",
      ),
      stableGuidanceReviewNote: {
        type: "string",
        description:
          "Optional note explaining the stable-guidance review outcome. Required for update-required and bootstrap-exempt outcomes.",
      },
      ...optionalDocumentMetadataProperties,
    },
    ["project", "topic", "context", "decision", "consequences"],
  ),
  handler: createDecisionTool,
};
