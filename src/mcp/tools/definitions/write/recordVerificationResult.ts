import { recordVerificationResultTool } from "../../recordVerificationResult.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

import { optionalDocumentMetadataProperties } from "./common.ts";

/**
 * MCP definition for `record_verification_result`.
 */
export const recordVerificationResultMcpTool: RegisteredMcpTool = {
  name: "record_verification_result",
  description:
    "Create one managed verification result document to capture concrete evidence from a test, review, or validation step. In the normal lifecycle this is the evidence-recording step after a meaningful check completes. Use it for what was checked and what happened, not for broad narrative context or future planning.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
      topic: {
        type: "string",
        description: "Verification topic slug or label.",
      },
      scope: {
        type: "string",
        description: "Verification target or scope.",
      },
      steps: {
        type: "array",
        description: "Executed verification steps.",
        items: {
          type: "string",
        },
      },
      result: {
        type: "string",
        description: "Verification outcome.",
      },
      ...optionalDocumentMetadataProperties,
    },
    ["project", "topic", "scope", "steps", "result"],
  ),
  handler: recordVerificationResultTool,
};
